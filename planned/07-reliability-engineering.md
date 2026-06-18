# 07 — Reliability Engineering: Outbox, DLQ & Broadcast Patterns

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

---

## 1. Core Reliability Principles

WhatsApp webhook delivery and message sending must be treated as a **distributed system**, not a simple HTTP integration. The key principles:

1. **At-least-once delivery** — Meta retries. Handlers must be idempotent.
2. **Out-of-order arrival** — Use `timestamp` fields, not arrival order.
3. **Async processing** — Never block Meta's webhook in synchronous processing.
4. **Explicit failure handling** — Failed messages must be persisted, not lost.
5. **Bounded retries** — Limit retries, then route to DLQ with alerting.
6. **Amazon S3 Media Storage** — All incoming media must be copied to AWS S3 immediately because Meta media links expire after 30 days. Amazon S3 is the *only* media storage backend. Do not use local disk, R2, GCS, Azure Blob, or MinIO.

---

## 2. Outbox Pattern for Outbound Messages

### Problem Without Outbox

```
Service.sendMessage()
  ├── Create WaMessage (QUEUED) in DB         ← OK
  ├── Add to BullMQ queue                     ← Can fail silently!
  └── If BullMQ unreachable, message is lost
```

### Outbox Pattern

The **outbox pattern** ensures no message is ever lost:

```
Service.sendMessage()
  └── DB $transaction:
      ├── Create WaMessage (QUEUED)
      └── Create WaOutboxEntry (PENDING)

BullMQ Outbox Sweeper (runs every 30 seconds):
  └── Find WaOutboxEntry WHERE status=PENDING AND age > 10s
      └── For each entry:
          ├── Add to whatsapp-outbound BullMQ queue (if not already queued)
          └── Update WaOutboxEntry.status = ENQUEUED
```

### WaOutboxEntry Schema Design

```prisma
model WaOutboxEntry {
  id            String   @id @default(cuid())
  shopId        String
  messageId     String   @unique   // FK to WaMessage
  status        WaOutboxStatus @default(PENDING)
  enqueuedAt    DateTime?
  processedAt   DateTime?
  createdAt     DateTime @default(now())
  
  shop          Shop     @relation(...)
}

enum WaOutboxStatus {
  PENDING    // Created but not yet in queue
  ENQUEUED   // Added to BullMQ
  PROCESSED  // Successfully sent
  FAILED     // Moved to DLQ
}
```

**Benefits:**
1. Message creation and queue addition are **transactionally safe**
2. Sweeper picks up missed entries on startup after crash
3. Full audit trail of message lifecycle

**Alternative (simpler, acceptable for V1):** If BullMQ connection is reliable, the current `sendMessage()` approach (create + immediately queue) is acceptable. The outbox pattern adds complexity. For ShopControl V1, use the current approach but add DLQ handling.

---

## 3. Dead Letter Queue (DLQ)

### Design

```javascript
// Queue: whatsapp-dlq
// Items land here when all BullMQ retries exhausted

const dlqQueue = new Queue('whatsapp-dlq', {
  connection: redis
});

// In outbound worker:
const outboundWorker = new Worker('whatsapp-outbound', processor, {
  connection: redis,
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 }
});

outboundWorker.on('failed', async (job, error) => {
  if (job.attemptsMade >= job.opts.attempts) {
    // Move to DLQ
    await dlqQueue.add('failed-message', {
      originalData: job.data,
      failedAt: new Date().toISOString(),
      lastError: error.message,
      attemptsMade: job.attemptsMade
    }, {
      removeOnComplete: false,  // Keep DLQ items for investigation
      removeOnFail: false
    });
    
    // Update DB
    await prisma.waMessage.update({
      where: { id: job.data.messageId },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
        failedAt: new Date()
      }
    });
    
    // Create system alert for owner
    await createAlert({
      shopId: job.data.shopId,
      type: 'WA_MESSAGE_FAILED',
      severity: 'HIGH',
      message: `WhatsApp message failed after ${job.attemptsMade} attempts: ${error.message}`,
      metadata: { messageId: job.data.messageId }
    });
  }
});
```

