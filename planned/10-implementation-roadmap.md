# 10 — Implementation Roadmap

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

---

## Overview

The WhatsApp platform implementation is divided into **3 phases**, each delivering production-ready, incremental value. No phase is left in a broken state.

**Critical gate:** Phase 0 (this dossier) must be reviewed and approved before Phase 1 begins.

---

## Phase 1: Core Infrastructure Hardening (Foundation)

**Goal:** Fix all critical bugs in the existing implementation, refactor to async webhook processing, implement multi-tenant credential caching.

**Duration:** Estimated 2-3 weeks of engineering work.

---

### Phase 1 Deliverables

#### 1.1 — Schema Migration: Core Fixes + Additions

**Files to modify:**
- `backend/prisma/schema.prisma`

**Changes (in this order):**
1. Add `WaIntegration.@@index([phoneNumberId])`
2. Add `WaIntegration.messagingLimitTier`, `qualityRating`, `callingEnabled`, `connectedAt`, `lastWebhookAt`
3. Fix `WaTemplate.@@unique([shopId, name, language])` (removes duplicate sync bug)
4. Fix `WaFlow.@@unique([shopId, flowId])` → drop global `flowId @unique`, add composite
5. Add `WaConversation.isArchived`, `isPinned`, `assignedToId`
6. Add `WaMessage.payload`, `retryCount`, `lastRetryAt`, `s3Key`, `s3Bucket`
7. Add new `WaMessageType` enum values: `INTERACTIVE`, `LOCATION`, `CONTACT_CARD`, `REACTION`, `UNSUPPORTED`
8. Add `WaWebhookEvent.shopId` + `@@index([processedAt])`
9. Create `WaBroadcast` model
10. Create `WaBroadcastRecipient` model
11. Add `WaBroadcastStatus` enum
12. Add `WaBroadcastRecipientStatus` enum

---

#### 1.2 — Credential Cache Layer

**New file:** `backend/src/lib/wa-cache.js`

```javascript
// Exports:
export async function getWaCredentials(shopId) → { accessToken, phoneNumberId, appSecret }
export async function invalidateWaCredentials(shopId)
export async function getTenantByPhoneNumberId(phoneNumberId) → { shopId }
export async function warmTenantCache()  // Called at startup
```

**Cache keys:**
- `wa:creds:<shopId>` → TTL: 4h
- `wa:tenant:<phoneNumberId>` → TTL: 4h
- `wa:window:<conversationId>` → TTL: 24h (managed by processor)

---

#### 1.3 — Webhook Hardening

**Files to modify:**
- `backend/src/controllers/whatsapp.controller.js`
- `backend/src/app.js`

**Changes:**
1. `app.js`: Add `express.raw()` for webhook route (before JSON parsing)
2. `handleWebhook()`: Resolve tenant from `metadata.phone_number_id` (not URL param)
3. `#validateSignature()`: Use cached `appSecret`, REJECT (not accept) if missing
4. `handleWebhook()`: Push to BullMQ inbound queue → return 200 IMMEDIATELY
5. Remove synchronous `processWhatsAppEvent()` call from webhook handler

---

#### 1.4 — Inbound Queue Worker

**New file:** `backend/src/workers/whatsapp/inbound.worker.js`

```javascript
// Worker: whatsapp-inbound
// Concurrency: 10
// On each job:
//   1. Resolve shopId from phone_number_id (via cache)
//   2. parseWebhookPayload(rawPayload)
//   3. For each event: processWhatsAppEvent(event, shopId)
```

---

#### 1.5 — Outbound Worker Improvements

**Files to modify:**
- `backend/src/services/whatsapp.queue.js`

**Changes:**
1. Use credential cache instead of DB lookup on every send
2. Add per-shop rate limiting (Redis sliding window)
3. Add DLQ handling on max retry exceeded
4. Add alert creation on DLQ entry

---

#### 1.6 — Socket.IO Redis Adapter

**Files to modify:**
- `backend/src/index.js` (or app startup)

**Changes:**
```javascript
import { createAdapter } from '@socket.io/redis-adapter';
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

---

#### 1.7 — Template Sync Bug Fix

**Files to modify:**
- `backend/src/services/whatsapp.service.js`

**Fix the broken upsert:**
```javascript
// Old (broken):
await prisma.waTemplate.upsert({
  where: { id: findResult?.id || "new-id" }  // ← crashes with "new-id"
});

