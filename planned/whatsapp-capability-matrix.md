# ShopControl WhatsApp Capability Matrix

> Audit date: 2026-06-19  
> Repository target: Meta Graph API `v25.0`  
> Scope: WhatsApp Business Platform Cloud API, including Calling API

## Status Rules

- **Existing** means the capability works end to end across persistence, backend, tenant isolation, and usable UI.
- **Partial** means some schema, parser, API, worker, or UI exists, but the complete production workflow does not.
- **Missing** means no meaningful implementation exists.
- **Restricted** means Meta support depends on country, account eligibility, rollout, permission, or business configuration.

## Executive Assessment

ShopControl has a credible platform foundation: tenant resolution by phone number ID, strict webhook signatures, async inbound and outbound queues, encrypted credentials, Redis caching, media download, message status updates, contact synchronization, broadcasts, template and Flow synchronization, replies, reactions, recall, archive, and an Embedded Signup prototype.

The main limitation is breadth rather than basic infrastructure. The outbound service only compiles text, templates, and four linked media types. The webhook parser recognizes more types than the mobile application can render. Templates, Flows, Embedded Signup, commerce, business profile, management webhooks, and calling all require fuller lifecycle models and UI.

## Master Matrix

| Capability | Meta | Existing | Partial | Missing | Recommended | Phase |
|---|---:|---:|---:|---:|---|---|
| Multi-tenant WABA credentials | Yes | Yes |  |  | Keep shop isolation; add capability snapshots and token lifecycle | 3 |
| Unified webhook tenant routing | Yes | Yes |  |  | Retain `phone_number_id` lookup and strict HMAC | 3 |
| Async webhook processing | Yes | Yes |  |  | Persist raw envelopes before normalization | 3 |
| Outbound queue, retry, DLQ alert | Yes | Yes |  |  | Add error classification, replay, metrics | 3 |
| Redis credential/window cache | Yes | Yes |  |  | Add device presence and call routing leases | 3 |
| Plain text | Yes | Yes |  |  | Add typed command validation | 3 |
| URL previews | Yes |  |  | Yes | Add `previewUrl` to text payload | 3 |
| Context replies | Yes | Yes |  |  | Preserve richer parent summary in UI | 3 |
| Image, document, audio, video inbound | Yes |  | Yes |  | Parser/storage exist; complete rendering and upload/send UI | 3 |
| Image, document, audio, video outbound | Yes |  | Yes |  | Backend supports links; add upload IDs, captions, filenames, voice flag | 3 |
| Voice notes | Yes |  |  | Yes | Treat as audio with voice metadata and dedicated recorder/player | 3 |
| Stickers | Yes |  | Yes |  | Inbound only; add rendering and constrained outbound support | 3 |
| Reactions | Yes | Yes |  |  | Add policy/error handling and test coverage | 3 |
| Location | Yes |  | Yes |  | Inbound stored but not typed in app; add send/render/map actions | 3 |
| Location request | Yes |  |  | Yes | Add interactive request compiler and response handling | 3 |
| Contacts | Yes |  | Yes |  | Inbound stored; add structured cards and outbound contact payload | 3 |
| Reply buttons and quick replies | Yes |  | Yes |  | Inbound replies parsed; outbound compiler and UI missing | 3 |
| List and section-list messages | Yes |  | Yes |  | Inbound replies parsed; outbound list builder missing | 3 |
| CTA URL and phone buttons | Yes, context-dependent |  | Yes |  | Template raw components sync; no typed send/create UI | 3 |
| Dynamic URLs and deep links | Yes, context-dependent |  | Yes |  | Preserve suffix variables and validate domains/actions | 3 |
| WhatsApp Flows messages | Yes |  | Yes |  | Reply parsing and endpoint exist; send compiler and lifecycle UI missing | 3 |
| Single-product messages | Yes, commerce eligible |  |  | Yes | Add catalog/product mapping and interactive compiler | 4 |
| Multi-product messages | Yes, commerce eligible |  |  | Yes | Add section/product validation and catalog adapter | 4 |
| Catalog messages | Yes, commerce eligible |  |  | Yes | Implement after catalog connection and product sync | 4 |
| Inbound order messages | Yes, commerce eligible |  | Yes |  | Payload stored as generic text due missing type mapping; add order snapshot | 4 |
| Order status messages | Restricted by market/product |  |  | Yes | Capability-gate; map ERP order state through adapter | 4 |
| Template synchronization | Yes |  | Yes |  | Sync works but fields, pagination, deletion, quality, and webhooks incomplete | 3 |
| Template sending | Yes |  | Yes |  | Body text variables work; headers, buttons, cards, OTP, media incomplete | 3 |
| Template creation and editing | Yes |  |  | Yes | Add after reliable sync/send; Meta remains approval authority | 5 |
| Marketing templates | Yes |  | Yes |  | Generic raw sync/send only | 3 |
| Coupon/offer/LTO templates | Yes, policy-dependent |  |  | Yes | Typed subtype support and expiration validation | 3 |
| Carousel templates | Yes |  |  | Yes | Add card model, preview, media and button variables | 3 |
| Utility templates | Yes |  | Yes |  | Generic raw sync/send only | 3 |
| Location templates | Restricted/format-dependent |  |  | Yes | Verify account availability; capability-gate | 3 |
| Authentication OTP templates | Yes |  |  | Yes | Add one-tap, zero-tap, copy-code metadata and app signing | 3 |
| Call permission templates | Yes, calling eligible |  |  | Yes | Add as part of outbound calling | 4 |
| Flow list synchronization | Yes |  | Yes |  | Only ID/name/status synchronized | 3 |
| Flow CRUD/assets/publish | Yes |  |  | Yes | Build managed JSON lifecycle with Meta deployment authority | 3 |
| Flow E2EE endpoint | Yes |  | Yes |  | Crypto exists; routing is hard-coded to ERP item demo | 3 |
| Flow execution tracking | Yes, locally modeled |  | Yes |  | No send path reliably creates execution tokens | 3 |
| Catalog APIs and product sync | Yes |  |  | Yes | Add anti-corruption adapters and external mappings | 4 |
| Payment requests/status | Restricted |  |  | Yes | Eligibility-gated adapter; never auto-settle ERP payment | Future |
| Message status webhooks | Yes | Yes |  |  | Link statuses to broadcast recipients and pricing metadata | 3 |
| Message subtype webhooks | Yes |  | Yes |  | Parser broad, rendering and exact type preservation incomplete | 3 |
| Template management webhooks | Yes |  |  | Yes | Store, project, alert, and refresh templates | 3 |
| Phone quality/name webhooks | Yes |  |  | Yes | Update integration health and notify owners | 3 |
| Account/capability/review events | Yes |  |  | Yes | Add field router and integration state projection | 3 |
| User preferences | Yes |  |  | Yes | Store marketing and call permission choices | 3/4 |
| Immutable raw webhook archive | Recommended |  |  | Yes | Add envelope table, retention, replay, quarantine | 3 |
| Embedded Signup | Yes |  | Yes |  | Prototype exists; production state, selection, rollback, token lifecycle missing | 5 |
| Tech Provider / partner lifecycle | Restricted |  |  | Yes | Implement only after Meta app eligibility and verification | 5 |
| Automatic asset assignment | Restricted |  |  | Yes | Add onboarding workflow and asset audit state | 5 |
| Business profile read/update | Yes |  |  | Yes | Add profile projection, image upload, editor, sync errors | 5 |
| Business hours | API/rollout dependent |  |  | Yes | Verify field availability; do not simulate unsupported Meta fields | 5 |
| Broadcast foundation | Yes through template sends |  | Yes |  | Workers/API exist; no mobile campaign UI and status reconciliation incomplete | 3 |
| Conversation archive | Local platform feature | Yes | Yes |  | API/UI exist; clarify local-only deletion/archive semantics | 3 |
| Conversation assignment | Local platform feature |  | Yes |  | Schema field exists; no assignment history, API, permissions, or UI | 3 |
| Internal notes | Local platform feature |  |  | Yes | Add separate note model, never send as WhatsApp message | Future |
| Conversation workflow status | Local platform feature |  |  | Yes | Add open/pending/resolved states and audit history | Future |
| Inbound user-initiated calls | Calling API |  |  | Yes | Direct WebRTC app endpoint with backend signaling | 3 |
| Outbound business-initiated calls | Calling API, restricted |  |  | Yes | Permission-gated direct WebRTC calling | 4 |
| Call permission requests | Calling API |  |  | Yes | Store grants, expiry, request limits, and replies | 4 |
| Calling settings/hours/callback | Calling API |  |  | Yes | Owner settings synchronized with Meta | 4 |
| Native incoming-call UI | Mobile OS |  |  | Yes | CallKit/PushKit and Android Telecom/high-priority FCM | 3 |
| Device registry and presence | Local platform feature |  | Yes |  | Single push token exists; replace with multi-device records and Redis presence | 3 |
| Targeted agent routing | Local platform feature |  |  | Yes | Assigned agent, available agent, owner fallback with atomic lease | 3 |
| Call history and analytics | Calling API/local |  |  | Yes | Persist lifecycle, duration, agent, errors, and billing metadata | 3/4 |

