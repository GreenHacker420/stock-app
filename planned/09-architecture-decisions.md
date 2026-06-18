# 09 — Architecture Questions & Design Decisions

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

This document answers the 15 core architecture questions that must be resolved before implementation.

---

## Q1: Redis Pub/Sub vs Redis Streams for Webhook Events?

**Answer: BullMQ (built on Redis Streams) for job processing + Socket.IO Redis Adapter (built on Pub/Sub) for real-time delivery.**

| Concern | Pub/Sub | Streams (BullMQ) |
|---------|---------|-----------------|
| Durability | Fire-and-forget | Persisted until ACK |
| Consumer groups | Manual | Built-in |
| Replay on restart | No | Yes |
| Job retry | No | Yes |
| Overhead | Low | Medium |

**Decision:** 
- **Webhook processing** → BullMQ (Redis Streams) — durability + retry is essential
- **Socket.IO events** → Redis Pub/Sub adapter — low latency for real-time UI updates is priority
- Do NOT use raw Redis Pub/Sub for webhook processing — too fragile

---

## Q2: What triggers cache invalidation for credentials?

**Answer: Explicit invalidation on write operations + TTL-based expiry as safety net.**

Cache invalidation triggers:
1. `PATCH /whatsapp/integration` — update credentials → `invalidateCache(shopId)`
2. `DELETE /whatsapp/integration` — disconnect → `invalidateCache(shopId)`
3. Meta sends `account_update` webhook with `EVENT: TOKEN_EXPIRED` → `invalidateCache(shopId)` + alert
4. TTL expires (4 hours) → natural re-fetch from DB

**Important:** The `phoneNumberId → shopId` tenant resolution cache is invalidated separately from the credentials cache. Both must be invalidated when integration changes.

---

## Q3: Should we use per-shop HMAC validation or global app secret?

**Answer: Per-shop app secret stored in WaIntegration, with fallback to env variable for legacy setups.**

**Rationale:** If multiple shops use the same Meta App, they share the same App Secret. However, storing it per-shop allows future scenarios where shops use separate Meta Apps (e.g., enterprise setup). The current per-shop storage is correct.

**Security requirement:** If `WaIntegration.appSecret` is null and no `WHATSAPP_APP_SECRET` env is set → **REJECT** the webhook. Never silently accept unvalidated webhooks.

**Implementation:** Signature must be validated from the **raw request body buffer** (before JSON parsing). Express must be configured with `express.raw()` for the webhook route only.

---

## Q4: Is it safe to use a single webhook URL for all shops?

**Answer: Yes — recommended approach for all multi-tenant WhatsApp platforms.**

The single-webhook + `phone_number_id` resolution is the canonical multi-tenant pattern. All major WhatsApp BSPs (Twilio, 360dialog, Vonage) use this approach.

**Security:** The webhook URL itself doesn't need to be secret (Meta is the caller). Security comes from HMAC signature validation using the App Secret.

**Alternative (Webhook Override per phone number):** Available via Meta's Business Management API. Allows per-phone webhook URLs. Not recommended for V1 — adds complexity without proportional benefit. Could be used in V2 if shops use different Meta Apps.

---

## Q5: How do we handle BSUID (Business-Scoped User IDs) from Meta 2026?

**Answer: Store alongside phone, use phone as primary key for now, add BSUID field for future mapping.**

Starting June 2026, some users may hide their phone numbers. Meta provides a 30-day grace period where the real phone number is still returned. For Indian users (primary ShopControl market), this rollout is not immediate.

**Design decision:**
1. Keep `WaConversation.phone` as the primary identifier (existing data)
2. Add `WaConversation.bsuid` field for new conversations with hidden numbers
3. When BSUID is received without phone: `phone = "bsuid:${bsuid}"` (prefixed sentinel)
4. Customer matching: first try phone, then try BSUID
5. Do NOT break existing unique constraint — defer full redesign to when BSUID becomes widespread

---

## Q6: Should inbound webhook processing be synchronous or async?

**Answer: Async via BullMQ inbound queue. Validate → 200 → enqueue.**

**Synchronous processing (current approach) risks:**
1. Processing time > Meta's ~5 second timeout → Meta retries → duplicate processing spike
2. DB slowdown under burst → cascading failure
3. No retry if processing fails mid-way

**Async approach:**
1. Receive webhook → validate signature → push to `whatsapp-inbound` queue → return 200 immediately
2. Worker processes from queue with retry semantics
3. Idempotency ensures duplicates (from Meta retries) are handled safely

