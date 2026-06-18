# 04 — Flows API: Design, Encryption & Endpoint Architecture

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

---

## 1. What WhatsApp Flows Is

WhatsApp Flows allows businesses to embed interactive, multi-screen form experiences inside WhatsApp conversations. Users interact with structured screens (forms, lists, calendars, etc.) without leaving WhatsApp.

**ShopControl use cases:**
- Customer order confirmation with product selection
- Payment collection form (amount + method)
- Customer feedback collection
- DM acknowledgement / signature capture
- Staff check-in form (attendance via WhatsApp)

---

## 2. Flow Lifecycle

```
CREATE FLOW
    ↓ (DRAFT)
UPLOAD flow.json asset
    ↓ (validation errors if any)
PREVIEW in WhatsApp
    ↓
PUBLISH flow
    ↓ (PUBLISHED)
SEND flow to customers
    ↓
RECEIVE flow submissions via webhook (nfm_reply)
    ↓
DEPRECATE when no longer needed
    ↓ (DEPRECATED)
```

### Flow Statuses

| Status | Meaning | Can Be Sent? |
|--------|---------|-------------|
| `DRAFT` | Under development | No (only via test mode) |
| `PUBLISHED` | Live and sendable | Yes |
| `DEPRECATED` | No longer active | No |
| `BLOCKED` | Blocked by Meta for policy | No |
| `THROTTLED` | Temporarily rate-limited | No |

---

## 3. Flow CRUD API

### Create Flow
```
POST https://graph.facebook.com/v25.0/{WABA_ID}/flows
{
  "name": "Order Confirmation",
  "categories": ["CUSTOMER_SUPPORT"]
}
Response: { "id": "<flow_id>" }
```

### Upload/Update Flow JSON
```
POST https://graph.facebook.com/v25.0/{flow_id}/assets
Content-Type: multipart/form-data

Fields:
  - file: <flow.json as Blob, type=application/json>
  - name: "flow.json"
  - asset_type: "FLOW_JSON"

Constraints:
  - Max file size: 10 MB
  - Must be valid Flow JSON schema
```

### Publish Flow
```
POST https://graph.facebook.com/v25.0/{flow_id}/publish
```

### Get Flow Preview URL
```
GET https://graph.facebook.com/v25.0/{flow_id}?fields=preview.invalidate(false)
Response: { "preview": { "preview_url": "...", "expires_at": "..." } }
```

### Delete Flow (must be DRAFT or DEPRECATED first)
```
DELETE https://graph.facebook.com/v25.0/{flow_id}
```

### List All Flows for WABA
```
GET https://graph.facebook.com/v25.0/{WABA_ID}/flows?fields=id,name,status,categories
```

### Deprecate Flow
```
POST https://graph.facebook.com/v25.0/{flow_id}/deprecate
```

---

## 4. Flow JSON Structure

A Flow is defined by a JSON document describing screens, components, and navigation:

```json
{
  "version": "5.0",
  "screens": [
    {
      "id": "WELCOME_SCREEN",
      "title": "Confirm Order",
      "data": {},
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "TextHeading",
            "text": "Order #ORD-2026-001"
          },
          {
            "type": "TextSubheading",
            "text": "Total: ₹5,000"
          },
          {
            "type": "Footer",
            "label": "Confirm",
            "on-click-action": {
              "name": "complete",
              "payload": {
                "confirmed": true,
                "orderId": "ORD-2026-001"
              }
            }
          }
        ]
      }
    }
  ]
}
```

---

## 5. Sending a Flow to a Customer