// New (correct):
await prisma.waTemplate.upsert({
  where: { shopId_name_language: { shopId, name: t.name, language: t.language } },
  update: { status: t.status, category: t.category, components: t.components },
  create: { shopId, name: t.name, language: t.language, ... }
});
```

---

#### 1.8 — WhatsApp Service Refactor

**Files to modify:**
- `backend/src/services/whatsapp.service.js`

**Changes:**
1. `getIntegration()` → use credential cache
2. `canSendFreeText()` → use Redis window key instead of DB
3. `syncTemplates()` → fix upsert (see 1.7)
4. `syncFlows()` → fix upsert with `shopId + flowId` composite key

---

#### 1.9 — Broadcast Service

**New file:** `backend/src/services/whatsapp.broadcast.service.js`

```javascript
// Exports:
export async function createBroadcast(shopId, { name, templateId, audienceFilter })
export async function scheduleBroadcast(broadcastId, scheduledAt)
export async function dispatchBroadcast(broadcastId)  // Triggered by dispatcher worker
export async function cancelBroadcast(broadcastId)
export async function getBroadcastStats(broadcastId)
```

---

#### 1.10 — Broadcast Workers

**New file:** `backend/src/workers/whatsapp/broadcast-dispatcher.worker.js`
**New file:** `backend/src/workers/whatsapp/broadcast-send.worker.js`

Same pattern as Optimus:
1. **Dispatcher:** Resolves audience → sets Redis counter → fans out to send queue
2. **Sender:** Sends one message → updates recipient → decrements counter → if 0, complete

---

#### 1.11 — Route: Broadcasts

**Files to modify:**
- `backend/src/routes/whatsapp.routes.js`

**New routes:**
```
GET    /whatsapp/broadcasts                    → List broadcasts
POST   /whatsapp/broadcasts                    → Create broadcast
GET    /whatsapp/broadcasts/:id                → Get broadcast + stats
POST   /whatsapp/broadcasts/:id/send           → Dispatch immediately
POST   /whatsapp/broadcasts/:id/schedule       → Schedule for later
DELETE /whatsapp/broadcasts/:id/cancel         → Cancel
GET    /whatsapp/broadcasts/:id/recipients     → Paginated recipient list
```

---

#### 1.12 — Worker Entry Point

**New file:** `backend/src/workers/index.js`

```javascript
import { startInboundWorker } from './whatsapp/inbound.worker.js';
import { startOutboundWorker } from './whatsapp/outbound.worker.js';
import { startBroadcastDispatcherWorker } from './whatsapp/broadcast-dispatcher.worker.js';
import { startBroadcastSendWorker } from './whatsapp/broadcast-send.worker.js';
import { startMediaDownloadWorker } from './whatsapp/media-download.worker.js';

