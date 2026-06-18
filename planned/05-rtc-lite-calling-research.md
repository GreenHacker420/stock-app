# 05 — RTC Lite Calling API: Architecture & Integration Plan

> **Phase 0 Document | No code changes authorised**  
> Last Updated: 2026-06-18

---

## 1. What WhatsApp Business Calling Is

The WhatsApp Business Calling API (RTC Lite) enables VoIP voice calls between WhatsApp users and businesses via the Cloud API. It uses:

- **Signaling:** HTTPS (Graph API + Webhooks) or SIP
- **Media:** WebRTC (ICE + DTLS + SRTP, OPUS codec)

For ShopControl, this means owners and staff can receive and initiate WhatsApp calls directly from the dashboard.

---

## 2. Prerequisites for Calling

| Requirement | Detail |
|-------------|--------|
| Cloud API setup | Phone number must be on Cloud API (not WhatsApp Business app) |
| `whatsapp_business_messaging` permission | Required on app |
| `calls` webhook field subscription | Required (unless SIP only) |
| WABA subscription | App must be subscribed to the WABA |
| Messaging limit | BIC (outbound) requires ≥ TIER_1K (≥1,000 daily) |
| Feature enablement | Must explicitly enable calling on phone number |
| HTTPS endpoint | Required for webhook delivery |

---

## 3. Call Modes

### User-Initiated Call (UIC) — Inbound

```
WhatsApp User ─── taps Call button ──→ Meta
Meta ────── sends 'calls' webhook ──→ ShopControl
ShopControl ─── resolves shop → owner/staff session
ShopControl ─── emits via Socket.IO → browser
Browser ─── generates SDP answer
Browser ─── POSTs /accept with SDP answer → ShopControl
ShopControl ─── calls POST /{phoneNumberId}/calls (accept)
WebRTC media channel established
```

**Timeline:** Business has ~30-60 seconds to accept before call ends.

### Business-Initiated Call (BIC) — Outbound

```
Owner/Staff ─── clicks "Call Customer" in dashboard
Browser ─── generates SDP offer + calls ShopControl API
ShopControl ─── POST /{phoneNumberId}/calls (connect)
Meta ─── returns 200 with call status
Later: Meta ─── sends 'calls' webhook with SDP answer
ShopControl ─── emits SDP answer via Socket.IO → browser
WebRTC established
```