```
POST https://graph.facebook.com/v25.0/{phoneNumberId}/messages
{
  "messaging_product": "whatsapp",
  "to": "919876543210",
  "type": "interactive",
  "interactive": {
    "type": "flow",
    "header": { "type": "text", "text": "Confirm your order" },
    "body": { "text": "Please review and confirm your order details." },
    "footer": { "text": "Powered by ShopControl" },
    "action": {
      "name": "flow",
      "parameters": {
        "mode": "published",              // or "draft" for testing
        "flow_message_version": "3",
        "flow_action": "navigate",
        "flow_token": "<UNIQUE_TOKEN>",   // Identifies this send instance
        "flow_id": "<FLOW_ID>",
        "flow_cta": "Open Form",
        "flow_action_payload": {          // Pre-populated data for the flow
          "screen": "WELCOME_SCREEN",
          "data": {
            "order_id": "ORD-2026-001",
            "amount": "5000"
          }
        }
      }
    }
  }
}
```

**`flow_token`:** A unique identifier you generate per send. Used to:
1. Identify which send this submission belongs to
2. Store in `WaFlowExecution` for tracking
3. Parse from submission payload to retrieve context

---

## 6. Receiving Flow Submissions

When user completes a flow, webhook delivers `nfm_reply`:

```json
{
  "type": "interactive",
  "interactive": {
    "type": "nfm_reply",
    "nfm_reply": {
      "name": "flow",
      "body": "Sent",
      "response_json": "{\"confirmed\":true,\"orderId\":\"ORD-2026-001\",\"flow_token\":\"<TOKEN>\"}"
    }
  }
}
```

**Processing:**
1. Parse `nfm_reply.response_json` as JSON
2. Extract `flow_token` to identify context
3. Store response in `WaFlowExecution.resultJson`
4. Update associated records (order confirmed, payment initiated, etc.)

---

## 7. Flow Endpoint Encryption (E2EE)

For flows with sensitive data (e.g., payment forms, personal details), Meta routes submissions through a **business-controlled endpoint** instead of the webhook. This endpoint must implement RSA + AES-GCM encryption.

### Why It Exists

Meta does not have access to sensitive data in encrypted flows. Only the business's private key can decrypt submissions.

### Encryption Architecture

```
User submits flow data
        ↓
Meta generates unique 128-bit AES-GCM key (session key)
        ↓
Meta encrypts form data with AES-128-GCM
        ↓
Meta encrypts AES key with business's RSA-2048 public key (OAEP padding)
        ↓
POST to business endpoint:
{
  "encrypted_aes_key": "<base64>",   ← AES key encrypted with RSA
  "initial_vector": "<base64>",       ← IV for AES-GCM
  "ciphertext": "<base64>"            ← Encrypted payload
}
```

### Decryption Algorithm (Node.js)

```javascript
function decryptFlowPayload(body, privateKeyPem) {
  const { encrypted_aes_key, initial_vector, ciphertext } = body;
  
  // Step 1: Decrypt AES key using RSA private key
  const aesKey = crypto.privateDecrypt(
    { 
      key: privateKeyPem, 
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING 
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );
  
  // Step 2: Decrypt payload using AES-128-GCM
  // Last 16 bytes of ciphertext are the auth tag
  const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
  const authTag = ciphertextBuffer.slice(-16);
  const encryptedData = ciphertextBuffer.slice(0, -16);
  
  const decipher = crypto.createDecipheriv(
    'aes-128-gcm',
    aesKey,
    Buffer.from(initial_vector, 'base64')
  );
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);
  
  return JSON.parse(decrypted.toString('utf8'));
}
```

### Encrypting Response

```javascript
function encryptFlowResponse(responseData, aesKey, iv) {
  const cipher = crypto.createCipheriv(
    'aes-128-gcm',
    aesKey,
    iv
  );
  
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(responseData), 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Append auth tag to ciphertext
  return Buffer.concat([encrypted, authTag]).toString('base64');
}
```

### RSA Key Pair Generation

```bash
# Generate 2048-bit RSA private key
openssl genrsa -out private_key.pem 2048

# Extract public key in X.509 PEM format (what Meta requires)
openssl rsa -in private_key.pem -pubout -out public_key.pem
```

**Key storage for ShopControl:**
- Public key → Upload to Meta via WABA settings
- Private key → Store encrypted in database (per shop) or in secrets manager
- **NEVER store private key as plaintext**

