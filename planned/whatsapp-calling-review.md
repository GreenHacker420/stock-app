# WhatsApp Calling Review and Native App Architecture

> Audit date: 2026-06-19  
> Scope: voice calling through Graph API/webhook signaling and direct WebRTC media  
> Explicit exclusions: SIP, PSTN, media servers, recording, transcription, mixing, conferencing, ShopControl TURN infrastructure
>
> Implementation checkpoint updated: 2026-06-20

## Implementation Checkpoint

The calling prerequisite layer now includes:

- Multi-device `UserDevice` records with stable app-installation identity.
- Expo, native push, and future VoIP-token slots without exposing tokens in API responses.
- App/build/device/OS metadata, notification capability, revocation, and last-seen state.
- Short-lived Redis presence keyed by device and indexed by shop.
- Foreground, background, in-call, unavailable, and disconnected presence states.
- Authenticated HTTP heartbeats and Socket.IO heartbeats every 25 seconds.
- Socket ownership tied to the registered device ID and authenticated user.
- Presence expiry after 75 seconds so stale sockets are not considered available.
- Compatibility handling for the former single-user push-token endpoint.

Still missing:

- Agent-level availability preferences distinct from device foreground state.
- `WaCall`, route-attempt, permission, and calling-settings models.
- Calling webhook normalization and Graph signaling actions.
- Atomic call routing leases and push delivery.
- Native WebRTC and system call UI.

## Decision

Support both:

- User-initiated inbound calls.
- Permission-gated business-initiated outbound calls.

The ShopControl React Native application is the WebRTC endpoint. The backend is a signaling, authorization, routing, push, and state service only.

```text
ShopControl App                           Meta
RTCPeerConnection  <--- ICE/DTLS/SRTP ---> RTC edge <--- WhatsApp user
        |
        | SDP/control only
        v
ShopControl Backend <--- Graph API/webhooks ---> Meta signaling
```

No call audio is proxied, stored, recorded, inspected, or transformed by ShopControl.

## Meta Capability Matrix

| Capability | Availability | ShopControl |
|---|---|---|
| User-initiated calling | Calling-enabled Cloud API number | Foundation only |
| Business-initiated calling | Country/account/permission restricted | Missing |
| `connect` | Calling API | Missing |
| `pre_accept` | User-initiated calling | Missing |
| `accept` / `reject` / `terminate` | Calling API | Missing |
| Call connect/status/terminate webhooks | `calls` field | Missing |
| Call settings | Calling-enabled number | Only `callingEnabled` schema flag |
| Call hours/holiday schedule | Calling settings | Missing |
| Call icon visibility | Calling settings | Missing |
| Callback permission behavior | Calling settings | Missing |
| Call permission request | Outbound calling | Missing |
| Call permission state/reply | Outbound calling | Missing |
| Voice-call template/button/deep link | Eligibility/context dependent | Missing |
| Call analytics/billing metadata | Account capability dependent | Missing |

All country restrictions, limits, billing, permission duration, and settings fields must be rechecked against current Meta documentation before coding.

## Prerequisites

- Phone number is eligible and calling is enabled.
- App has required messaging permissions.
- WABA subscribes to the `calls` webhook field.
- A valid payment/billing configuration exists when Meta requires it.
- Business-initiated calling is allowed for the number’s country.
- The user has a valid call permission for outbound calling.
- ShopControl uses a custom Expo development/production build.

Coexistence-number support must be verified rather than assumed.

## Backend Responsibilities

- Validate and persist calling webhooks.
- Resolve shop, conversation, customer, and permission state.
- Select exactly one target user at a time.
- Relay SDP without logging it.
- Call Meta actions.
- Maintain durable call state.
- Enforce a single accepted agent.
- Deliver socket or native push signaling.
- Handle timeout, escalation, and restart recovery.
- Store lifecycle metadata, not media.

## Mobile Responsibilities

- Own `RTCPeerConnection`.
- Capture microphone audio.
- Generate SDP offer/answer.
- Apply remote SDP.
- Run the full ICE agent.
- Manage audio focus/session, earpiece, speaker, Bluetooth, interruptions, and mute.
- Display native and in-app call UI.
- Report readiness and local failure to the backend.
- Terminate local media immediately when the durable call ends.

## Native Stack

Recommended packages and native integrations:

- `react-native-webrtc`
- `react-native-callkeep` or a maintained equivalent
- iOS CallKit
- iOS PushKit VoIP pushes, subject to current Apple policy
- Android Telecom/ConnectionService
- High-priority FCM for Android call delivery
- Expo config plugins or a local Expo module

This cannot run in Expo Go. The repository already uses `expo-dev-client`, so calling should be added to the custom build.

Add:

