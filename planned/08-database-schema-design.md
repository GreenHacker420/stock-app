# 08 — Full Database Schema Design

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

---

## 1. Design Principles

1. Every WhatsApp model is **shop-scoped** (`shopId` present on every table)
2. Use **Prisma enums** for all status/type fields
3. Apply **cascade deletes** from Shop down — shop deletion cleans up WA data
4. All monetary values use standard Prisma decimal approach (centralized in code)
5. Use **cuid()** for all IDs (consistent with existing schema)
6. **No migration** is to be executed until Phase 1 implementation approval

---

## 2. Enum Definitions

### Existing Enums (KEEP — no changes)

```prisma
enum WaMessageStatus {
  QUEUED
  SENT
  DELIVERED
  READ
  FAILED
}

enum WaMessageType {
  TEXT
  IMAGE
  DOCUMENT
  AUDIO
  VIDEO
  STICKER
  TEMPLATE
  FLOW
}

enum WaMessageDirection {
  INBOUND
  OUTBOUND
}

enum WaIntegrationStatus {
  CONNECTED
  DISCONNECTED
  ERROR
}

enum WaFlowStatus {
  DRAFT
  PUBLISHED
  DEPRECATED
  BLOCKED
  THROTTLED
}

enum WaFlowExecutionStatus {
  STARTED
  COMPLETED
  CANCELLED
}

enum WaTemplateStatus {
  APPROVED
  REJECTED
  PENDING
  PAUSED
  DISABLED
  IN_APPEAL
}
```

### New Enums (ADD in migration)

```prisma
enum WaMessageType {
  TEXT
  IMAGE
  DOCUMENT
  AUDIO
  VIDEO
  STICKER
  TEMPLATE
  FLOW
  INTERACTIVE          // NEW: buttons, lists, etc.
  CALL                 // NEW: call event messages
  LOCATION             // NEW: location shares
  CONTACT_CARD         // NEW: vCard shares
  REACTION             // NEW: emoji reactions
  UNSUPPORTED          // NEW: fallback
}

enum WaCallDirection {
  USER_INITIATED
  BUSINESS_INITIATED
}

enum WaCallStatus {
  RINGING
  ACCEPTED
  REJECTED
  TERMINATED
  FAILED
  MISSED
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
  SKIPPED
}
```

---

## 3. Model: WaIntegration (MODIFY)

```prisma
model WaIntegration {
  id                    String              @id @default(cuid())
  shopId                String              @unique
  
  // Credentials (accessToken should be encrypted at rest in V2)
  verifyToken           String
  accessToken           String              // TODO V2: encrypt
  appSecret             String?             // MUST be set for signature validation
  businessAccountId     String
  phoneNumberId         String              // ← Primary tenant resolver key
  
  // Display info (fetched from Meta)
  phoneNumber           String?             // E.164 display format
  businessName          String?
  
  // Quality & limits
  messagingLimitTier    String?             // TIER_250, TIER_1K, TIER_10K, TIER_100K, UNLIMITED
  qualityRating         String?             // HIGH, MEDIUM, LOW
  
  // Calling
  callingEnabled        Boolean             @default(false)
  
  // Status
  status                WaIntegrationStatus @default(DISCONNECTED)
  
  // Audit
  connectedAt           DateTime?
  lastWebhookAt         DateTime?
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  shop                  Shop                @relation(fields: [shopId], references: [id], onDelete: Cascade)
  
  @@index([phoneNumberId])  // NEW: for fast tenant resolution
}
```

**Key changes from current:**
- Added `@@index([phoneNumberId])` — critical for O(1) tenant resolution
- Added `messagingLimitTier`, `qualityRating` — needed for rate awareness
- Added `callingEnabled` — Phase 2 gating
- Added `connectedAt`, `lastWebhookAt` — operational visibility
- `appSecret` remains nullable for now but will be validated

---

## 4. Model: WaConversation (MODIFY)