export async function startAllWorkers() {
  await startInboundWorker();
  await startOutboundWorker();
  await startBroadcastDispatcherWorker();
  await startBroadcastSendWorker();
  await startMediaDownloadWorker();
}
```

---

#### 1.13 — S3 Media Download Worker & S3 Library

**New file:** `backend/src/lib/wa-media.js`
- Contains utility functions for interacting with AWS S3 using `@aws-sdk/client-s3`.
- Exports:
  - `uploadToS3(streamOrBuffer, key, mimeType)`: Uploads binary to the S3 bucket.
  - `getSignedMediaUrl(key)`: Generates a pre-signed URL for private media delivery (expires in 1 hour).

**New file:** `backend/src/workers/whatsapp/media-download.worker.js`
- Worker: `whatsapp-media-download`
- Concurrency: 5
- Listens to jobs queued by the inbound webhook worker when media messages are received.
- Processes:
  1. Retrieves Meta media URL from Graph API using cached shop credentials.
  2. Downloads media binary from Meta's endpoint.
  3. Uploads media to Amazon S3 bucket under `shops/${shopId}/media/${mediaId}`.
  4. Updates `WaMessage` with S3 URL (`mediaUrl`), `s3Key`, and `s3Bucket`.
  5. Triggers real-time Socket.IO emission to update UI.

---

#### 1.14 — Standalone Platform Layer Endpoint Architecture

The WhatsApp Platform Layer serves as a standalone component that exposes clean APIs. ERP modules (Sales, Payments, DMs, etc.) interact with it purely by calling service methods or POST routes. No hardcoded domain-specific ERP triggers reside inside the WhatsApp Platform codebase.

---

### Phase 1: Verification Checklist

- [ ] Webhook receives POST → returns 200 in < 100ms
- [ ] Tenant resolved from `phone_number_id` (not URL param)
- [ ] Signature validation rejects unsigned webhooks
- [ ] Inbound events processed via BullMQ worker
- [ ] Idempotency: sending same webhook twice → only one message created
- [ ] Credential cache: second webhook for same shop → no DB query for creds
- [ ] Template sync: works on empty shop (no duplicate/crash)
- [ ] Broadcast creates and sends to test audience
- [ ] Socket.IO events delivered across multiple instances (via Redis adapter)

---

## Phase 2: Advanced Features

**Goal:** WhatsApp Flows E2EE endpoints, RTC Lite Calling, conversation assignment, conversation archive.

**Duration:** Estimated 3-4 weeks of engineering work.  
**Prerequisite:** Phase 1 fully deployed and stable.

---

### Phase 2 Deliverables

#### 2.1 — Schema Migration: Phase 2

1. Create `WaCall` model (see Document 08)
2. Add `WaCallDirection`, `WaCallStatus` enums
3. Add `WaFlow.endpointEnabled`, `rsaPublicKey`, `rsaPrivateKeyEncrypted`
4. Modify `WaFlowExecution`: add `customerId`, `flowToken`, `sentAt`, `submittedAt`

---

#### 2.2 — WhatsApp Flows E2EE Endpoint

**New file:** `backend/src/controllers/whatsapp.flow-endpoint.controller.js`

```
GET  /whatsapp/flow-endpoint/:shopId   → Meta verification
POST /whatsapp/flow-endpoint/:shopId   → Decrypt + process + encrypt response
```

**Key operations:**
1. Verify `X-Hub-Signature-256`
2. Decrypt payload using shop's RSA private key + AES-GCM
3. Route to business logic based on `screen` and `action` in decrypted payload
4. Encrypt response with same AES key
5. Return base64-encoded encrypted response

---

#### 2.3 — Flow Management Routes

**New routes:**
```
POST   /whatsapp/flows                        → Create flow
PUT    /whatsapp/flows/:id                    → Update flow JSON (upload asset)
POST   /whatsapp/flows/:id/publish            → Publish flow
POST   /whatsapp/flows/:id/deprecate          → Deprecate flow
GET    /whatsapp/flows/:id/preview            → Get preview URL
POST   /whatsapp/flows/:id/send               → Send flow to customer
GET    /whatsapp/flows/:id/responses          → List flow responses
POST   /whatsapp/flows/:id/generate-keys      → Generate RSA key pair
```

---

#### 2.4 — Calling Infrastructure

**New file:** `backend/src/controllers/whatsapp.calling.controller.js`

```
POST /whatsapp/calls/accept    → Accept UIC call
POST /whatsapp/calls/reject    → Reject UIC call
POST /whatsapp/calls/initiate  → Initiate BIC call
POST /whatsapp/calls/terminate → End active call
GET  /whatsapp/calls           → List calls for shop (with filters)
```

**New file:** `backend/src/workers/whatsapp/calling.handler.js`

Processes `calls` webhook events from the inbound worker.

---

#### 2.5 — Conversation Features

New routes for conversation management:
```
POST /whatsapp/conversations/:id/archive     → Archive conversation
POST /whatsapp/conversations/:id/unarchive   → Unarchive  
POST /whatsapp/conversations/:id/assign      → Assign to staff
POST /whatsapp/conversations/:id/mark-read   → Mark all as read
```

---

#### 2.6 — TURN Server Integration

For WebRTC calling:
- Configure Cloudflare TURN or Metered TURN
- Add TURN credentials endpoint: `GET /whatsapp/calls/turn-credentials`
- Credentials should be time-limited and generated per-session

---

## Phase 3: Analytics & Optimization (Future)

**Goal:** Deep analytics, conversation intelligence, performance optimization.

**Duration:** TBD — based on Phase 2 adoption.

**Items:**
- Template performance analytics (send → read → response rate)
- Broadcast A/B testing
- Conversation response time metrics
- Staff performance on WhatsApp (messages answered, response time)
- WhatsApp integration health dashboard
- Auto-retry for DLQ items with transient errors
- Token encryption upgrade (move from env master key to Vault/KMS)
- BSUID support when widespread in India

---

## File Change Summary

### Phase 1 Files

| File | Action | Priority |
|------|--------|----------|
| `backend/prisma/schema.prisma` | MODIFY | CRITICAL |
| `backend/src/app.js` | MODIFY | CRITICAL |
| `backend/src/controllers/whatsapp.controller.js` | MODIFY | CRITICAL |
| `backend/src/services/whatsapp.service.js` | MODIFY | HIGH |
| `backend/src/services/whatsapp.queue.js` | MODIFY | HIGH |
| `backend/src/lib/wa-cache.js` | NEW | HIGH |
| `backend/src/lib/wa-media.js` | NEW | HIGH |
| `backend/src/workers/index.js` | NEW | HIGH |
| `backend/src/workers/whatsapp/inbound.worker.js` | NEW | HIGH |
| `backend/src/workers/whatsapp/outbound.worker.js` | NEW | HIGH |
| `backend/src/workers/whatsapp/media-download.worker.js` | NEW | HIGH |
| `backend/src/workers/whatsapp/broadcast-dispatcher.worker.js` | NEW | MEDIUM |
| `backend/src/workers/whatsapp/broadcast-send.worker.js` | NEW | MEDIUM |
| `backend/src/services/whatsapp.broadcast.service.js` | NEW | MEDIUM |
| `backend/src/routes/whatsapp.routes.js` | MODIFY | MEDIUM |
| `backend/src/utils/realtime.js` | MODIFY | MEDIUM |

### Phase 2 Files

| File | Action | Priority |
|------|--------|----------|
| `backend/prisma/schema.prisma` | MODIFY (migration 3-4) | HIGH |
| `backend/src/controllers/whatsapp.calling.controller.js` | NEW | HIGH |
| `backend/src/controllers/whatsapp.flow-endpoint.controller.js` | NEW | HIGH |
| `backend/src/workers/whatsapp/calling.handler.js` | NEW | HIGH |

---

## Dependencies to Install (Phase 1)

```bash
# Socket.IO Redis adapter (for horizontal scaling)
npm install @socket.io/redis-adapter

