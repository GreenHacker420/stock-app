# 03 — Meta Platform Research: WhatsApp Cloud API v25.0

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

---

## 1. API Version Target

**Target: `v25.0`** (released 2026)

All endpoints must use:
```
https://graph.facebook.com/v25.0/{endpoint}
```

Key changelog from v23.0 → v25.0:
- BSUID (Business-Scoped User ID) introduced — phone numbers may be hidden for privacy
- Portfolio-level rate limits replace per-number limits
- Per-message pricing replaces conversation-based pricing (effective July 1, 2025)
- Relaxed messaging limit tiers: 2K and 10K tiers removed, baseline becomes 100K

---

## 2. Webhook Architecture

### Single Global Webhook URL

Meta delivers ALL events for an app to ONE webhook URL. There is no per-shop or per-phone-number URL override at the standard API level.

**Implication for ShopControl multi-tenant design:**
```
Meta Webhook POST → https://shopcontrol.com/api/whatsapp/webhook
                              ↓
               Parse metadata.phone_number_id
                              ↓
               Resolve WaIntegration by phoneNumberId → shopId
                              ↓
               Route to shop-specific processing
```

### Webhook Fields

Subscribe your app to these fields:

| Field | Purpose |
|-------|---------|
| `messages` | Inbound messages + status updates (delivered, read, failed) |
| `account_update` | WABA changes, phone number quality, OBA status |
| `account_alerts` | Messaging limit changes, business profile changes |
| `calls` | All calling events (connect, status, terminate) — required for Calling API |
| `user_preferences` | Marketing-message stop/resume actions |
| `account_settings_update` | Phone number settings (including calling settings) |

### Webhook Payload Structure

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550001234",
          "phone_number_id": "123456789012345"   ← TENANT RESOLVER
        },
        "contacts": [{ "profile": { "name": "..." }, "wa_id": "..." }],
        "messages": [...],    ← Inbound messages
        "statuses": [...]     ← Delivery/read receipts
      }
    }]
  }]
}
```

### Webhook Reliability Characteristics

| Property | Value |
|----------|-------|
| Delivery guarantee | **At-least-once** (duplicates are expected) |
| Retry window | Up to 7 days for messaging webhooks |
| Retry for calls | Shorter (exact numbers not published — check timestamp) |
| Payload size limit | 3 MB max |
| Expected response time | Must return 200 within ~5 seconds |
| Idempotency required | **Yes — mandatory** |
| Ordering | **Not guaranteed** |

### Meta's Recommendation for Capacity

> Meta recommends your webhook servers can handle **3x your outgoing message traffic + 1x your expected incoming message traffic**.

---

## 3. HMAC-SHA256 Signature Verification

Every webhook POST includes header:
```
X-Hub-Signature-256: sha256=<hex-digest>
```

Verification:
```js
const rawBody = req.rawBody; // MUST be raw bytes, not parsed JSON
const expectedHash = crypto
  .createHmac('sha256', appSecret)
  .update(rawBody)
  .digest('hex');
const isValid = crypto.timingSafeEqual(
  Buffer.from(hash, 'hex'),
  Buffer.from(expectedHash, 'hex')
);
```

**Critical requirements:**
1. Must use RAW body (before JSON parsing) — use `express.raw()` for webhook route
2. Must use `crypto.timingSafeEqual` to prevent timing attacks
3. `appSecret` must be the **App Secret** (not the access token or verify token)
4. Must NEVER accept webhooks without valid signature in production

---

## 4. Message Types & Payload Reference

### Inbound Message Types

| Type | Trigger | Payload Fields |
|------|---------|---------------|
| `text` | User sends plain text | `message.text.body` |
| `image` | User sends photo | `message.image.id`, `.mime_type`, `.caption` |
| `document` | User sends file | `message.document.id`, `.filename`, `.caption` |
| `audio` | User sends voice note | `message.audio.id`, `.mime_type` |
| `video` | User sends video | `message.video.id`, `.mime_type`, `.caption` |
| `sticker` | User sends sticker | `message.sticker.id`, `.mime_type` |
| `location` | User shares location | `message.location.latitude`, `.longitude`, `.name` |
| `contacts` | User shares contact card | `message.contacts[]` |
| `reaction` | User reacts to message | `message.reaction.message_id`, `.emoji` |
| `button` | Reply to template button | `message.button.text`, `.payload` |
| `interactive` (button_reply) | Quick reply button tap | `interactive.button_reply.id`, `.title` |
| `interactive` (list_reply) | List item selection | `interactive.list_reply.id`, `.title` |
| `interactive` (nfm_reply) | WhatsApp Flow submission | `interactive.nfm_reply.response_json` |
| `order` | WhatsApp Commerce order | `message.order.catalog_id`, `.product_items[]` |
| `system` | System notification | `message.system.body`, `.type` |

### Outbound Message API

Base URL: `POST https://graph.facebook.com/v25.0/{phoneNumberId}/messages`