```prisma
model WaConversation {
  id                     String    @id @default(cuid())
  shopId                 String
  customerId             String?
  
  // Contact info
  phone                  String    // Customer phone or BSUID
  bsuid                  String?   // NEW: Business-Scoped User ID (Meta 2026)
  contactName            String?
  
  // Window tracking
  lastCustomerMessageAt  DateTime? // Powers 24h window check
  
  // UI state
  unreadCount            Int       @default(0)
  isArchived             Boolean   @default(false)  // NEW: Owner can archive conversations
  isPinned               Boolean   @default(false)  // NEW: Pin important conversations
  
  // Staff assignment (optional)
  assignedToId           String?   // NEW: Assign to staff member
  
  // Metadata
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  shop             Shop       @relation(fields: [shopId], references: [id])
  customer         Customer?  @relation(fields: [customerId], references: [id])
  assignedTo       User?      @relation(fields: [assignedToId], references: [id])
  messages         WaMessage[]
  flowExecutions   WaFlowExecution[]
  calls            WaCall[]   // NEW

  @@unique([shopId, phone])
  @@index([shopId, updatedAt])   // NEW: for pagination
  @@index([shopId, customerId])  // NEW: for customer lookup
}
```

---

## 5. Model: WaMessage (MODIFY)

```prisma
model WaMessage {
  id                   String             @id @default(cuid())
  conversationId       String
  
  // Meta identifiers
  metaMessageId        String?            @unique  // Dedup key
  replyToMetaMessageId String?
  
  // Direction & status
  direction            WaMessageDirection
  status               WaMessageStatus    @default(QUEUED)
  
  // Type & content
  type                 WaMessageType      @default(TEXT)
  content              Json?              // Text content, button data, etc.
  payload              Json?              // NEW: raw interactive/special payloads
  
  // Media
  mediaId              String?            // Meta media ID (expires 30 days)
  mediaUrl             String?            // Downloaded & stored URL
  mimeType             String?
  fileName             String?
  
  // Template tracking
  templateId           String?
  templateName         String?            // NEW: denormalized for display
  templateLanguage     String?            // NEW: denormalized for display
  
  // Broadcast link
  broadcastRecipientId String?            // NEW: FK to WaBroadcastRecipient
  
  // Retry tracking (for outbound)
  retryCount           Int                @default(0)    // NEW
  lastRetryAt          DateTime?                         // NEW
  
  // Timestamps
  deliveredAt          DateTime?
  readAt               DateTime?
  failedAt             DateTime?
  errorMessage         String?
  createdAt            DateTime           @default(now())

  conversation         WaConversation     @relation(fields: [conversationId], references: [id])
  
  @@index([conversationId, createdAt])  // NEW: for message pagination
  @@index([metaMessageId])              // Already @unique but explicit index
}
```

---

## 6. Model: WaTemplate (MODIFY)

```prisma
model WaTemplate {
  id                String           @id @default(cuid())
  shopId            String
  
  // Meta identifiers
  metaTemplateId    String?          // NEW: Meta's internal template ID
  
  // Template info
  name              String
  language          String
  status            WaTemplateStatus @default(PENDING)
  category          String           // UTILITY | MARKETING | AUTHENTICATION
  
  // Structure (raw from Meta)
  components        Json
  
  // Variable metadata (parsed from components)
  headerVariables   Json?            // NEW: parsed variable schema
  bodyVariables     Json?            // NEW: parsed variable schema
  
  // Usage tracking
  sentCount         Int              @default(0)   // NEW
  readCount         Int              @default(0)   // NEW
  
  // Audit
  metaRejectionReason String?        // NEW: why Meta rejected
  syncedAt          DateTime?        // NEW: last sync from Meta
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  shop              Shop             @relation(fields: [shopId], references: [id])
  broadcasts        WaBroadcast[]

  @@unique([shopId, name, language])   // FIX: was missing — caused duplicate sync bug
  @@index([shopId, status])
}
```

---

## 7. Model: WaFlow (MODIFY)