# LRU cache for in-process memory tier
npm install lru-cache

# Amazon S3 SDK (for media storage backend)
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

## Environment Variables Required

```bash
# Phase 1 - Redis & Encryption
REDIS_URL=redis://localhost:6379
MASTER_ENCRYPTION_KEY=<32-byte random hex>   # For future token encryption

# Phase 1 - Amazon S3 Media Storage (Only supported backend)
AWS_ACCESS_KEY_ID=<your_aws_access_key_id>
AWS_SECRET_ACCESS_KEY=<your_aws_secret_access_key>
AWS_REGION=<your_aws_region>
AWS_S3_BUCKET_NAME=<your_aws_s3_bucket_name>

# Phase 2 - WebRTC TURN
CLOUDFLARE_TURN_KEY_ID=<key_id>
CLOUDFLARE_TURN_API_TOKEN=<token>
```

---

## Non-Goals (Will NOT be built)

These were explicitly out of scope per user requirements and GEMINI.md:

| Feature | Reason / Decision |
|---------|-------------------|
| GST filing via WhatsApp | Tally's responsibility |
| Double-entry bookkeeping messages | Not operations |
| WhatsApp AI chatbot / Agents / RAG | Strictly out of scope. Platform is AI-pluggable but implements zero AI logic. |
| Observability Dashboards / Admin UIs | Strictly out of scope. Telemetry is limited to structured logging + audit trails. |
| ERP Integration / Automations | Out of scope. Exposing clean, reusable endpoints only; ERP modules consume later. |
| Non-S3 Storage (Local disk, GCS, R2) | Out of scope. Amazon S3 is the *only* media storage backend. |
| SIP calling protocol | Too complex, WebRTC / RTC Lite is sufficient |

---

## Success Criteria for Phase 1

1. **Zero synchronous webhook processing** — all events go through BullMQ.
2. **Webhook returns 200 in < 100ms** — validated via logs.
3. **Tenant resolved without URL param** — `phone_number_id` based resolution.
4. **Signature validation always enforced** — appSecret check blocks unauthorized requests.
5. **Template sync works on fresh shop** — correct upsert composite key query.
6. **Broadcast sends to 100 customers** — tested via dispatcher/sender BullMQ fan-out.
7. **Socket.IO events work across multiple instances** — verified using Redis adapter.
8. **Amazon S3 Inbound Media Uploads** — inbound images/documents downloaded from Meta, uploaded to AWS S3, and the URL is updated successfully in the message.
9. **Amazon S3 Outbound Media Sending** — outbound media is read from S3 and successfully sent to Meta.