- iOS microphone usage description, background audio/VoIP modes, CallKit configuration.
- Android `RECORD_AUDIO`, foreground service, microphone service type, Bluetooth/audio and Telecom requirements appropriate to the selected libraries and target SDK.
- Native capability validation at startup.

## Data Model

### `WaCall`

- Shop and integration IDs.
- Unique Meta call ID.
- Conversation and customer.
- Direction.
- Durable status.
- Customer WhatsApp identifier.
- Target user and accepted user.
- Target attempt number.
- Opaque callback data.
- SDP offer/answer encrypted or short-retention protected fields.
- Meta event timestamps.
- Created, ringing, pre-accepted, accepted, connected, ended timestamps.
- Duration, termination reason, errors, pricing/billing metadata.
- Last event ID and version for ordering.

### `WaCallRouteAttempt`

- Call, user, and selected device.
- Reason: assigned, available, owner fallback.
- Offered, acknowledged, expired, accepted, cancelled timestamps.
- Socket or push delivery channel.
- Outcome.

### `WaCallPermission`

- Shop, customer/WhatsApp identifier.
- Status.
- Permanent/temporary.
- Granted and expiry timestamps.
- Request counters and next eligible request time.
- Source and last webhook.

### `UserDevice`

Replace the single `User.pushToken` design:

- User and device installation ID.
- Platform.
- Standard push token.
- iOS VoIP token where applicable.
- App/build version.
- Notification/call capability.
- Last seen and revoked timestamp.

Presence remains in Redis, not as a durable truth column.

## Call State Machine

```text
RECEIVED | CREATING
  -> ROUTING | OUTBOUND_CONNECTING
  -> TARGETED | RINGING
  -> PRE_ACCEPTING
  -> ACCEPTED
  -> CONNECTING
  -> ACTIVE
  -> TERMINATING
  -> ENDED
```

Terminal alternatives:

- REJECTED
- MISSED
- FAILED
- CANCELLED
- PERMISSION_REQUIRED
- ROUTING_EXHAUSTED

Transitions use optimistic version checks or conditional updates. Duplicate and late webhooks must not resurrect an ended call.

## Assigned-Agent-First Routing

### Eligibility

A user is eligible when:

- Authorized for the shop and calling permission.
- Has at least one capable, non-revoked device.
- Is not marked unavailable.
- Is not already handling another call.

### Selection

1. Prefer `WaConversation.assignedToId` when eligible and recently present.
2. Otherwise select one eligible active user by least-recently-routed ordering.
3. Otherwise select the owner.
4. If no one can receive the call, reject or allow Meta callback behavior according to settings.

### Lease

Use Redis Lua or an equivalent atomic operation:

```text
wa:call:<callId>:route-lease
wa:user:<userId>:call-lease
```

The lease binds the call to one user and attempt until accepted, rejected, or expired. Database state remains the recovery source of truth.

### Delivery

- If a selected device has a live authenticated socket, send `wa:call_targeted`.
- Otherwise send native call push to the selected user’s capable devices.
- Multiple devices belonging to the same selected user may display the call, but acceptance atomically claims the call for one device.
- Never broadcast ring events to the shop room.

### Escalation

- Target timeout is configurable.
- Cancel the previous user’s native/in-app ringing before selecting the next user.
- Record every attempt.
- Stop escalation when Meta terminates the call or the total inbound answer window is nearly exhausted.

## Presence

Redis keys:

```text
wa:presence:<shopId>:<userId>:<deviceId>
```

Heartbeat data:

- Foreground/background.
- Socket connection ID.
- Last activity.
- Call capability.
- Availability: available, unavailable, in_call.

Presence has a short TTL. It improves routing but does not grant ownership.

## Signaling APIs

```text
GET  /whatsapp/calling/capability
GET  /whatsapp/calling/settings
PATCH /whatsapp/calling/settings

POST /whatsapp/devices/register
POST /whatsapp/devices/heartbeat
POST /whatsapp/devices/revoke

GET  /whatsapp/calls
GET  /whatsapp/calls/:id
POST /whatsapp/calls/:id/acknowledge
POST /whatsapp/calls/:id/pre-accept
POST /whatsapp/calls/:id/accept
POST /whatsapp/calls/:id/reject
POST /whatsapp/calls/:id/terminate
POST /whatsapp/calls/connect

GET  /whatsapp/call-permissions/:waId
POST /whatsapp/call-permissions/:waId/request
```

The app sends SDP only over authenticated TLS. APIs return it only to the currently leased/accepted device.

## Signaling Flows

### Inbound