Common payload structures:

**Text message:**
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919876543210",
  "type": "text",
  "text": { "body": "Hello!", "preview_url": false }
}
```

**Template message:**
```json
{
  "messaging_product": "whatsapp",
  "to": "919876543210",
  "type": "template",
  "template": {
    "name": "order_confirmation",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "ORD-2026-001" }
        ]
      }
    ]
  }
}
```

**Interactive list:**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "list",
    "header": { "type": "text", "text": "Choose option" },
    "body": { "text": "Select payment method" },
    "action": {
      "button": "View Options",
      "sections": [
        {
          "title": "Payment",
          "rows": [
            { "id": "cash", "title": "Cash", "description": "Pay on delivery" },
            { "id": "upi", "title": "UPI", "description": "Scan and pay" }
          ]
        }
      ]
    }
  }
}
```

**Send Flow:**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "flow",
    "header": { "type": "text", "text": "Complete your details" },
    "body": { "text": "Please fill in the form" },
    "action": {
      "name": "flow",
      "parameters": {
        "mode": "published",
        "flow_message_version": "3",
        "flow_action": "navigate",
        "flow_token": "<FLOW_TOKEN>",
        "flow_id": "<FLOW_ID>",
        "flow_cta": "Open Form"
      }
    }
  }
}
```

---

## 5. 24-Hour Window & Pricing Model (July 2025 Update)

### Current Pricing Model (Effective July 1, 2025)

WhatsApp moved from **conversation-based pricing** to **per-message pricing** for template messages.

| Message Type | When Free | When Charged |
|-------------|-----------|--------------|
| Service (freeform) | Always free within 24h window | Cannot send outside window |
| Utility template | Free within 24h window | Charged per message outside window |
| Marketing template | ALWAYS charged per message | No free window |
| Authentication template | ALWAYS charged per message | No free window |
| Free Entry Point | Free for 72h (via click-to-WhatsApp ad) | N/A |

### 24-Hour Customer Service Window Rules

```
User sends message
        ↓
24-hour window OPENS (or resets if already open)
        ↓
Within window: business can send freeform + utility templates FREE
        ↓
Window CLOSES 24h after last user message
        ↓
After window: must use template (marketing/utility/auth are charged)
```

**Key rule:** Service conversations (when window is open) are FREE since November 1, 2024.

### Implication for ShopControl's canSendFreeText()

```js
// Current implementation is CORRECT in logic, but should cache the result
canSendFreeText(conversationId) → bool
// Returns true if (now - lastCustomerMessageAt) <= 24 hours
// Also: utility templates are now FREE within window too
```

---

## 6. Rate Limits

### Per-Number Limits

| Operation | Limit |
|-----------|-------|
| Messages API | ~80 requests/second per phone number |
| Templates API | ~60 requests/second |
| Media upload | ~30 requests/second |

### Portfolio-Level Daily Limits

| Tier | Daily Limit |
|------|-------------|
| Unverified | 250 unique recipients |
| Tier 1 (≥1K) | 1,000 |
| Tier 2 (≥10K) | *Removed in 2026* |
| Tier 3 (≥100K) | 100,000 (new baseline after verification) |
| Unlimited | No daily limit |

### Rate Limit Response

When rate limited, Meta returns:
```json
{
  "error": {
    "code": 130429,
    "message": "Rate limit hit",
    "error_subcode": 2494055
  }
}
```

**Handling strategy:**
1. Detect `code: 130429`
2. Exponential backoff starting at 1000ms
3. Add `retry_after` header parsing if available
4. Per-shop token bucket at 75 msg/sec (buffer below 80)

---

## 7. Template Management API

### List Templates
```
GET https://graph.facebook.com/v25.0/{businessAccountId}/message_templates
  ?fields=name,status,category,language,components
  &limit=1000
