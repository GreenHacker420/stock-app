# 02 — Optimus Architecture Review: WhatsApp Reference Implementation

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

---

## 1. What Optimus Is

Optimus is a contact center / CRM platform built by Commkraft. It serves multiple organizations (tenants), each with one WhatsApp integration. It uses TypeScript, Prisma, BullMQ, Redis, Socket.IO, and Google Gemini for AI voice/text agents.

**Relationship to ShopControl:** Optimus is the reference for multi-tenant WhatsApp at production scale. ShopControl has a subset of the same needs — simpler (no AI bot flows, no contact center routing), but with multi-shop (one org = many shops) instead of multi-org.

---

## 2. Optimus WhatsApp Subsystem File Map

```
src/
├── lib/WhatsAppCloud/
│   ├── index.ts                    ← Main SDK client (2377 lines)
│   ├── msgParser.ts                ← Webhook payload normalizer (249 lines)
│   ├── WaFlows.ts                  ← Flow CRUD + send flow messages
│   └── [other modules]             ← Calling, templates, media, etc.
│
├── shared/
│   ├── WhatsAppClient.ts           ← Factory with cache-backed credential lookup
│   ├── classes/
│   │   ├── cache-manager.ts        ← Two-tier cache (Memory + Redis)
│   │   └── pub-sub-manager.ts      ← Redis pub/sub for horizontal scaling
│
├── controllers/integrations/whatsapp/
│   ├── on-wa-message.ts            ← Core inbound message handler
│   ├── wa-integration/             ← Add/update integration credentials
│   ├── wa-flows/                   ← Flow CRUD, publish, sync, responses
│   ├── calling/                    ← Accept, initiate, reject, terminate, SDP
│   └── business-profile/           ← Get/update WhatsApp business profile
│
└── mq-processes/workers/
    ├── broadcast-communication/
    │   ├── broadcast-dispatcher-worker.ts  ← Fans out to per-contact jobs
    │   └── broadcast-send-worker.ts        ← Per-contact send + completion tracking
    └── [other workers]
```

---

## 3. The Two-Tier Cache Architecture

### Pattern: Memory Cache → Redis Cache → Database

```typescript
// cache-manager.ts (simplified)
waIntegration = {
  get: async (orgCode: string) => {
    const key = `whatsapp-integration:${orgCode}`;
    
    // Tier 1: In-process memory cache (4 min TTL)
    const memCache = MemoryCache.get(key);
    if (memCache) return memCache;
    
    // Tier 2: Redis (4 hour TTL)
    const redisCache = await this.cacheClient.get(key);
    if (redisCache) {
      MemoryCache.set(key, JSON.parse(redisCache), 60 * 4);
      return JSON.parse(redisCache);
    }
    
    // Tier 3: DB fallback
    const integration = await prisma.whatsappIntegration.findFirst({
      where: { organizationId: org.id },
      include: { organization: true }
    });
    await this.waIntegration.update(orgCode, integration);  // Write to cache
    return integration;
  },
  update: async (orgCode, integration) => {
    await redis.set(key, JSON.stringify(integration), 'EX', 60 * 4);
    MemoryCache.set(key, integration, 60 * 4);
  },
  remove: async (orgCode) => {
    MemoryCache.del(key);
    await redis.del(key);
  }
}
```

**Key insights for ShopControl:**
1. Cache key is `whatsapp-integration:<orgCode>` — in ShopControl this maps to `whatsapp-integration:<shopId>`
2. **Memory cache sits in front of Redis** — reduces Redis round-trips for hot shops
3. Cache TTL is 4 hours for both layers
4. `update()` is called after Embedded Signup completes (cache warming on integration setup)
5. `remove()` is called when integration is disabled — cache invalidation

---

## 4. WhatsApp Client Factory Pattern

```typescript
// WhatsAppClient.ts
export default async function getWhatsappCloudClient(params) {
  if ('orgCode' in params) {
    // Use cache to get credentials
    const creds = await cacheManager.waIntegration.get(orgCode);
    return new WhatsappCloud({ accessToken, senderPhoneNumberId, WABA_ID, graphAPIVersion: 'v23.0' });
  } else {
    // Direct credentials (used after Embedded Signup before cache is set)
    return new WhatsappCloud({ accessToken, senderPhoneNumberId, WABA_ID, graphAPIVersion: 'v23.0' });
  }
}
```

**Adaptation for ShopControl:** Replace `orgCode` with `shopId`. The pattern is identical.

> ⚠️ **Note:** Optimus uses `v23.0`. ShopControl must use `v25.0` per project requirements.

---

## 5. Inbound Message Handler Architecture