### DLQ Management API

```
GET  /api/whatsapp/dlq                    → List failed messages
POST /api/whatsapp/dlq/:id/retry          → Re-queue a specific message
POST /api/whatsapp/dlq/retry-all          → Re-queue all failed messages
DELETE /api/whatsapp/dlq/:id              → Dismiss permanently
```

---

## 4. BullMQ Configuration Reference

### Queue Configuration

```javascript
// Shared queue options
const sharedQueueOptions = {
  connection: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false  // Keep failed jobs for investigation
  }
};

// Queues
const inboundQueue = new Queue('whatsapp-inbound', sharedQueueOptions);
const outboundQueue = new Queue('whatsapp-outbound', {
  ...sharedQueueOptions,
  defaultJobOptions: {
    ...sharedQueueOptions.defaultJobOptions,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000  // 2s, 4s, 8s
    }
  }
});
const broadcastDispatchQueue = new Queue('whatsapp-broadcast-dispatch', sharedQueueOptions);
const broadcastSendQueue = new Queue('whatsapp-broadcast-send', {
  ...sharedQueueOptions,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 }
  }
});
const dlqQueue = new Queue('whatsapp-dlq', sharedQueueOptions);
```

---

## 5. Broadcast Messaging Architecture

### Use Cases for ShopControl

| Broadcast Type | Audience | Trigger |
|---------------|---------|---------|
| Payment Reminder | All customers with outstanding > X days | Owner manual / scheduled |
| DM Follow-up | Customers with pending DMs | Owner manual / scheduled |
| Low Stock Alert | Selected customers | Owner manual |
| GST Invoice Ready | Customers with pending invoices | Owner manual |
| Promotional | All customers or filtered subset | Owner manual |

### Two-Stage Fan-Out Architecture (from Optimus)

```
Stage 1: Dispatch Job
  ├── Resolve audience (filter from Customer table)
  ├── Freeze audience snapshot at dispatch time
  ├── Set Redis counter: broadcast:<id>:remaining = N
  └── Enqueue N BroadcastSend jobs (in batches of 500)

Stage 2: Send Jobs (N parallel)
  ├── Get customer phone
  ├── Check if customer has WaConversation (or create)
  ├── Send template message via Meta API
  ├── Create WaBroadcastRecipient record
  └── redis.DECR(broadcast:<id>:remaining) → if 0, mark complete
```

### Schema Design

```prisma
model WaBroadcast {
  id                  String   @id @default(cuid())
  shopId              String
  name                String
  status              WaBroadcastStatus @default(DRAFT)
  templateId          String?
  templateVariables   Json?              // Variable mappings
  audienceFilter      Json?              // Filter criteria
  audienceCount       Int                @default(0)
  sentCount           Int                @default(0)
  deliveredCount      Int                @default(0)
  readCount           Int                @default(0)
  failedCount         Int                @default(0)
  scheduledAt         DateTime?
  startedAt           DateTime?
  completedAt         DateTime?
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  
  shop                Shop               @relation(...)
  template            WaTemplate?        @relation(...)
  recipients          WaBroadcastRecipient[]
}

model WaBroadcastRecipient {
  id              String   @id @default(cuid())
  broadcastId     String
  customerId      String
  customerPhone   String
  status          WaBroadcastRecipientStatus @default(PENDING)
  metaMessageId   String?
  errorMessage    String?
  sentAt          DateTime?
  deliveredAt     DateTime?
  readAt          DateTime?
  
  broadcast       WaBroadcast @relation(...)
  customer        Customer    @relation(...)
}

enum WaBroadcastStatus {
  DRAFT
  SCHEDULED
  SENDING
  COMPLETED
  CANCELLED
  FAILED
}

enum WaBroadcastRecipientStatus {
  PENDING
  SENT
  DELIVERED
  READ
  FAILED
  SKIPPED    // No phone number, outside window, opted out
}
```

### Audience Filter Spec