```

### Create Template
```
POST https://graph.facebook.com/v25.0/{businessAccountId}/message_templates
{
  "name": "order_receipt",
  "language": "en",
  "category": "UTILITY",
  "components": [...]
}
```

### Template Statuses

| Status | Meaning |
|--------|---------|
| `APPROVED` | Can be used for sending |
| `PENDING` | Under Meta review |
| `REJECTED` | Not approved — need to resubmit |
| `PAUSED` | Temporarily paused due to quality issues |
| `DISABLED` | Permanently disabled |
| `IN_APPEAL` | Under appeal process |

**Template webhook events (field: `account_update`):**
```json
{
  "field": "account_update",
  "value": {
    "event": "APPROVED",
    "message_template_id": 12345,
    "message_template_name": "order_receipt",
    "message_template_language": "en",
    "reason": ""
  }
}
```

---

## 8. Media Management API

### Upload Media
```
POST https://graph.facebook.com/v25.0/{phoneNumberId}/media
Content-Type: multipart/form-data

Fields: file, messaging_product=whatsapp, type=image/jpeg
Response: { "id": "<media_id>" }
```

### Download Media
```
1. GET https://graph.facebook.com/v25.0/{media_id}  → { "url": "..." }
2. GET {url} with Authorization: Bearer {token}       → binary data
```

**Media lifecycle:**
- Uploaded media is stored on Meta's CDN
- Media IDs expire after **30 days** (inbound) or **30 days** (outbound)
- For inbound media, must download and store within 30 days

---

## 9. BSUID (Business-Scoped User ID) — 2026 Update

Starting June 2026 with username rollout:
- Some users will hide their phone numbers
- `wa_id` in webhooks will contain a BSUID instead of phone number
- **30-day transition:** WhatsApp returns phone number for 30 days after any interaction

**Impact on ShopControl:**
- `WaConversation.phone` field will eventually hold BSUIDs for some users
- Customer matching by phone won't work for hidden-number users
- Short-term: No action needed (30-day transition + India likely not in first wave)
- Long-term: Add `bsuid` field to WaConversation for future matching

---

## 10. Webhook Override (Per-Number Callback)

Meta supports a "Webhook Override" feature that allows setting different callback URLs per WABA or per phone number. This is available via the Business Management API:

```
POST https://graph.facebook.com/v25.0/{phoneNumberId}
{
  "webhook_configuration": {
    "callback_url": "https://shopcontrol.com/api/whatsapp/webhook/{shopId}",
    "verify_token": "<shop_verify_token>"
  }
}
```

**Opportunity:** This allows per-shop webhook URLs, eliminating the need to resolve `phone_number_id → shopId` in the single webhook handler. However, it requires the Webhook Override permission and adds complexity to shop setup.

**Recommendation:** Use single webhook with `phone_number_id` resolution for V1. Consider Webhook Override as an optimization if needed.

---

## 11. Health Status API

```
GET https://graph.facebook.com/v25.0/{phoneNumberId}/health_status
```

Returns quality rating, messaging limits, and calling availability. Use for:
- Pre-flight check before sending bulk messages
- Monitoring shop integration health
- Alert generation (low quality → alert owner)

---

## 12. Business Profile API

```
GET https://graph.facebook.com/v25.0/{phoneNumberId}/whatsapp_business_profile
POST https://graph.facebook.com/v25.0/{phoneNumberId}/whatsapp_business_profile
```

Editable fields: `description`, `about`, `address`, `email`, `websites`, `vertical`, `profile_picture_url`

---

## 13. Key v25.0 Differences from v23.0 (Optimus)

| Area | v23.0 (Optimus) | v25.0 (ShopControl) |
|------|----------------|---------------------|
| Graph URL | `graph.facebook.com/v23.0/` | `graph.facebook.com/v25.0/` |
| Pricing | Conversation-based | Per-message (templates) |
| User identity | Phone number always | Phone number + BSUID (gradual rollout) |
| Messaging limits | Per-number tiers | Portfolio-level tiers |
| Utility within 24h | Charged | **Free** |
| Service conversations | Free (since Nov 2024) | Free |