**Exception:** Webhook verification GET request is always synchronous (no processing needed).

---

## Q7: How do we handle duplicate status updates from Meta?

**Answer: Status rank map prevents regression + `WaWebhookEvent` table provides dedup.**

Two-layer deduplication:
1. **`WaWebhookEvent` table**: Hash-based primary key ensures exact duplicate events are skipped
2. **Status rank map**: Even if a duplicate slips through (different hash but same status), rank prevents regression:

```javascript
const STATUS_RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
if (newRank <= currentRank && currentStatus !== 'FAILED') return; // Skip
```

**Hash collision prevention:** For status events, hash key must include `metaMessageId` (not just timestamp + type):
```javascript
// Status event hash: type + metaMessageId (always present in status webhooks)
const key = `status:${event.metaMessageId}:${event.status}`;
```

---

## Q8: Should we cache the 24-hour window check in Redis?

**Answer: Yes — store `lastCustomerMessageAt` in Redis with automatic TTL.**

**Current implementation:** Every call to `canSendFreeText()` queries the DB.

**Optimized approach:**
```javascript
// When inbound message received from customer:
const windowKey = `wa:window:${conversationId}`;
await redis.setex(windowKey, 24 * 60 * 60, '1'); // 24-hour TTL

// canSendFreeText check:
async canSendFreeText(conversationId) {
  const windowOpen = await redis.exists(`wa:window:${conversationId}`);
  return windowOpen === 1;
}
```

**Benefit:** O(1) Redis check vs DB query. TTL auto-expires — no cleanup needed.

**Tradeoff:** If Redis is down, fall back to DB query (handled by try/catch).

---

## Q9: What is the broadcast audience limit per blast?

**Answer: Soft limit of 10,000 recipients per broadcast. Fan-out in batches of 500.**

**Reasoning:**
1. Meta rate limit: 80 msg/sec per phone number
2. 10,000 messages at 75 msg/sec = ~133 seconds (manageable)
3. Fan-out batch size: 500 jobs per `addBulk()` call to avoid BullMQ memory spikes

**For larger broadcasts:** Split into multiple broadcasts with different scheduled times.