```json
{
  "filters": [
    { "field": "outstanding", "op": "gt", "value": 0 },
    { "field": "lastPurchaseDays", "op": "lte", "value": 90 },
    { "field": "hasGstPending", "op": "eq", "value": true }
  ],
  "limit": 1000,
  "sortBy": "lastPurchaseAt",
  "sortOrder": "desc"
}
```

### Redis Counter Pattern

```javascript
// Dispatcher sets counter
await redis.set(`broadcast:${broadcastId}:remaining`, audience.length);

// Each send worker decrements
const remaining = await redis.decr(`broadcast:${broadcastId}:remaining`);
if (remaining <= 0) {
  await prisma.waBroadcast.update({
    where: { id: broadcastId },
    data: { status: 'COMPLETED', completedAt: new Date() }
  });
  await redis.del(`broadcast:${broadcastId}:remaining`);
}
```

---

## 6. Retry Strategy Matrix

| Scenario | Retry Config | Backoff | After Max Retries |
|---------|-------------|---------|-------------------|
| Meta API 429 (rate limit) | 5 retries | Exponential + jitter (2s base) | DLQ |
| Meta API 5xx | 3 retries | Exponential (2s base) | DLQ |
| Meta API 400 (bad request) | 0 retries | N/A | DLQ immediately |
| Meta API 401 (auth) | 0 retries | N/A | DLQ + alert + invalidate cache |
| DB connection error | 3 retries | Fixed 1s | DLQ |
| Rate limit exceeded | 3 retries | Exponential with jitter | DLQ |
| Unknown error | 3 retries | Exponential | DLQ |

### Jitter Implementation

```javascript
function exponentialBackoffWithJitter(attempt, baseDelay = 1000, maxDelay = 30000) {
  const exponential = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * 0.5 * exponential; // ±25% jitter
  return exponential + jitter;
}
```

---

## 7. Status Update Flow (Inbound Webhooks)

### Message Status Lifecycle

```
QUEUED (local only)
  ↓ Meta API call succeeds
SENT (has metaMessageId)
  ↓ Meta delivers to recipient
DELIVERED
  ↓ Recipient opens
READ
  ↓ (terminal state)
```

Or:

```
QUEUED
  ↓ Meta API call fails
FAILED (has errorMessage)
  ↓ (terminal state)
```

### Status Rank Map (Prevent Regression)

```javascript
const MESSAGE_STATUS_RANK = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4
};

// Only update if new status has higher rank
const shouldUpdate = nextStatusRank > currentStatusRank || 
                     nextStatus === 'FAILED'; // FAILED always wins
```

---

## 8. Health Monitoring & Audit Trails (Observability Scope Out)

Dedicated observability dashboards, custom monitoring platforms, and Super Admin UI portals are **strictly out of scope** for the current WhatsApp integration layer. Monitoring is handled via:
1. **Structured Logging:** Standard structured console logging (JSON in production, dev logging in development) capturing key queue activities, job failures, API latency, and authentication statuses.
2. **Operational Audit Trails:** Audit trails stored directly in PostgreSQL (via Prisma models) documenting key status transitions and errors.
3. **Queue Health Endpoint:** A basic JSON health-check endpoint for integration awareness.

### Integration Health Check Endpoint
```
GET /api/whatsapp/health?shopId=<shopId>

Response:
{
  "integration": "CONNECTED",
  "phoneNumber": "+91 98765 43210",
  "quality": "HIGH",
  "messagingLimit": "TIER_1K",
  "queueDepth": {
    "inbound": 12,
    "outbound": 3,
    "dlq": 0
  },
  "lastWebhookAt": "2026-06-18T10:30:00Z",
  "lastSentAt": "2026-06-18T10:29:00Z"
}
```

---

## 9. Queue Topology Summary