1. Meta sends `calls.connect` with offer.
2. Backend persists call and starts routing.
3. Selected app receives native/socket call notification.
4. App creates peer connection, applies offer, captures audio, and generates answer.
5. App acknowledges and requests `pre_accept`.
6. Backend verifies lease and calls Meta.
7. User answers in native UI; app calls `accept`.
8. Backend calls Meta `accept`.
9. App and Meta exchange media directly.
10. Either side ends; backend and app converge on terminal state.

### Outbound

1. App checks capability and permission.
2. App creates peer connection and SDP offer.
3. Backend creates call and sends Meta `connect`.
4. Meta webhook supplies SDP answer.
5. Backend sends answer only to initiating device.
6. App applies answer.
7. Status webhooks update ringing/accepted/rejected.
8. Media flows directly after connection.

## Socket Events

- `wa:call_targeted`
- `wa:call_routing_changed`
- `wa:call_connect`
- `wa:call_status`
- `wa:call_claimed`
- `wa:call_ended`
- `wa:call_permission_updated`
- `wa:calling_settings_updated`

Every event includes call ID, projection version, and minimal UI-safe data. SDP is delivered through a restricted signaling response/event, never a broad room.

## React Native Architecture

Place a `CallingProvider` above authenticated navigation, alongside realtime:

```text
App
  RealtimeProvider
    CallingProvider
      Navigation
```

Services:

- `call-signaling.api.ts`
- `webrtc-session.service.ts`
- `native-call.service.ts`
- `audio-route.service.ts`
- `call-push-handler.ts`
- `call-store.ts`

The provider owns the session so navigation changes do not destroy the peer connection.

## React Native UI

### Native Incoming Screen

- Customer/contact name.
- Shop identity.
- Answer and decline.
- Native recent-call integration only if product/legal requirements approve it.
- Correct cancellation when routing moves or another device answers.

### In-App Incoming Banner

- Compact nonblocking banner.
- Contact, shop, answer, reject.
- Expand to full call screen.

### Active Call Screen

- Contact avatar/name and linked customer.
- Direction and connection state.
- Tabular duration.
- Mute, speaker/audio route, Bluetooth route, keypad, and end.
- Reconnecting state without misleading “active” status.
- No recording control.

### Outbound Experience

- Call button in chat header and customer detail.
- Permission state shown before initiation.
- Permission request action when allowed.
- Confirmation with selected number/shop.
- Ringing, rejected, unavailable, permission-required, and failed states.

### History

- Calls integrated into conversation timeline and a call history screen.
- Direction, outcome, agent, time, duration.
- Missed-call follow-up action.
- No audio playback.

### Settings

- Calling enabled state.
- Call icon visibility.
- Hours/holidays/callback behavior where Meta supports them.
- Authorized roles/users.
- Personal availability toggle.
- Device call capability and troubleshooting state.

## Failure Handling

- Microphone denied: fail before accepting; provide settings action.
- SDP/ICE failure: terminate through backend and persist reason.
- App killed after targeting: native push recreates call context.
- Socket loss: call state continues through native layer and REST signaling.
- Backend restart: recover active calls from DB/Redis and await Meta terminal events.
- Network handoff: rely on peer connection state; show reconnecting and apply timeout.
- Audio interruption: integrate native audio focus and interruption callbacks.
- Duplicate accept: conditional DB claim returns already-answered state.
- Remote hangup: end native UI and release media/leases immediately.

## Security and Privacy

- Authorize every call action against shop access, route lease, and device.
- Short retention or protected storage for SDP.
- Never log SDP, tokens, microphone data, or raw call push secrets.
- Bind push payloads to signed opaque call tokens.
- Rate-limit outbound calls and permission requests.
- Retain audit metadata according to policy.
- Verify tenant isolation for sockets, pushes, calls, and devices.

## Tests

### Backend

- Calling webhook fixtures and duplicate/out-of-order events.
- Assigned agent, unavailable assigned agent, least-recent route, owner fallback.
- Lease expiry, reroute, simultaneous accept, and restart recovery.
- Permission granted, expired, denied, absent.
- No cross-tenant SDP access.

### Mobile

- Foreground, background, killed, and locked-device inbound calls.
- iOS CallKit/PushKit and Android Telecom/FCM.
- Multiple devices for one user.
- Microphone denial and native settings recovery.
- Mute, speaker, Bluetooth, audio interruption.
- Network handoff and ICE failure.
- Remote/local terminate and native UI cleanup.

### Boundary

- Packet/architecture verification that media does not reach ShopControl servers.
- Logs and telemetry contain no SDP or media.

## References

- [WhatsApp Business Platform documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp)
- [Calling API secondary reference](https://dualhook.com/docs/calling-api-reference)
- [User-initiated calling secondary reference](https://dualhook.com/docs/calling-user-initiated)
- [Business-initiated calling secondary reference](https://dualhook.com/docs/calling-business-initiated)
