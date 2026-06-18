# 11 — Meta Embedded Signup & Onboarding Flow

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-19

This document details the architecture and step-by-step technical implementation of the **Meta Embedded Signup (Facebook Login for Business)** onboarding flow for multi-tenant shops in ShopControl.

---

## 1. Onboarding Architecture Overview

Embedded Signup is the industry-standard OAuth-based method for multi-tenant SaaS platforms to onboard customer WhatsApp accounts. The flow eliminates manual key generation and copies assets securely.

```
[Shop Owner]              [ShopControl App]             [Meta Dialog]             [ShopControl Backend]
      │                           │                           │                            │
      │── 1. Click "Connect" ────>│                           │                            │
      │                           │── 2. Open Popup Dialog ──>│                            │
      │                           │                           │                            │
      │                           │<── 3. Authenticate & Auth ─│                            │
      │                           │    (Select WABA & Phone)  │                            │
      │                           │                           │                            │
      │                           │<── 4. Redirect with code ─│                            │
      │                           │                           │                            │
      │                           │── 5. POST /fb-embedded-signup (code) ─────────────────>│
      │                           │                                                        │── 6. Exchange code for User Token
      │                           │                                                        │── 7. Debug token (Get WABA ID)
      │                           │                                                        │── 8. Get Phone Number Details
      │                           │                                                        │── 9. Register Phone (PIN)
      │                           │                                                        │── 10. Subscribe App to WABA
      │                           │                                                        │── 11. Upsert WaIntegration
      │                           │                                                        │── 12. Warm Cache & Enable Status
      │                           │<── 12. Return Success ─────────────────────────────────│
      │<── 13. Show Connected ────│
```

---

## 2. Step-by-Step Technical Flow

### Step 2.1 — Frontend Trigger (Expo / React Native)