### on-wa-message.ts Flow

```
Webhook POST arrives
  ↓
1. Validate X-Hub-Signature-256
2. Look up waIntegration via middleware (phone_number_id → org)
3. Parse message type via msgParser.ts
4. Find/Create Contact record (phone-scoped per org)
5. Find/Create ConversationSession
6. Route by message type:
   - text → triggerAgent() (AI or live agent)
   - wa_flow_message → save WaFlowResponse + triggerAgent
   - quick_reply_message → check onboarding + executeNode (bot flow)
   - call events → WhatsAppAIVoiceCallManager or find online agents
7. Immediately return 200 (non-blocking for Meta)
```

**Critical observation:** Optimus processes many events synchronously in the webhook handler (like ShopControl), BUT its processing is much faster because:
1. Credentials are from cache (no DB lookup)
2. Contact lookup uses in-memory org context from middleware
3. Many paths are agent triggers (async) that return 200 immediately

**Recommendation for ShopControl:** Despite Optimus's synchronous approach, ShopControl should use a dedicated inbound BullMQ queue because:
- ShopControl may process many shops on one instance
- No AI agent processing overhead to hide latency
- Pure async is safer for webhook reliability

---

## 6. Pub/Sub Manager — Horizontal Scaling

```typescript
// pub-sub-manager.ts
class PubSubManager {
  publishDirectCallingMessage(data) {
    // Publishes to Redis channel: "direct-calling-message"
    redis.publish("direct-calling-message", JSON.stringify(data));
  }
  
  publishVoiceCallUpdate(voiceCall) {
    redis.publish("voice-call-update", JSON.stringify(voiceCall));
  }
}
// All instances subscribe to these channels
// When a message arrives, they emit to their local Socket.IO
```

**Architecture diagram:**

```
Instance A                           Instance B
  ↓ receives webhook                    ↓ user connected here
  ↓ resolves orgId                      ↓ subscribed to shop:123 room
  ↓ publishes to Redis pub/sub ──────→ ↓ receives from Redis
                                        ↓ emits to socket.io room
```

**Key insight for ShopControl:** This is the exact pattern needed for ShopControl's Socket.IO scaling. The `shop:${shopId}` rooms need Redis pub/sub backing so any instance can emit to any shop's users.

---

## 7. Broadcast Architecture

### Two-Stage Fan-Out

```
BroadcastDispatchJob (1 job)
  ↓ Resolves audience (from contactFilterData)
  ↓ Freezes audience snapshot (audienceSnapshotAt)
  ↓ Sets Redis counter: broadcast:<id>:remaining = N
  ↓ Creates N BroadcastSendJobs (in batches of 1000)
       ↓ Each job sends to 1 contact
       ↓ On success: redis.decr(counterKey)
       ↓ If remaining === 0: marks broadcast as 'published'
```

**Key patterns:**
1. **Redis atomic counter** — `DECR` is atomic, used for completion tracking without locking
2. **Batch fan-out** — 1000 contacts per `addBulk` call to avoid BullMQ memory spikes
3. **Channel-specific senders** — `sendWhatsApp()` and `sendEmail()` are separate functions
4. **Failure tracking** — `whatsAppErrorCount` on broadcast record, individual message failure logged to `BroadCastCommunicationMessage`
5. **Deduplication** — contacts deduplicated by `id` in dispatcher before fan-out

**Adaptation for ShopControl:** The broadcast to-customer messages (order updates, payment receipts, DM reminders) can use a simplified version: one job per message, no dispatcher needed for small audiences.

---

## 8. Calling (RTC Lite) Architecture

### User-Initiated Call (UIC) Flow

```
1. User calls business from WhatsApp app
2. Meta sends 'calls' webhook with SDP offer + call ID
3. on-wa-message.ts detects 'direct_call_incoming'
4. Finds online agents via findOnlineAgentsForOrganization()
5. Publishes to Redis pub/sub → agent's browser gets call notification
6. Agent's browser generates SDP answer
7. Agent POSTs to /calling/accept with sdpAnswer
8. acceptWhatsappCall() calls whatsappCloudClient.calling.acceptCall()
9. WebRTC ICE-DTLS-SRTP connection established for media
```

### Business-Initiated Call (BIC) Flow

```
1. Agent POSTs to /calling/initiate with contactId + sdpOffer
2. initiateWhatsappCall() checks:
   - messagingLimitTier must NOT be TIER_250 (requires ≥1K limit)
3. Calls POST /{phoneNumberId}/calls with SDP offer
4. Creates VoiceCall record
5. pubSubManager.publishVoiceCallUpdate() → notify all instances
6. Meta sends back SDP answer via 'calls' webhook
7. WebRTC connection established
```