```prisma
model WaFlow {
  id              String       @id @default(cuid())
  shopId          String
  
  // Meta identifiers
  flowId          String?      // NOT @unique globally — different shops can have same flowId
                               // Actually should be unique per shop pair — see note below
  
  // Metadata
  name            String
  description     String?
  categories      String[]     // NEW: Flow category tags
  status          WaFlowStatus @default(DRAFT)
  
  // Flow content
  flowJson        Json?
  
  // Endpoint encryption (for E2EE flows)
  endpointEnabled Boolean      @default(false)
  rsaPublicKey    String?      @db.Text  // X.509 PEM (stored for reference)
  rsaPrivateKeyEncrypted String? @db.Text  // Encrypted private key
  
  // Preview
  previewUrl      String?
  
  // Tracking
  totalSent       Int          @default(0)   // NEW
  totalResponses  Int          @default(0)   // NEW
  
  // Audit
  syncedAt        DateTime?    // NEW
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt    // NEW

  shop            Shop          @relation(fields: [shopId], references: [id], onDelete: Cascade)
  executions      WaFlowExecution[]

  @@unique([shopId, flowId])   // FIX: per-shop unique, not global
}
```

> **Note on flowId uniqueness:** The current schema has `flowId @unique` globally. This means two different shops cannot have the same Meta flow ID (which is globally unique in Meta anyway). However, the proper constraint is `@@unique([shopId, flowId])` which is semantically clearer and allows flowId to be null without conflicts.

---

## 8. Model: WaFlowExecution (MODIFY)

```prisma
model WaFlowExecution {
  id             String                @id @default(cuid())
  
  // Relationships
  shopId         String                // NEW: denormalized for direct shop queries
  flowId         String                // FK to WaFlow
  conversationId String
  customerId     String?               // NEW: direct customer link
  
  // Flow token (identifies the specific send instance)
  flowToken      String?               @unique  // NEW
  
  // Status & data
  status         WaFlowExecutionStatus @default(STARTED)
  inputJson      Json?                 // Data pre-populated when flow was sent
  resultJson     Json?                 // User's submission
  
  // Timestamps
  sentAt         DateTime?             // NEW: when flow message was sent to customer
  submittedAt    DateTime?             // NEW: when customer submitted
  startedAt      DateTime              @default(now())
  completedAt    DateTime?

  waFlow         WaFlow          @relation(fields: [flowId], references: [id])
  conversation   WaConversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  customer       Customer?       @relation(fields: [customerId], references: [id])
  
  @@index([shopId, flowId])
  @@index([flowToken])
}
```

---

## 9. Model: WaCall (NEW)

```prisma
model WaCall {
  id              String         @id @default(cuid())
  shopId          String
  
  // Meta identifiers
  metaCallId      String         @unique  // wacid.xxx
  
  // Call info
  direction       WaCallDirection
  status          WaCallStatus   @default(RINGING)
  
  // Parties
  customerPhone   String
  customerId      String?
  conversationId  String?
  
  // SDP signaling (stored temporarily)
  sdpOffer        String?        @db.Text  // Meta's SDP offer (UIC)
  sdpAnswer       String?        @db.Text  // Our response
  
  // Timing
  initiatedAt     DateTime       @default(now())
  answeredAt      DateTime?
  endedAt         DateTime?
  durationSeconds Int?
  
  // Error
  errors          Json?
  
  // Audit
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  shop            Shop           @relation(fields: [shopId], references: [id], onDelete: Cascade)
  customer        Customer?      @relation(fields: [customerId], references: [id])
  conversation    WaConversation? @relation(fields: [conversationId], references: [id])
  
  @@index([shopId, status])
  @@index([shopId, createdAt])
}
```

---

## 10. Model: WaBroadcast (NEW)

