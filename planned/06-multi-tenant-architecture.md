# 06 — Multi-Tenant Architecture & Webhook Processing Design

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

---

## 1. Multi-Tenancy Model in ShopControl

ShopControl has a specific multi-tenancy structure:

```
Business (Tenant)         → Isolated namespace
  └── Shop A              → Owns WaIntegration (phone A)
  └── Shop B              → Owns WaIntegration (phone B)
  └── Shop C              → Owns WaIntegration (phone C)
```

**One WhatsApp number per shop. All shops can be on the same Meta App (same webhook URL).**

Data isolation requirements:
- A customer's WaConversation is scoped to `shopId` — not globally unique
- `WaIntegration` is unique per `shopId`
- `WaTemplate`, `WaFlow`, `WaMessage` are all scoped to `shopId`

---

## 2. Tenant Resolution Flow

**Current (wrong):** URL path contains `shopId`
```
POST /api/whatsapp/webhook/:shopId
```

**Required (correct):** Single URL, resolve via payload
```
POST /api/whatsapp/webhook
        ↓
Parse metadata.phone_number_id
        ↓
Cache lookup: phone_number_id → shopId
        ↓
If cache miss: DB lookup → warm cache
        ↓
Continue processing with resolved shopId
```

### Tenant Resolution Cache Design

```
Key:   wa:tenant:<phoneNumberId>
Value: { shopId: "...", businessAccountId: "..." }
TTL:   4 hours
```

```javascript
// Pseudo-code for tenant resolver
async function resolveShopFromPhoneNumberId(phoneNumberId) {
  const cacheKey = `wa:tenant:${phoneNumberId}`;
  
  // 1. Check in-process memory cache (LRU, 1000 entries max)
  const memCached = memCache.get(cacheKey);
  if (memCached) return memCached;
  
  // 2. Check Redis
  const redisCached = await redis.get(cacheKey);
  if (redisCached) {
    const parsed = JSON.parse(redisCached);
    memCache.set(cacheKey, parsed);
    return parsed;
  }
  
  // 3. DB fallback
  const integration = await prisma.waIntegration.findUnique({
    where: { phoneNumberId },
    select: { shopId: true, businessAccountId: true }
  });
  
  if (!integration) throw new Error(`Unknown phone_number_id: ${phoneNumberId}`);
  
  // 4. Warm caches
  const value = { shopId: integration.shopId, ... };
  await redis.setex(cacheKey, 4 * 60 * 60, JSON.stringify(value));
  memCache.set(cacheKey, value);
  
  return value;
}
```

**Cache invalidation:** Call `invalidateTenantCache(phoneNumberId)` when:
- Shop disconnects WhatsApp integration
- Integration credentials are updated
- `phoneNumberId` changes (re-setup)

---

## 3. Webhook Processing Architecture

### Current Architecture (Synchronous — Wrong)

```
POST /webhook
  ↓ Validate signature (DB lookup)
  ↓ parseWebhookPayload() → [events]
  ↓ for event of events:
      await processWhatsAppEvent()  ← DB writes happen here
  ↓ return 200
```

**Problem:** Under load (burst of messages), this can exceed Meta's 5-second timeout.

### Proposed Architecture (Async — Correct)

```
POST /webhook
  ↓ Validate signature (FAST — from in-process cache)
  ↓ Return 200 immediately after validation
  ↓ Push raw payload to BullMQ inbound queue (background)
     ↓
     BullMQ Inbound Worker:
       ↓ parseWebhookPayload()
       ↓ resolveShopFromPhoneNumberId()
       ↓ for event of events:
           processWhatsAppEvent()
```

**Queue structure:**
```javascript
// Queue: whatsapp-inbound
{
  name: 'webhook-event',
  data: {
    rawPayload: <raw Meta webhook JSON>,
    receivedAt: <ISO timestamp>,
    signature: <original X-Hub-Signature-256>
  }
}
```