**Template requirement:** ALL broadcast messages must use approved templates (can't send freeform outside 24h window to mass audience).

---

## Q10: How do we handle outbound rate limiting across multiple shops?

**Answer: Per-shop token bucket in Redis with 75 msg/sec limit.**

```javascript
// Each shop gets its own rate limit key
const rateLimitKey = `wa:rate:${shopId}`;

// Token bucket implementation:
async function consumeRateLimit(shopId) {
  const key = `wa:rate:${shopId}`;
  const limit = 75; // per second
  
  // Use Redis sliding window
  const now = Date.now();
  const windowStart = now - 1000;
  
  await redis.zremrangebyscore(key, 0, windowStart);
  const count = await redis.zcard(key);
  
  if (count >= limit) {
    throw new Error('RATE_LIMITED');
  }
  
  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, 2);
}
```

**BullMQ rate limiter alternative:** BullMQ has built-in rate limiting but it's global (all shops). Per-shop rate limiting requires custom Redis implementation.

---

## Q11: How should we handle the DLQ? Manual retry or auto?

**Answer: Manual retry only. DLQ requires owner attention — auto-retry without root cause fix is dangerous.**

**DLQ workflow:**
1. Message lands in DLQ → `WaMessage.status = FAILED`
2. Alert created for shop owner
3. Owner sees DLQ in dashboard with error details
4. Owner can: **Retry** (re-enqueue) or **Dismiss** (mark as abandoned)

**What NOT to do:** Auto-retry DLQ on schedule. If a message failed due to auth issues, rate limits, or wrong content — retrying without fix makes it worse.

**Exception:** If error is `RATE_LIMITED`, it can be auto-retried after a delay (since it's transient).

---

## Q12: How do we route calling webhooks to the right browser tab/window?

**Answer: Redis Pub/Sub → Socket.IO Redis Adapter → all active shop:${shopId} room members.**

When a call arrives:
1. Webhook handler publishes: `wa:calls:${shopId}` channel
2. All Node instances have Socket.IO Redis Adapter subscribed
3. Every tab with the shop open (in `shop:${shopId}` room) gets the notification
4. First staff member to click "Answer" sends accept request
5. Accept request includes `userId` — backend marks call as accepted by that user
6. Other tabs receive "call answered by [name]" notification

**Race condition handling:**
```javascript
// In accept handler:
const updated = await prisma.waCall.updateMany({
  where: { id: callId, status: 'RINGING' }, // Only if still RINGING
  data: { status: 'ACCEPTED', acceptedById: userId }
});

if (updated.count === 0) {
  throw new Error('Call already accepted by another staff member');
}
```

---

## Q13: Should we implement a Message Outbox pattern?

**Answer: No for V1. The current queue-on-create approach is sufficient with improved error handling.**

**Reasoning:**
- BullMQ is highly reliable. Connection failures are extremely rare.
- Adding the outbox pattern requires a sweeper job (complexity) and additional DB writes (overhead)
- V1 should focus on fixing the critical bugs (synchronous webhook, bypassed signature validation, template sync bug)
- The outbox can be added in V2 if message loss is observed in production

**V1 safeguard:** If BullMQ add fails (rare), catch the error and set `WaMessage.status = FAILED` immediately rather than leaving it as QUEUED orphan.

---

## Q14: How do we handle Flow endpoint encryption in production?

**Answer: RSA key pair generated per shop, private key stored encrypted using a master encryption key from env.**

```javascript
// Key generation flow (when shop enables Flow endpoint):
const { privateKey, publicKey } = await generateRsaKeyPair(2048);
const encryptedPrivateKey = aes256Encrypt(privateKey, process.env.MASTER_ENCRYPTION_KEY);

await prisma.waFlow.update({
  where: { id: flowId },
  data: {
    rsaPublicKey: publicKey,                 // Stored as PEM
    rsaPrivateKeyEncrypted: encryptedPrivateKey,  // Encrypted with master key
    endpointEnabled: true
  }
});

// Upload public key to Meta
await metaApi.uploadFlowPublicKey(wabaId, publicKey);
```

**Master encryption key management:**
- Store in environment variable (`MASTER_ENCRYPTION_KEY`)
- Rotate via key versioning (not in V1 scope)
- Consider Vault/AWS KMS for V2

---

## Q15: What's the Socket.IO room model for WhatsApp events?

**Answer: `shop:${shopId}` room (existing) + `conversation:${conversationId}` room (new) for targeted updates.**

```javascript
// Current rooms (keep)
shop:${shopId}     → All events for this shop's WhatsApp

// New rooms (add)
conversation:${conversationId}  → Events for a specific conversation
                                   (when staff has a conversation open)
```

**Event routing:**
- New message in any conversation → `shop:${shopId}` (for conversation list updates)
- Message in specific conversation → `conversation:${conversationId}` (for open chat window)
- Status update → both rooms
- Call event → `shop:${shopId}` only (needs all staff attention)

**Subscription model:**
```javascript
// When staff opens a conversation
socket.emit('conversation:join', { conversationId });

// Server joins them to conversation room
socket.on('conversation:join', ({ conversationId }) => {
  socket.join(`conversation:${conversationId}`);
});
```

---

## Summary: Architecture Decision Record

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Webhook processing | Async (BullMQ) | Reliability over simplicity |
| Tenant resolution | `phone_number_id` → Redis → DB | Standard multi-tenant pattern |
| Credential storage | Per-shop + cache | Isolation + performance |
| Credential encryption | Env master key (V1) | Pragmatic for startup scale |
| Socket.IO scaling | Redis Adapter | Standard, battle-tested |
| Real-time routing | Shop + Conversation rooms | Precision event delivery |
| Outbound rate limiting | Per-shop Redis token bucket | Prevents one shop throttling others |
| DLQ | Manual retry | Safety — avoid blind retries |
| Broadcast audience | 10K soft limit, 500 batch | Balance throughput + memory |
| BSUID handling | Phone prefix sentinel | Forward compatible, no migration needed |
| 24h window cache | Redis TTL key | O(1) check, auto-expiry |
| Flow encryption | RSA + AES-GCM, per-shop | Meta-required specification |
| Outbox pattern | Skip V1 | Complexity/benefit tradeoff |
| Idempotency | Dual-layer (WaWebhookEvent + status rank) | Belt-and-suspenders |
| Media Storage | Amazon S3 Only | Meta media IDs expire in 30 days; S3 is the only supported media store. |
| AI Infrastructure | Out of Scope | Exposes clean, pluggable REST and Event-based APIs for future AI layers. |
| Observability | Structured Logs + DB Logs | Basic local queue debugging via BullBoard; dashboard and admin portal out of scope. |
| ERP Decoupling | Decoupled Standalone Layer | ERP modules (Sales, Payments, DMs, etc.) consume APIs; no embedded business workflows. |