```
Meta Webhook
     ↓
[whatsapp-inbound] ── Workers (10 concurrent) ─→ DB writes + pub/sub
     ↓ (on inbound media message)
[whatsapp-media-download] ── Worker (5 concurrent) ─→ Download from Meta → Upload to AWS S3 → Update DB

Owner/Staff Action  
     ↓
[whatsapp-outbound] ── Workers (20 concurrent, rate limited) ─→ Meta API
     ↓ (on failure after N retries)
[whatsapp-dlq] ── Operational queue retries + owner alerts

Broadcast Action
     ↓
[whatsapp-broadcast-dispatch] ── Dispatcher ─→ Fan-out to:
[whatsapp-broadcast-send] ── Workers (10 concurrent) ─→ Meta API
```

---

## 10. Queue Debugging (Development-Only)

For local development and testing, BullBoard is installed as a development-only helper. Production deployments **will not** expose this dashboard.

```javascript
// Local dev only helper (if process.env.NODE_ENV === 'development')
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(inboundQueue),
    new BullMQAdapter(outboundQueue),
    new BullMQAdapter(broadcastDispatchQueue),
    new BullMQAdapter(broadcastSendQueue),
    new BullMQAdapter(dlqQueue)
  ],
  serverAdapter
});

app.use('/admin/queues', 
  devAuthMiddleware, // Protect with dev-only credentials
  serverAdapter.getRouter()
);
```

---

## 11. Node.js Process Model

### Development
```
Single process: API + Workers
```

### Production
```
Process 1: API server (webhook receiver, REST API)
Process 2: WhatsApp Worker (inbound + outbound + broadcast + media workers)
```

Starting workers:
```javascript
// worker.js (separate entry point)
import { startWhatsAppWorkers } from './src/workers/whatsapp/index.js';
await startWhatsAppWorkers();
```

Or use a single binary with role detection:
```javascript
// index.js
if (process.env.ROLE === 'api') startAPI();
if (process.env.ROLE === 'worker') startWorkers();
if (!process.env.ROLE) { startAPI(); startWorkers(); } // Development
```

---

## 12. Media Storage Architecture (Amazon S3 Only)

Amazon S3 is the **only** supported media storage backend. No other storage options (R2, MinIO, GCS, Azure Blob, or local filesystem) are designed or permitted.

### Inbound Media Flow
1. **Inbound Webhook Event**: An incoming message containing media (`IMAGE`, `DOCUMENT`, `AUDIO`, `VIDEO`) is parsed. It contains a Meta `mediaId`.
2. **Enqueue Download Job**: The inbound queue processor inserts a job into the `whatsapp-media-download` queue containing `{ shopId, messageId, mediaId, mimeType }`.
3. **Execute Download**: The media-download worker:
   - Fetches the media URL from Meta using the shop's Graph API credentials: `GET /v25.0/<mediaId>`
   - Downloads the binary stream from Meta's URL.
   - Uploads the stream to the configured Amazon S3 bucket using the AWS SDK (`@aws-sdk/client-s3`) under the path `shops/${shopId}/media/${mediaId}`.
   - Updates the corresponding `WaMessage` record in the database with the S3 URL, `s3Key`, and `s3Bucket`.
   - Emits a Socket.IO event notifying the frontend that media has successfully loaded.

### Outbound Media Flow
1. **Upload to S3**: The frontend uploads a file to a general S3 upload route. The backend uploads directly to the Amazon S3 bucket and returns the S3 URL.
2. **Queue Outbound Message**: When sending the outbound message, the backend stores the S3 URL in `WaMessage.mediaUrl` and enqueues the job in `whatsapp-outbound`.
3. **Send to Meta**: The outbound worker fetches the message, reads `mediaUrl`, generates a pre-signed S3 URL if the bucket is private (using `@aws-sdk/s3-request-presigner`), and calls Meta's Graph API `/messages` endpoint using the link:
   ```json
   {
     "messaging_product": "whatsapp",
     "recipient_type": "individual",
     "to": "...",
     "type": "image",
     "image": {
       "link": "https://s3.amazonaws.com/your-bucket/shops/123/media/abc.jpg?Signature=..."
     }
   }
   ```
4. **Link Expiry**: Presigned URLs must be valid for at least 1 hour to ensure Meta's CDN has ample time to ingest the media.