```prisma
model WaBroadcast {
  id                  String             @id @default(cuid())
  shopId              String
  
  // Identity
  name                String
  
  // Template
  templateId          String?
  templateVariables   Json?              // Variable mapping config
  
  // Audience
  audienceFilter      Json?              // Filter criteria JSON
  audienceCount       Int                @default(0)
  
  // Status
  status              WaBroadcastStatus  @default(DRAFT)
  
  // Progress counters (denormalized for performance)
  sentCount           Int                @default(0)
  deliveredCount      Int                @default(0)
  readCount           Int                @default(0)
  failedCount         Int                @default(0)
  skippedCount        Int                @default(0)
  
  // Scheduling
  scheduledAt         DateTime?
  startedAt           DateTime?
  completedAt         DateTime?
  
  // Audit
  createdById         String
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  shop                Shop               @relation(fields: [shopId], references: [id], onDelete: Cascade)
  template            WaTemplate?        @relation(fields: [templateId], references: [id])
  createdBy           User               @relation(fields: [createdById], references: [id])
  recipients          WaBroadcastRecipient[]
  
  @@index([shopId, status])
}

model WaBroadcastRecipient {
  id              String                     @id @default(cuid())
  broadcastId     String
  customerId      String
  
  // Contact info at send time (denormalized)
  customerName    String?
  customerPhone   String
  
  // Status
  status          WaBroadcastRecipientStatus @default(PENDING)
  
  // Meta tracking
  metaMessageId   String?
  errorMessage    String?
  
  // Timestamps
  sentAt          DateTime?
  deliveredAt     DateTime?
  readAt          DateTime?
  createdAt       DateTime                   @default(now())

  broadcast       WaBroadcast @relation(fields: [broadcastId], references: [id], onDelete: Cascade)
  customer        Customer    @relation(fields: [customerId], references: [id])
  
  @@unique([broadcastId, customerId])
  @@index([broadcastId, status])
}
```

---

## 11. Model: WaWebhookEvent (MODIFY)

```prisma
model WaWebhookEvent {
  id          String   @id  // SHA-256 hash of stable event key
  shopId      String?        // NEW: for shop-specific cleanup
  eventType   String
  processedAt DateTime @default(now())
  
  @@index([processedAt])  // NEW: for TTL cleanup jobs
}
```

---

## 12. Shop Model Additions

The `Shop` model needs backward relations added:

```prisma
model Shop {
  // ... existing fields ...
  
  // Existing WhatsApp relations
  waIntegration      WaIntegration?
  waConversations    WaConversation[]
  waTemplates        WaTemplate[]
  waFlows            WaFlow[]
  
  // NEW relations
  waBroadcasts       WaBroadcast[]
  waCalls            WaCall[]
}
```

---

## 13. Migration Strategy

Migrations will be split into phases to avoid breaking changes:

**Migration 1 (Phase 1 — Core Refactor):**
- Add `WaIntegration.@@index([phoneNumberId])`
- Add `WaIntegration.messagingLimitTier`, `qualityRating`, `callingEnabled`, `connectedAt`, `lastWebhookAt`
- Fix `WaTemplate.@@unique([shopId, name, language])`
- Fix `WaFlow.@@unique([shopId, flowId])` — drop global unique, add composite
- Add `WaConversation.bsuid`, `isArchived`, `isPinned`, `assignedToId`
- Add `WaMessage.payload`, `broadcastRecipientId`, `retryCount`, `lastRetryAt`
- Add new `WaMessageType` enum values (INTERACTIVE, CALL, LOCATION, CONTACT_CARD, REACTION, UNSUPPORTED)
- Add `WaWebhookEvent.shopId`, index

**Migration 2 (Phase 1 — Broadcast):**
- Create `WaBroadcast` model
- Create `WaBroadcastRecipient` model
- Add new enums (`WaBroadcastStatus`, `WaBroadcastRecipientStatus`)

**Migration 3 (Phase 2 — Calling):**
- Create `WaCall` model
- Add new enums (`WaCallDirection`, `WaCallStatus`)

**Migration 4 (Phase 2 — Flows E2EE):**
- Add `WaFlow.endpointEnabled`, `rsaPublicKey`, `rsaPrivateKeyEncrypted`
- Modify `WaFlowExecution` model