---

## 8. Flow Endpoint Requirements

Your HTTPS endpoint for encrypted flows must:

| Requirement | Detail |
|-------------|--------|
| Protocol | HTTPS with valid TLS cert |
| Method | POST |
| Verification | GET request from Meta with `hub.challenge` (same as webhook verification) |
| Signature | `X-Hub-Signature-256` header — verify with app secret |
| Response time | Must respond within 10 seconds |
| Response body | Encrypted JSON (base64) using same AES key |

### Endpoint Verification (GET)
```
GET /whatsapp/flow-endpoint?hub.mode=subscribe&hub.challenge=<challenge>&hub.verify_token=<token>
Response: 200 with challenge value as plain text
```

### Decryption Endpoint (POST)
```
POST /whatsapp/flow-endpoint
Headers: X-Hub-Signature-256: sha256=<hmac>

Body:
{
  "encrypted_aes_key": "...",
  "initial_vector": "...",
  "ciphertext": "..."
}

Response (200):
{
  "ciphertext": "<encrypted_response_base64>"
}
```

---

## 9. Flow Schema Design for ShopControl

### DB Model Changes Needed

```prisma
// Current WaFlow model needs:
model WaFlow {
  // ... existing fields ...
  
  // NEW: Endpoint encryption fields
  rsaPublicKey      String?   // X.509 PEM — stored for reference
  rsaPrivateKeyRef  String?   // Reference to encrypted secret (not the key itself)
  endpointEnabled   Boolean   @default(false)
  endpointUrl       String?   // Auto-generated from shopId
  
  // NEW: Metadata
  updatedAt         DateTime  @updatedAt
  categories        String[]  // Array of Flow category strings
  description       String?
  previewUrl        String?   // From getFlowPreview
  
  // NEW: Tracking
  totalSent         Int       @default(0)
  totalResponses    Int       @default(0)
}

// Current WaFlowExecution needs:
model WaFlowExecution {
  // ... existing fields ...
  
  // NEW: Contact link
  customerId        String?
  
  // NEW: Flow token for tracking send instances
  flowToken         String?   @unique
  
  // NEW: Response metadata
  submittedAt       DateTime?
  screensVisited    String[]
}
```

---

## 10. ShopControl Flow Templates to Build

| Flow Name | Screens | Data | Use Case |
|-----------|---------|------|---------|
| `payment_collection` | Payment method selector + amount confirm | orderId, amount, customerId | Collect payment for DM/Sale |
| `order_confirmation` | Order details + confirm button | orderId, items[], total | Customer confirms order |
| `feedback_form` | Rating (1-5) + text | saleId, customerId | Post-sale feedback |
| `gst_info_collection` | GSTIN field + name + address | customerId | Collect GST details |

---

## 11. Flow Sync Strategy

Current Optimus pattern (adopted for ShopControl):

```
Owner triggers "Sync Flows" action
        ↓
GET /{WABA_ID}/flows → list of flows from Meta
        ↓
Compare with DB flows
        ↓
DELETE flows in DB that no longer exist in Meta
        ↓
UPDATE status for flows whose status changed
        ↓
(Do NOT auto-create flows discovered in Meta not in DB)
```

**Note:** Only flows created through ShopControl UI are tracked. Flows created directly in WhatsApp Business Manager and not synced through the app are ignored until explicitly imported.

---

## 12. Security Considerations

1. **Never expose RSA private keys** — store encrypted with application-level key or use secrets manager
2. **Verify X-Hub-Signature-256** on ALL flow endpoint POSTs  
3. **Flow tokens must be unique per send** — use `cuid()` or UUID
4. **Validate decrypted payload schema** — reject unexpected fields
5. **Rate limit flow endpoint** — prevent abuse via replay attacks
6. **Clean up flow tokens** — purge `WaFlowExecution` records with old tokens (e.g., 30 days)
