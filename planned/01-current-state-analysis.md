# 01 — Current State Analysis: ShopControl WhatsApp

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

---

## 1. Existing File Inventory

| File | Role | Status |
|------|------|--------|
| `backend/prisma/schema.prisma` | Data models | EXISTS — WA models at L1125–L1272 + WaIntegration at L399 |
| `backend/src/controllers/whatsapp.controller.js` | Webhook + REST surface | EXISTS |
| `backend/src/routes/whatsapp.routes.js` | Route wiring | EXISTS |
| `backend/src/services/whatsapp.service.js` | Core service | EXISTS |
| `backend/src/services/whatsapp.processor.js` | Parser + event router | EXISTS |
| `backend/src/services/whatsapp.queue.js` | BullMQ queue wiring | EXISTS |
| `backend/src/utils/realtime.js` | Socket.IO helpers | EXISTS |

---

## 2. Data Schema — Current State

### WaIntegration (Shop-Level Credentials)

```prisma
model WaIntegration {
  id                    String   @id @default(cuid())
  shopId                String   @unique         // One integration per shop
  verifyToken           String
  accessToken           String                   // PLAINTEXT — ⚠️ security concern
  appSecret             String?                  // Nullable — breaks HMAC if missing
  businessAccountId     String
  phoneNumberId         String
  phoneNumber           String?
  businessName          String?
  status                WaIntegrationStatus      // CONNECTED | DISCONNECTED | ERROR
}
```

**Issues identified:**
1. `accessToken` stored as plaintext — must be encrypted at rest
2. `appSecret` is nullable — if unset, signature validation is bypassed (code explicitly returns `true`)
3. No `webhookCallbackUrl` field — webhook URL is baked into app configuration, not per-shop
4. No token expiry tracking — Meta system user tokens can expire
5. No `phoneNumberQuality` or `messagingLimitTier` — needed for rate awareness

---

### WaConversation

```prisma
model WaConversation {
  shopId                 String
  phone                  String
  @@unique([shopId, phone])   // CORRECT — tenant-scoped
  lastCustomerMessageAt  DateTime?              // Powers 24h window check
  unreadCount            Int       @default(0)
}
```

**Assessment:** Multi-tenant uniqueness constraint is correct (`shopId + phone`). The `lastCustomerMessageAt` field correctly models the 24-hour service window.

---

### WaMessage

```prisma
model WaMessage {
  metaMessageId          String?  @unique       // Dedup key
  direction              WaMessageDirection      // INBOUND | OUTBOUND
  status                 WaMessageStatus         // QUEUED | SENT | DELIVERED | READ | FAILED
  type                   WaMessageType           // TEXT | IMAGE | DOCUMENT | AUDIO | VIDEO | STICKER | TEMPLATE | FLOW
  content                Json?
  mediaId                String?
  mediaUrl               String?
}
```

**Issues identified:**
1. `mediaUrl` field — outbound media URLs are stored but not proxied through Meta's CDN lifecycle
2. No `retryCount` or `retryAt` — failed messages cannot be retried from job data alone
3. No `broadcastId` — individual messages cannot be traced to broadcast campaigns
4. Missing `INTERACTIVE` type (list, buttons, flows send via interactive type)
5. `templateId` is a nullable String — no FK to `WaTemplate`

---

### WaWebhookEvent (Deduplication Table)

```prisma
model WaWebhookEvent {
  id          String   @id   // SHA-256 hash of event payload key
  eventType   String
  processedAt DateTime @default(now())
}
```

**Assessment:** Correct pattern — hash-based primary key is used for idempotency. **Issue:** Hash is computed from `type + metaMessageId + timestamp`, but `metaMessageId` can be `null` for status events — possible collision if multiple events of same type arrive at the same timestamp.

---

### WaTemplate + WaFlow

```prisma
model WaTemplate {
  shopId     String                  // Shop-scoped ✓
  name       String
  language   String
  status     WaTemplateStatus        // APPROVED | REJECTED | PENDING | PAUSED | DISABLED | IN_APPEAL
  components Json                    // Raw Meta response
}

model WaFlow {
  shopId     String                  // Shop-scoped ✓  
  flowId     String?  @unique        // Meta Flow ID — unique but nullable
  status     WaFlowStatus            // DRAFT | PUBLISHED | DEPRECATED | BLOCKED | THROTTLED
  flowJson   Json?
}
```

**Issues identified:**
1. `WaTemplate` has no unique constraint on `(shopId, name, language)` — sync can create duplicates
2. `WaTemplateUsage` has no FK to `WaTemplate` — orphaned tracking
3. `WaFlow` flowId is `@unique` globally, not per-shop — prevents two shops from having the same Meta flow ID if they're in the same WABA
4. `WaFlowExecution` has no `contactId` field — can't show flow submissions per contact
5. No Flow RSA key pair fields for endpoint encryption

---

## 3. Controller Layer Analysis

### Webhook Verification (GET)

```js
async verifyWebhook(req, res) {
  const shopId = req.params.shopId || req.query.shopId;  // Via URL param or query
  // Looks up WaIntegration.verifyToken for this shopId
}
```

**Architecture:** Shop-specific webhook via URL parameter (`/whatsapp/webhook/:shopId`).  
**Problem:** Meta only allows ONE webhook callback URL per app. This pattern requires shopId to be embedded in the URL path. This works only if Meta is configured with the path `/whatsapp/webhook/<shopId>` per shop — which is non-standard and requires per-shop Meta app configuration.

**The correct multi-tenant approach:** Single webhook URL, resolve tenant from `metadata.phone_number_id` inside the payload.

---

### Signature Validation