**Worker config:**
```javascript
const inboundWorker = new Worker('whatsapp-inbound', async (job) => {
  const { rawPayload } = job.data;
  const events = parseWebhookPayload(rawPayload);
  
  for (const event of events) {
    const { shopId } = await resolveShopFromPhoneNumberId(
      rawPayload.entry[0].changes[0].value.metadata.phone_number_id
    );
    await processWhatsAppEvent(event, shopId);
  }
}, {
  connection: redis,
  concurrency: 10,           // Process 10 webhook payloads in parallel
  removeOnComplete: { count: 0 },
  removeOnFail: { count: 100 }
});
```

---

## 4. Outbound Queue Architecture

### Current (Acceptable, needs extension)

```javascript
// Queue: whatsapp-outbound
// Worker: whatsapp.queue.js
// Per job: single message to Meta API
```

### Proposed Extensions

#### Rate Limiting Middleware

```javascript
// Per-shop token bucket: 75 msg/sec (below Meta's 80 limit)
const limiter = new BullMQ.RateLimiter({
  max: 75,
  duration: 1000  // per second
});

const outboundWorker = new Worker('whatsapp-outbound', processor, {
  connection: redis,
  limiter,        // Applied globally — need per-shop limiter
  concurrency: 20
});
```

**Per-shop rate limiting approach:**
```javascript
// Before each Meta API call in worker:
const rateLimitKey = `wa:rate:${shopId}`;
const allowed = await rateLimiter.consume(rateLimitKey, 1);
if (!allowed) {
  throw new Error('RATE_LIMITED'); // BullMQ will retry with backoff
}
```

#### Dead Letter Queue (DLQ)

```javascript
const dlqQueue = new Queue('whatsapp-dlq', { connection: redis });

outboundWorker.on('failed', async (job, error) => {
  if (job.attemptsMade >= job.opts.attempts) {
    // Move to DLQ after all retries exhausted
    await dlqQueue.add('failed-message', {
      originalJob: job.data,
      error: error.message,
      failedAt: new Date().toISOString(),
      shopId: job.data.shopId
    });
    
    // Update message status in DB
    await prisma.waMessage.update({
      where: { id: job.data.messageId },
      data: { status: 'FAILED', errorMessage: error.message }
    });
    
    // Alert shop owner
    // ... emit Socket.IO or notification
  }
});
```

#### Priority Queues

```javascript
// High priority: Payment notifications, order updates
await outboundQueue.add('send', data, { priority: 1 });

// Normal priority: Customer messages
await outboundQueue.add('send', data, { priority: 5 });

// Bulk priority: Broadcast campaigns  
await broadcastSendQueue.add('send', data, { priority: 10 });
```

---

## 5. Idempotency Design

### Inbound Message Idempotency

**Current implementation (keep and improve):**
```javascript
const eventId = `${event.type}:${event.metaMessageId}:${event.timestamp}`;
const hashedEventId = crypto.createHash('sha256').update(eventId).digest('hex');

const existingEvent = await prisma.waWebhookEvent.findUnique({
  where: { id: hashedEventId }
});
if (existingEvent) return; // Skip duplicate
```

**Issue to fix:** When `metaMessageId` is null (for some events), hash includes timestamp only — possible collision.

**Fix:**
```javascript
// For messages: use metaMessageId as primary key
const eventId = event.metaMessageId 
  ? `msg:${event.metaMessageId}`
  : `status:${event.type}:${event.metaMessageId}:${event.timestamp}`;
```

**Alternatively (Redis-based deduplication for speed):**
```javascript
const dedupeKey = `wa:dedup:${hashedEventId}`;
const alreadyProcessed = await redis.set(dedupeKey, '1', 'EX', 86400, 'NX');
if (!alreadyProcessed) return; // Already processed (NX = only set if not exists)
// Proceed with processing
```

### Outbound Idempotency Key

For outbound messages, generate an idempotency key stored in `WaMessage.id` and pass as header:
```
X-Idempotency-Key: <waMessage.id>
```