## Repository Evidence

Primary implementation evidence:

- `backend/src/services/whatsapp.service.js`: text, templates, linked media, replies, reactions, recall, template/Flow sync.
- `backend/src/services/whatsapp.processor.js`: statuses and inbound message parsing.
- `backend/src/controllers/whatsapp.controller.js`: webhook routing, setup, Embedded Signup prototype, conversations, broadcasts.
- `backend/src/controllers/whatsapp.flow-endpoint.controller.js`: Flow E2EE data exchange.
- `backend/src/workers/whatsapp/*`: inbound, outbound, media, and broadcast processing.
- `backend/prisma/schema.prisma`: integration, conversation, message, template, Flow, and broadcast models.
- `stock/src/modules/whatsapp/*`: chat, template variables, contact book, setup, and realtime UI.

## UI Exposure Map

| Capability group | Current UI | Planned UI |
|---|---|---|
| Conversations and text | Chat list/detail, text composer, replies, reactions, recall | Typed states, assignment, workflow status |
| Media | Basic inbound image handling | Attachment composer, upload progress, audio/video/document/sticker renderers |
| Interactive messages | Template picker only | Buttons, lists, location request, products, and Flow composer |
| Templates | Approved-template picker with body variables | Library, lifecycle details, typed parameters, preview, administration |
| Flows | Setup key rotation only | Flow library, editor, validation, preview, publishing, executions |
| Broadcasts | No dedicated mobile campaign UI | Campaign creation, audience, scheduling, recipients, failures, metrics |
| Commerce | None | Catalog setup, mappings, product picker, order review |
| Payments | Existing ERP payment UI only | Eligibility, request, status, and reconciliation when activated |
| Webhook/account health | Setup connection state only | Integration health, quality, capability, policy, and replay operations |
| Embedded Signup | Prototype connection screen | Resumable signup, asset selection, reauthorization, disconnect |
| Business profile | None | Customer-visible profile preview and owner editor |
| Multi-agent inbox | Archive actions; assignment field not exposed | Assignment, availability, status, ownership history, notes later |
| Calling | None | Native incoming UI, active call, outbound permission flow, history, settings |

## Cross-Cutting Architecture

1. Introduce a typed WhatsApp platform service rather than adding more `if (type === ...)` branches.
2. Preserve a raw Meta payload and a normalized projection for every webhook event.
3. Keep ERP entities authoritative and connect them through adapters and mapping tables.
4. Add integration capability flags so country-, account-, and rollout-restricted UI stays hidden.
5. Treat Meta as authoritative for template, Flow deployment, catalog, profile, account, payment, and calling capability state.
6. Add device-level push and presence before native calling.
7. Add fixture-based tests for every normalized webhook type.

## Primary References

- [WhatsApp Business Platform documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp)
- [Cloud API message guides](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)
- [WhatsApp Flows](https://developers.facebook.com/docs/whatsapp/flows)
- [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup)
- [Webhook fields reference](https://dualhook.com/docs/webhooks) used as a secondary index; behavior must be verified against Meta before implementation.
- [Calling API reference](https://dualhook.com/docs/calling-api-reference) used as a secondary index; endpoint contracts must be verified against Meta before implementation.