```js
async #validateSignature(req, shopId) {
  const secret = integration?.appSecret || process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.warn(`No App Secret found for shop ${shopId}, skipping validation`);
    return true;  // ⚠️ CRITICAL BUG — returns true without validation
  }
}
```

**Critical security issue:** If `appSecret` is null and no env variable is set, the function returns `true` — accepting ALL webhooks, including forged ones.

---

### Webhook Processing (POST)

```js
async handleWebhook(req, res) {
  const events = parseWebhookPayload(payload);          // Synchronous parsing
  for (const event of events) {
    await processWhatsAppEvent(event, shopId, io);      // Sequential, in-request processing
  }
  res.status(200).json({ success: true });
}
```

**Critical performance issue:** Events are processed synchronously inside the HTTP request handler. Meta expects a 200 response within a short timeout (~5s). Under load, complex processing can exceed this. The result is Meta retrying webhooks — causing duplicate processing load.

**Correct pattern:** Ack immediately with 200, push events to BullMQ queue, process asynchronously.

---

## 4. Service Layer Analysis

### 24-Hour Window Check

```js
async canSendFreeText(conversationId) {
  const conversation = await prisma.waConversation.findUnique({ ... });
  const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
  return (now - lastMessageTime) <= twentyFourHoursInMs;
}
```

**Assessment:** Correct logic, but performs a DB query on every send. Should be cached.

**Pricing change awareness:** As of July 1, 2025, WhatsApp moved to per-message pricing for templates. Service messages (freeform replies within 24h) remain free. Utility templates within the 24h window are also free. Marketing/Authentication templates are charged per message regardless of window.

---

### Queue Architecture

```js
// whatsapp.queue.js — BullMQ Worker
const worker = new Worker("whatsapp-outbound", async (job) => {
  const { shopId, messageId, payload } = job.data;
  await whatsappService._sendDirect(shopId, { messageId, payload });
});
```

**Assessment:** BullMQ worker exists for outbound. However, **inbound webhook processing is still synchronous** — no BullMQ queue for inbound events.

---

### Template Sync — Bug

```js
await prisma.waTemplate.upsert({
  where: {
    id: (await prisma.waTemplate.findFirst({
      where: { shopId, name: t.name, language: t.language }
    }))?.id || "new-id"
  },
  ...
```

**Critical bug:** When no template exists, the `where: { id: "new-id" }` will FAIL with "Record to update not found" because `upsert` requires exact unique field matches. This means template sync silently fails on first run for new shops.

---

## 5. Real-time Layer Analysis

```js
// realtime.js — Socket.IO room model
socket.join(`shop:${shopId}`);          // Users join shop-specific rooms
io.to(`shop:${shopId}`).emit(...)       // Shop-scoped broadcasts
```

**Assessment:** Room model is correct for ShopControl's multi-shop architecture. Each shop gets its own Socket.IO room.

**Missing:** No Redis adapter for Socket.IO — will not work with multiple Node.js instances behind a load balancer. If two instances are running, a message received on Instance A emits only to sockets on Instance A.

---

## 6. Queue Layer Analysis

```js
// whatsapp.queue.js
const whatsappQueue = new Queue("whatsapp-outbound", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 }
  }
});
```

**Assessment:** Queue exists with retry config. However:
1. No Dead Letter Queue (DLQ) — permanently failed jobs are lost
2. No rate limiting at queue level — can exceed Meta's ~80 msg/sec limit
3. Queue name `whatsapp-outbound` — good, but no separate inbound queue
4. No job prioritization — payment notifications compete with bulk sends

---

## 7. Summary: Gap Analysis

| Category | Current State | Required State | Gap |
|----------|--------------|----------------|-----|
| Tenant Resolution | Via URL param `/:shopId` | Via `metadata.phone_number_id` | CRITICAL |
| Signature Validation | Bypassed if no appSecret | Always enforced | CRITICAL |
| Webhook Processing | Synchronous in-request | Async via BullMQ inbound queue | HIGH |
| Credential Security | Plaintext accessToken | Encrypted at rest | HIGH |
| Idempotency | Partial (hash-based) | Full (stable hash from metaMessageId) | MEDIUM |
| Socket.IO Scaling | Single-node | Redis adapter + pub/sub | HIGH |
| Template Sync | Bug (upsert fails) | Working upsert with proper unique key | MEDIUM |
| Rate Limiting | None | Per-shop token bucket (80 msg/sec) | HIGH |
| Dead Letter Queue | None | Separate DLQ with alerting | MEDIUM |
| Flows Support | Sync only, no E2EE endpoint | RSA/AES-GCM Flow endpoint | MEDIUM |
| Calling API | Not implemented | RTC Lite via BullMQ + Socket.IO | LOW (Phase 2) |
| Broadcast | Not implemented | Dispatcher → Fan-out → Per-contact queue | LOW (Phase 2) |
| Cache Layer | None | Redis cache for credentials + 24h window | MEDIUM |

---

## 8. App.js / Index.js Context

- BullMQ is imported and Redis connection is established at startup
- Socket.IO is attached to HTTP server — global.io pattern used
- No Redis adapter configured for Socket.IO

---

## 9. Preserved Strengths

These existing implementations are **correct and should be kept**:

1. `@@unique([shopId, phone])` on `WaConversation` — correct multi-tenant constraint
2. `lastCustomerMessageAt` for 24h window tracking
3. `WaWebhookEvent` hash-based deduplication table
4. BullMQ for outbound queue with exponential backoff
5. Shop-room Socket.IO model (`shop:${shopId}`)
6. `parseWebhookPayload` normalization layer — good separation of concerns
7. Status rank system preventing status regression (`DELIVERED → QUEUED`)