(Meta doesn't currently support idempotency keys for all endpoints, but having the concept in code prevents double-sends from worker retries.)

---

## 6. Redis Pub/Sub for Socket.IO Scaling

### Problem

Without pub/sub, Socket.IO rooms are local to each Node process. If the webhook is handled by Instance A but the user's browser is connected to Instance B, the browser won't receive the event.

### Solution: Redis Pub/Sub Bridge

```javascript
// Publisher (in webhook worker)
const channel = `wa:events:${shopId}`;
await redis.publish(channel, JSON.stringify({
  event: 'wa:message_received',
  data: { message, conversationId }
}));

// Subscriber (in each instance's startup)
const subscriber = redis.duplicate();
await subscriber.subscribe('wa:events:*'); // Pattern subscribe
subscriber.on('pmessage', (pattern, channel, message) => {
  const shopId = channel.split(':')[2];
  const { event, data } = JSON.parse(message);
  io.to(`shop:${shopId}`).emit(event, data);
});
```

**Alternative (recommended): Socket.IO Redis Adapter**

```javascript
import { createAdapter } from '@socket.io/redis-adapter';

const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
// Now io.to('shop:123').emit() works across ALL instances
```

The Redis adapter is simpler and handles all Socket.IO room management automatically.

---

## 7. Credential Cache Architecture

### Two-Level Cache (same pattern as Optimus)

```javascript
class WaCredentialsCache {
  // Level 1: In-process LRU cache
  static #memCache = new LRU({ max: 500, ttl: 4 * 60 * 1000 }); // 4 min
  
  // Level 2: Redis
  static async get(shopId) {
    const key = `wa:creds:${shopId}`;
    
    // Check memory first
    const mem = this.#memCache.get(key);
    if (mem) return mem;
    
    // Check Redis
    const cached = await redis.get(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      this.#memCache.set(key, parsed);
      return parsed;
    }
    
    // DB fallback
    const integration = await prisma.waIntegration.findUnique({
      where: { shopId },
      select: { accessToken: true, phoneNumberId: true, appSecret: true, status: true }
    });
    
    if (!integration || integration.status !== 'CONNECTED') return null;
    
    // Decrypt accessToken here if encrypted at rest
    const creds = {
      accessToken: decrypt(integration.accessToken),
      phoneNumberId: integration.phoneNumberId,
      appSecret: integration.appSecret
    };
    
    await redis.setex(key, 4 * 60 * 60, JSON.stringify(creds));
    this.#memCache.set(key, creds);
    return creds;
  }
  
  static async invalidate(shopId) {
    const key = `wa:creds:${shopId}`;
    this.#memCache.delete(key);
    await redis.del(key);
  }
}
```

**Cache invalidation triggers:**
- `POST /whatsapp/integration` (update credentials)
- `DELETE /whatsapp/integration` (disconnect)
- Meta token expiry webhook
- Admin action

---

## 8. Signature Validation Hardening

**Current state:** Validation can be bypassed if `appSecret` is null.

**Required state:** ALWAYS validate. If `appSecret` is missing, REJECT — do not process.

```javascript
async function validateWebhookSignature(rawBody, signatureHeader, shopId) {
  if (!signatureHeader) {
    throw new WebhookAuthError('Missing X-Hub-Signature-256 header');
  }
  
  const [algo, hash] = signatureHeader.split('=');
  if (algo !== 'sha256') {
    throw new WebhookAuthError('Invalid signature algorithm');
  }
  
  // Get appSecret from cache (FAST)
  const creds = await WaCredentialsCache.get(shopId);
  if (!creds?.appSecret) {
    throw new WebhookAuthError(`No appSecret configured for shop ${shopId}`);
  }
  
  const expectedHash = crypto
    .createHmac('sha256', creds.appSecret)
    .update(rawBody)
    .digest('hex');
  
  if (!crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(expectedHash, 'hex')
  )) {
    throw new WebhookAuthError('Invalid signature');
  }
}
```

**Raw body requirement:** Express must be configured to preserve raw body for webhook routes:
```javascript
app.use('/api/whatsapp/webhook', 
  express.raw({ type: '*/*', limit: '5mb' }),  // MUST be raw for HMAC
  webhookRouter
);
```

---

## 9. Complete Request Lifecycle

```
1. POST /api/whatsapp/webhook
   ├── express.raw() → req.body = Buffer
   ├── Parse metadata.phone_number_id from raw JSON (without affecting rawBody)
   ├── Resolve shopId from phone_number_id (cache)
   ├── Validate X-Hub-Signature-256 (cache for appSecret)
   ├── Return 200 immediately if valid
   └── Push to whatsapp-inbound BullMQ queue

2. BullMQ Worker: whatsapp-inbound
   ├── Deserialize raw payload
   ├── parseWebhookPayload() → normalized events[]
   ├── For each event:
   │   ├── Check Redis dedup key (idempotency)
   │   ├── Route to handler (status / inbound message / calls / flow)
   │   ├── DB write inside prisma.$transaction
   │   └── Publish to Redis pub/sub
   └── Socket.IO Redis adapter delivers to shop rooms

3. BullMQ Worker: whatsapp-outbound
   ├── Get credentials from cache
   ├── Apply per-shop rate limiter
   ├── POST to Meta API
   ├── Update WaMessage status
   └── Publish status update event
```

---

## 10. Error Handling Matrix

| Error Type | Action |
|-----------|--------|
| Invalid signature | Log + return 200 (don't reveal to attacker) |
| Unknown phone_number_id | Log + return 200 (Meta still gets 200) |
| DB write failure | BullMQ retry with exponential backoff |
| Meta API 429 (rate limit) | BullMQ retry with backoff + jitter |
| Meta API 500 | BullMQ retry 3 times, then DLQ |
| Meta API 401 (auth) | Invalidate credential cache + alert owner |
| Dedup: duplicate event | Silent skip, return 200 from BullMQ |
| Socket.IO emit failure | Log only (non-critical, event stored in DB) |

---

## 11. Shop Isolation Checklist

Every query must include `shopId` as filter:

```javascript
// ✅ Correct
prisma.waConversation.findMany({ where: { shopId } })

// ❌ Wrong — would return all conversations
prisma.waConversation.findMany({})

// ✅ Correct
prisma.waMessage.findMany({
  where: {
    conversation: { shopId }  // Via relation filter
  }
})
```

**Middleware enforcement:** Every WhatsApp route must have `requireShopAccess` middleware that verifies the requesting user has access to the `shopId` being accessed.

---

## 12. Standalone Platform Layer & AI Pluggability (AI/ERP Scope Out)

The WhatsApp integration layer is built as a standalone operations platform layer. It provides generic capabilities for template syncing, message routing, media downloading, and broadcast dispatching, but it implements no domain-specific business logic for ERP workflows and contains no AI components.

### Standalone Platform Boundaries
1. **Exposed REST & Service APIs**: The platform exposes clean service methods (e.g., `whatsappService.sendMessage()`, `whatsappBroadcastService.createBroadcast()`) and standard REST endpoints.
2. **ERP Decoupling**: ERP modules (Sales, Payments, Delivery Memos, Orders, Customer Management) are responsible for initiating message requests (like sending invoice links or receipt PDFs). The WhatsApp Platform Layer has no knowledge of these business objects and only accepts raw message payloads (text, templates, or media URLs).
3. **No Embedded Workflows**: No automatic triggers (e.g., "send invoice when sale is marked paid") are hardcoded in the WhatsApp layer.

### AI-Pluggable Interface (AI Infrastructure Scope Out)
AI infrastructure—including LLM integrations, RAG pipelines, conversation memory, and automated responders—is **strictly out of scope**. However, the platform remains AI-pluggable:
- **Inbound Event Hook**: The BullMQ inbound worker publishes parsed events (`wa:message_received`) via Redis Pub/Sub. A separate AI routing service can subscribe to these events to monitor and intercept customer conversations.
- **Outbound Direct Trigger**: External AI agents or services can reply to conversations in real-time by invoking the standard `sendMessage` service or REST route.
- **No Automated Responders**: No automated auto-replies, intent routing, or fallback bots are implemented in this codebase.