### Key Calling Constraints

| Constraint | Value | Source |
|-----------|-------|--------|
| Accept timeout | 30-60 seconds | Meta docs |
| BIC requirement | ≥ TIER_1K (not TIER_250) | Optimus code check |
| Media codec | OPUS + DTMF payload 126 | Meta SDP spec |
| ICE type | ICE-lite (RFC 8445) | Meta uses ICE-lite; BSP must be full ICE |
| WebRTC stack | werift (Node.js) | Optimus uses `werift` + AI via Google GenAI |

**ShopControl calling scope:** Far simpler than Optimus's AI call manager. ShopControl only needs:
- UIC: Receive call webhook → route to owner's device via Socket.IO
- No AI agent
- No complex SDP manipulation
- Just signaling relay (webhook → Socket.IO → browser WebRTC)

---

## 9. WA Flows Implementation

### Flow CRUD Pattern

```typescript
// WaFlows.ts (simplified)
async createFlow({ WABA_ID, name, categories }) {
  POST https://graph.facebook.com/v23.0/{WABA_ID}/flows
}

async updateFlowJson({ flowId, flowJson }) {
  // Uploads as multipart/form-data with asset_type=FLOW_JSON
  POST https://graph.facebook.com/v23.0/{flowId}/assets
}

async publishFlow({ flowId }) {
  POST https://graph.facebook.com/v23.0/{flowId}/publish
}

async sendFlow({ recipientPhone, flowId, mode }) {
  // Sends interactive message with type: 'flow'
  POST /{phoneNumberId}/messages
  body: { type: 'interactive', interactive: { type: 'flow', action: { name: 'flow', parameters: { ... } } } }
}
```

### Flow Sync Controller

```typescript
// sync.ts — Optimus's flow sync logic
// 1. Get all flows from Meta via WABA API
// 2. Compare with DB flows
// 3. Delete DB flows no longer in Meta
// 4. Update status changes
// (Does NOT auto-create new flows discovered on Meta)
```

**ShopControl adaptation:** Same pattern. WaFlow sync should:
1. List from Meta (via `GET /{businessAccountId}/flows`)
2. Upsert by `flowId` (not by `id`)
3. Delete flows removed from Meta

---

## 10. Embedded Signup Flow

Optimus handles the full Facebook Embedded Signup OAuth flow:
1. Frontend gets short-lived code from Meta SDK
2. Backend exchanges code for long-lived system user token
3. Fetches WABA ID, phone number ID, business profile
4. Creates/updates `WhatsappIntegration` in DB
5. **Immediately warms cache** via `cacheManager.waIntegration.update()`
6. Registers phone number with a PIN
7. **Disables other integrations on same WABA** (cross-tenant collision prevention)
8. Syncs templates

**ShopControl equivalent:** Simpler manual setup — owner enters credentials directly. Embedded Signup is a Phase 2 feature.

---

## 11. Key Patterns to Adopt in ShopControl

| Pattern | Optimus Implementation | ShopControl Adaptation |
|---------|----------------------|----------------------|
| Credential cache | Two-tier (memory + Redis) with `shopId` key | `wa-creds:<shopId>` with 4h TTL |
| Client factory | `getWhatsappCloudClient({ orgCode })` | `getWaClient(shopId)` |
| Tenant resolution | Middleware maps `phone_number_id` → org | Middleware maps `phone_number_id` → shop |
| Pub/sub scaling | Redis channels per event type | `wa:<shopId>:event` channel |
| Broadcast fan-out | Dispatcher + Redis counter | Simplified: single queue per message |
| Flow sync | Upsert by flowId, delete orphans | Same |
| Calling (Phase 2) | Full WebRTC + AI agent | Signaling relay only |

---

## 12. Patterns NOT to Adopt (ShopControl Context)

| Optimus Pattern | Why Not for ShopControl |
|----------------|------------------------|
| AI agent (Gemini) | Not needed — ShopControl is operations, not CRM |
| Bot flow engine | Not needed — ShopControl doesn't have automation flows |
| Contact onboarding queue | ShopControl maps to Customers, not contacts |
| Event/reminder MQ workers | Not in V1 scope |
| Self-training / knowledge base | Not in scope |

---

## 13. Version Delta

| Property | Optimus | ShopControl |
|----------|---------|------------|
| Meta Graph API Version | v23.0 | **v25.0** (required) |
| Tenant Unit | Organization (1 org per integration) | Shop (1 shop per integration) |
| Customer Uniqueness | `(organizationId, phone)` | `(shopId, phone)` |
| Auth | JWT + org user system | JWT + user/shop system |