The frontend triggers a popup browser window (using `Expo.WebBrowser` or Meta's JS SDK on web) redirecting to the Meta OAuth dialog.

**Request Configuration:**
*   **Base URL:** `https://www.facebook.com/v25.0/dialog/oauth`
*   **Query Parameters:**
    *   `client_id`: `process.env.EXPO_PUBLIC_FACEBOOK_APP_ID` (Your Meta App ID)
    *   `redirect_uri`: The OAuth redirect URI matching your scheme (`shopcontrol://` for app, or `https://app.shopcontrol.in/whatsapp/callback` for web)
    *   `response_type`: `code`
    *   `config_id`: Meta Business Configuration ID (defines permissions requested)
    *   `state`: `{shopId}` (To prevent CSRF and identify the shop)

When the user completes authentication, Meta redirects back to `redirect_uri` with a short-lived `code` parameter.

---

### Step 2.2 — Backend Code Exchange

The frontend extracts the `code` and calls the backend:
`POST /api/whatsapp/fb-embedded-signup` with `{ shopId, code }`.

The backend exchanges the short-lived `code` for a long-lived User Access Token:
```
GET https://graph.facebook.com/v25.0/oauth/access_token
  ?client_id={APP_ID}
  &client_secret={APP_SECRET}
  &code={OAUTH_CODE}
```
**Response:**
```json
{
  "access_token": "EAAb...",
  "token_type": "bearer",
  "expires_in": 5184000
}
```

---

### Step 2.3 — Token Inspection (Debug Token)

To verify WABA associations and retrieve the correct scopes, call the debug endpoint:
```
GET https://graph.facebook.com/v25.0/debug_token
  ?input_token={USER_ACCESS_TOKEN}
  &access_token={APP_ID}|{APP_SECRET}
```
**Response:**
```json
{
  "data": {
    "app_id": "1234567890",
    "type": "USER",
    "application": "ShopControl Production",
    "expires_at": 1723456789,
    "is_valid": true,
    "scopes": [
      "whatsapp_business_management",
      "whatsapp_business_messaging"
    ],
    "granular_scopes": [
      {
        "scope": "whatsapp_business_management",
        "target_ids": ["WABA_ACCOUNT_ID"]
      }
    ],
    "user_id": "METADATA_USER_ID"
  }
}
```
*   **WABA ID Extraction:** Read `granular_scopes` where scope is `whatsapp_business_management` to find the associated WhatsApp Business Account ID (`businessAccountId`).

---

### Step 2.4 — Retrieve Phone Number ID

To interact with the phone number, get its metadata:
```
GET https://graph.facebook.com/v25.0/{businessAccountId}/phone_numbers
  Headers: Authorization: Bearer {USER_ACCESS_TOKEN}
```
**Response:**
```json
{
  "data": [
    {
      "id": "PHONE_NUMBER_ID",
      "display_phone_number": "+91 98765 43210",
      "verified_name": "Vardaman Sales",
      "quality_rating": "GREEN",
      "status": "APPROVED"
    }
  ]
}
```
*   **Multiple Numbers:** If the WABA contains multiple numbers, the backend registers and saves the first one by default. If manual selection is required in the future, the API can return a list of available numbers to the frontend before proceeding.

---

### Step 2.5 — Register Phone Number (Graph API Register)

To route outbound messages and bind the number to the Meta Cloud API infrastructure, register it with a 6-digit registration PIN:
```
POST https://graph.facebook.com/v25.0/{phoneNumberId}/register
  Headers: 
    Authorization: Bearer {USER_ACCESS_TOKEN}
    Content-Type: application/json
  Body:
    {
      "messaging_product": "whatsapp",
      "pin": "102030"
    }
```
**Response:**
```json
{
  "success": true
}
```
*   *Note:* The 6-digit PIN can be a system-generated random string saved in `WaIntegration.registrationPin` for audit purposes.

---

### Step 2.6 — Webhook App Subscription

Ensure your Meta Developer App is subscribed to the specific WABA webhook events (`messages`, `message_templates`, etc.):
```
POST https://graph.facebook.com/v25.0/{businessAccountId}/subscribed_apps
  Headers: Authorization: Bearer {USER_ACCESS_TOKEN}
```
**Response:**
```json
{
  "success": true
}
```

---

### Step 2.7 — Database Upsert & Cache Warming

Store the retrieved tokens and IDs:
```javascript
const verifyToken = crypto.randomBytes(16).toString("hex");

await prisma.waIntegration.upsert({
  where: { shopId },
  update: {
    verifyToken,
    accessToken: encrypt(userAccessToken), // Encrypted with MASTER_ENCRYPTION_KEY
    businessAccountId,
    phoneNumberId,
    phoneNumber,
    businessName,
    status: "CONNECTED",
    connectedAt: new Date()
  },
  create: {
    shopId,
    verifyToken,
    accessToken: encrypt(userAccessToken),
    businessAccountId,
    phoneNumberId,
    phoneNumber,
    businessName,
    status: "CONNECTED",
    connectedAt: new Date()
  }
});

// Warm cache immediately
await WaCredentialsCache.warm(shopId);
```

---

## 3. Important Webhook: `account_update` Sync

Meta sends webhooks for quality rating shifts, policy enforcement, or phone number status changes. 

When an `account_update` webhook is processed asynchronously:
1. Update `WaIntegration.qualityRating` and `WaIntegration.messagingLimitTier` in the DB.
2. Invalidate `WaCredentialsCache` for the corresponding shop to refresh details.
3. If the account status changes to `BLOCKED` or `DISABLED`, update `WaIntegration.status` to `ERROR` and emit a real-time system alert to the shop owner.

---

## 4. Key Error Scenarios

| Scenario | Cause | Remediation |
|---|---|---|
| User cancels popup | Blocked by popup blocker or closed manual dialog | Frontend handles UI state reset silently |
| Token Debug fails | App secret/ID mismatch | Logs error, returns 400 with "Auth validation failed" |
| Phone registration fails | Number already registered on physical phone | Instruct customer to delete number from physical WhatsApp Business App or use coexistence flow |
| Subscribed Apps fails | App lacks Business Management permission | Log warning, proceed (may require system admin subscription) |