**Requirement:** Customer must have previously granted call permission (unless it's UIC within same session).

---

## 4. API Endpoints

### Initiate / Accept / Reject / Terminate Call

```
POST https://graph.facebook.com/v25.0/{phoneNumberId}/calls
```

**Connect (BIC):**
```json
{
  "action": "connect",
  "to": "919876543210",
  "session": {
    "sdp_type": "offer",
    "sdp": "<RFC 8866 SDP>"
  },
  "biz_opaque_callback_data": "<custom_data>"
}
```

**Pre-Accept (UIC) — Recommended for faster setup:**
```json
{
  "action": "pre_accept",
  "call_id": "<wacid.xxx>",
  "session": {
    "sdp_type": "answer",
    "sdp": "<RFC 8866 SDP>"
  }
}
```

**Accept (UIC):**
```json
{
  "action": "accept",
  "call_id": "<wacid.xxx>",
  "session": {
    "sdp_type": "answer",
    "sdp": "<RFC 8866 SDP>"
  }
}
```

**Reject (UIC):**
```json
{
  "action": "reject",
  "call_id": "<wacid.xxx>"
}
```

**Terminate (either party):**
```json
{
  "action": "terminate",
  "call_id": "<wacid.xxx>"
}
```

---

## 5. Calling Webhooks (field: `calls`)

### UIC: Call Connect Webhook
```json
{
  "entry": [{
    "changes": [{
      "field": "calls",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "phone_number_id": "..." },
        "contacts": [{ "profile": { "name": "Customer Name" }, "wa_id": "919876543210" }],
        "calls": [{
          "id": "wacid.HBgLxxx",           ← Call ID
          "to": "15550001234",
          "from": "919876543210",
          "event": "connect",
          "direction": "USER_INITIATED",
          "timestamp": "1671644824",
          "session": {
            "sdp_type": "offer",
            "sdp": "<RFC 8866 SDP>"         ← SDP Offer from Meta
          }
        }]
      }
    }]
  }]
}
```

### BIC: Call Connect Webhook (SDP Answer)
```json
{
  "calls": [{
    "id": "wacid.xxx",
    "event": "connect",
    "direction": "BUSINESS_INITIATED",
    "session": {
      "sdp_type": "answer",
      "sdp": "<SDP Answer from Meta>"       ← Apply to WebRTC stack
    }
  }]
}
```

### Call Status Webhook (BIC)
```json
{
  "calls": [{
    "id": "wacid.xxx",
    "event": "call_status",
    "status": "RINGING"   // or ACCEPTED, REJECTED
  }]
}
```

### Call Terminate Webhook
```json
{
  "calls": [{
    "id": "wacid.xxx",
    "event": "terminate",
    "start_time": "1671644824",
    "end_time": "1671644924",
    "duration": 100,                        ← Seconds
    "errors": []                            ← If call failed
  }]
}
```

---

## 6. WebRTC Architecture Requirements

### ICE Configuration

| Party | ICE Role |
|-------|----------|
| Meta | ICE-lite (RFC 8445) — passive |
| Business (ShopControl) | Full ICE agent — must initiate connectivity checks |

**Critical:** Meta uses ICE-lite. The BSP (ShopControl / browser) must be a full ICE agent. Using Mediasoup is NOT compatible because it's also ICE-lite. The browser's native WebRTC stack IS a full ICE agent — use browser WebRTC directly.

### TURN Server Requirement

Meta's media relay chooses ICE candidates based on the consumer's location. For international calls or users behind strict NAT, TURN servers are needed.

**Optimus uses Cloudflare TURN:**
```
turn:turn.cloudflare.com:3478?transport=udp
turn:turn.cloudflare.com:3478?transport=tcp
turns:turn.cloudflare.com:5349?transport=tcp
```

**ShopControl should use:** Cloudflare TURN (BYOC) or Metered TURN servers.

### SDP Requirements

```
- RFC 8866 compliant
- Single stream per SDP
- One audio track per stream
- CRLF (\r\n) line endings
- DTMF payload type 126, clock rate 8000
- a=fingerprint line required (for DTLS)
- Codec: OPUS (default) + optional PCMA/PCMU
```

### Media Flow

```
Browser (ICE Full Agent)
    ↓ STUN connectivity checks
    ↓ DTLS handshake
    ↓ SRTP encrypted audio (OPUS)
Meta Media Relay (ICE-lite)
    ↓ SRTP
WhatsApp User's device
```

---

## 7. Call Permission System (For BIC)

Before initiating an outbound call, the user must grant permission:

1. Business sends a **permission request message** to the user
2. User taps "Allow" or "Deny"
3. Business receives `user_preferences` webhook with permission decision
4. Permission can be `temporary` (single call) or `permanent`

```json
{
  "field": "messages",
  "value": {
    "messages": [{
      "type": "system",
      "system": {
        "type": "user_call_permission_reply",
        "is_permanent": true,
        "expiration_timestamp": null,
        "response_source": "user"
      }
    }]
  }
}
```

---

## 8. ShopControl Calling Architecture (Simplified)

For ShopControl V2, calling will be much simpler than Optimus (no AI agent, no call recording, no transcript):

```
                    ShopControl Backend
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Webhook Handler                                        │
│    ├── Receives 'calls' events                         │
│    ├── Resolves shopId from phoneNumberId              │
│    ├── Creates WaCall record                           │
│    └── Publishes to Redis pub/sub: wa:calls:<shopId>   │
│                                                         │
│  Socket.IO (with Redis adapter)                         │
│    ├── All tabs/instances in shop:${shopId} room        │
│    └── Receives WA call event from pub/sub              │
│                                                         │
│  REST API                                               │
│    ├── POST /whatsapp/calls/accept   (store SDP answer) │
│    ├── POST /whatsapp/calls/reject                      │
│    └── POST /whatsapp/calls/terminate                   │
│                                                         │
└─────────────────────────────────────────────────────────┘

Browser (Owner/Staff Dashboard)
  ├── Receives call notification via Socket.IO
  ├── Uses browser's RTCPeerConnection (full ICE agent)
  ├── Generates SDP answer from Meta's SDP offer
  └── POSTs SDP answer to /whatsapp/calls/accept
```

---

## 9. WaCall Schema Design

```prisma
// NEW model needed
model WaCall {
  id              String   @id @default(cuid())
  shopId          String
  metaCallId      String   @unique           // wacid.xxx from Meta
  direction       WaCallDirection             // USER_INITIATED | BUSINESS_INITIATED
  status          WaCallStatus               // RINGING | ACCEPTED | REJECTED | TERMINATED
  customerPhone   String
  customerId      String?
  conversationId  String?
  sdpOffer        String?   @db.Text         // SDP offer from Meta (UIC)
  sdpAnswer       String?   @db.Text         // SDP answer (our response)
  startedAt       DateTime?
  answeredAt      DateTime?
  endedAt         DateTime?
  durationSeconds Int?
  errors          Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  shop            Shop           @relation(...)
  customer        Customer?      @relation(...)
  conversation    WaConversation? @relation(...)
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
```

---

## 10. Calling Event Processing Flow

```
1. 'calls' webhook arrives
2. Resolve shopId from phone_number_id
3. Parse call event (connect/call_status/terminate)
4. On 'connect' (UIC):
   a. Create WaCall record (status=RINGING)
   b. Link to WaConversation + Customer
   c. Publish to Redis: wa:calls:<shopId>
   d. Socket.IO emits to all online owners/staff
   
5. On 'call_status' (BIC - RINGING):
   a. Update WaCall.status = RINGING
   b. Notify via Socket.IO

6. On 'terminate':
   a. Update WaCall (status=TERMINATED, endedAt, durationSeconds)
   b. Notify via Socket.IO
   c. Create WaMessage (type=CALL) in conversation
```

---

## 11. Browser WebRTC Flow (UI)

```javascript
// On receiving call notification via Socket.IO
const peerConnection = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp', ...],
      username: '<cf_turn_username>',
      credential: '<cf_turn_credential>'
    }
  ]
});

// Add local audio track
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

// Set remote description (SDP offer from Meta)
await peerConnection.setRemoteDescription({
  type: 'offer',
  sdp: callData.sdpOffer
});

// Generate SDP answer
const answer = await peerConnection.createAnswer();
await peerConnection.setLocalDescription(answer);

// Wait for ICE gathering
await new Promise(resolve => {
  peerConnection.onicecandidate = e => {
    if (!e.candidate) resolve();
  };
});

// Send SDP answer to backend
await api.post('/whatsapp/calls/accept', {
  callId: callData.metaCallId,
  sdpAnswer: peerConnection.localDescription.sdp
});
```

---

## 12. Implementation Priority

Calling is a **Phase 2** feature for ShopControl. It requires:

1. Redis pub/sub for Socket.IO (Phase 1 prerequisite)
2. WaCall schema model
3. Calling event parser in webhook processor
4. REST endpoints for accept/reject/terminate
5. Browser WebRTC integration in frontend

**Not needed for Phase 1.** The schema should be designed now (document 08) to avoid migrations later.

---

## 13. Calling Constraints Summary

| Constraint | Value |
|-----------|-------|
| UIC accept timeout | 30-60 seconds |
| BIC availability | Not available in USA, Canada, Egypt, Vietnam, Nigeria |
| BIC daily limit | 1 call per user per day (updated Dec 2025) |
| BIC tier requirement | ≥ TIER_1K (1,000 daily msgs) |
| Free calling | UIC = Free; BIC = Per-pulse billed |
| Media codec | OPUS (default) + DTMF 126 |
| ICE type | BSP must be full ICE agent (not ICE-lite) |
| SIP alternative | Available but requires separate enablement |
