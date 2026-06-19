# ShopControl WhatsApp Platform Roadmap

> Audit date: 2026-06-19

## Implementation Checkpoint

### Current Completion

| Workstream | Approximate completion | Current state |
|---|---:|---|
| Platform foundation | 70% | Durable webhooks, management projection, typed commands, queues, assets, and tenant routing exist; replay UI, quarantine operations, idempotency, metrics, and broadcast reconciliation remain |
| Messaging types | 75% | Text, replies, image/video/document media, voice recording/playback, location, contacts, buttons, lists, templates, and Flow sends exist; stickers, location request, richer renderers, and policy-aware retry remain |
| Templates | 30% | Sync and basic variable sending exist; pagination, lifecycle administration, typed headers/buttons/carousels/coupons/OTP, previews, and quality handling remain |
| Flows | 25% | Sync, send contract, execution schema, and E2EE endpoint exist; CRUD, validation, deployment, registered handlers, retries, and execution UI remain |
| Inbox and assignment | 25% | Conversation views, archive, assignment field, filters, and realtime updates exist; assignment commands/history, ownership permissions, workflow status, and notes remain |
| Inbound calling | 5% | Capability flag and architecture plan exist; device registry, presence, call models, routing, signaling, WebRTC, native call UI, and history remain |
| Phase 3 overall | ~35% | Messaging foundation is usable, but calling and lifecycle management are major unfinished workstreams |
| Phase 4 | <5% | Commerce and outbound calling remain planning-only |
| Phase 5 | 15% | Embedded Signup prototype exists; durable onboarding, partner lifecycle, and business profile remain |

Completed after the audit:

- Immutable webhook envelopes, management event normalization, and integration health projection.
- Typed outbound `/whatsapp/messages` contract with text, replies, media, location, contacts, buttons, lists, templates, and Flows.
- React Native structured-message actions for templates, contacts, location, reply buttons, and lists.
- Tenant-authorized image, video, document, and voice-note upload to private storage and Meta media, including preview, recording, playback, progress, cancellation, captions, and queued sends by Meta media ID.
- Generic tenant-scoped `Asset` registry owns S3 identity, Meta identity, checksums, lifecycle state, signed delivery URLs, and reusable message linkage; mobile contracts use only internal asset IDs.

Next dependency-ordered work:

1. Dedicated renderer registry and media open/play actions.
2. Complete typed template components, previews, and lifecycle sync.
3. Flow CRUD, validation, deployment, and execution tracking.
4. Device registry and presence foundation before inbound calling.
5. Assignment commands and ownership history.

## Architecture Direction

Build a standalone, tenant-scoped WhatsApp Platform Layer.

- Meta is authoritative for templates, Flow deployment, catalogs, profile, account capabilities, payment availability, and calling availability.
- ShopControl is authoritative for customers, inventory, orders, sales, payments, staff, permissions, assignment, and workflow.
- Raw Meta payloads are retained with normalized projections.
- ERP integrations use adapters and domain commands, not webhook-side table mutations.
- React Native receives stable typed platform contracts rather than Graph API payloads.

## Phase 3: Messaging, Webhooks, Inbox, and Inbound Calling

### Platform Foundation

- Add immutable webhook envelopes, field routing, replay, quarantine, and management event handlers.
- Add integration capability snapshots and health projection.
- Introduce typed message command schemas and payload compilers.
- Correct semantic storage for order, system, unsupported, interactive, location, and contacts.
- Add outbound media upload-to-Meta support and captions/metadata.
- Reconcile message status with broadcasts.
- Add WhatsApp fixture test suites and queue observability.

### Messaging

- URL previews.
- Voice notes.
- Stickers where supported.
- Location and location request.
- Contacts.
- Reply buttons, quick replies, lists, and section lists.
- Complete context reply behavior.
- Flow send messages.
- Complete template parameter compiler.

### Templates and Flows

- Full template sync pagination and lifecycle webhooks.
- Typed media/button/carousel/coupon/OTP component support.
- Flow CRUD, JSON validation, upload, preview, publish, deprecate, and execution creation.
- Replace hard-coded Flow endpoint behavior with registered handlers.

### Inbox and UI

- Typed renderer registry.
- Attachment/interactive composer.
- Template and Flow send sheets.
- Structured location/contact/order/system fallback views.
- Assignment API and UI with audit history.
- Local conversation workflow groundwork.

### Inbound Calling

- `UserDevice` registry and migration away from a single push token.
- Redis device presence and agent availability.
- `WaCall`, route attempt, and call permission models.
- Calling webhook normalization.
- Assigned-agent-first routing and atomic leases.
- Native iOS/Android call delivery.
- Direct WebRTC inbound sessions.
- Active call provider above navigation.
- Call history and settings readiness.

### Phase 3 Acceptance

- Every documented inbound message fixture is retained without semantic loss.
- Supported outbound kinds are validated and queue-safe.
- Unknown webhooks are stored and visible operationally.
- A locked/backgrounded selected agent can answer an inbound call.
- Only one user can claim a call.
- Media traffic never traverses ShopControl servers.

## Phase 4: Commerce and Outbound Calling

### Commerce

- Catalog connection and capability detection.
- Product and product-set mapping.
- Queued product synchronization and reconciliation.
- Single-product, multi-product, and catalog messages.
- Inbound order snapshots and reviewed conversion to ERP orders.
- Capability-gated order status messages.
- Commerce setup, mapping, product picker, and order review UI.

### Outbound Calling

- Call permission state and request messages/templates.
- Business-initiated call eligibility checks.
- Direct WebRTC outbound connect flow.
- Call settings, hours, holiday, call icon, and callback behavior.
- Permission request limits and expiry.
- Call buttons/deep links where supported.
- Routing and call operational analytics.

### Phase 4 Acceptance

- Product state synchronizes without blocking ERP transactions.
- Duplicate commerce orders cannot create duplicate ERP orders.
- Outbound call cannot start without current capability and permission.
- Outbound signaling is restricted to the initiating device.

## Phase 5: Onboarding, Partner Features, and Profile

### Embedded Signup

- Durable signed onboarding sessions.
- Explicit WABA and phone selection.
- Token ownership, expiry, validation, and reauthorization.
- Resumable steps and partial-failure recovery.
- Coexistence/migration-aware paths.
- Production disconnect and asset lifecycle.

### Partner Features

- Tech Provider/Solution Partner workflows only after Meta approval.
- Automatic asset assignment verification.
- Partner solution and account lifecycle webhooks.
- Offboarding, reconnection, and permission revocation handling.

### Business Profile

- Read/update profile fields and image.
- Profile projection, sync, errors, and audit.
- Business hours only where current Meta capability supports them.
- Owner-facing profile editor.

### Phase 5 Acceptance

- Owners can onboard without manual credentials.
- Secrets never return to the mobile application.
- Onboarding can resume safely after each failure point.
- Asset removal or token expiry produces an actionable integration state.

## Future

### Payments

- Activate only for eligible WABAs/countries/providers.
- Provider-neutral adapter and reconciliation.
- Never settle ERP payment from webhook alone.

### Multi-Agent Operations

- Internal notes.
- Open/pending/resolved workflow.
- Team ownership and routing policies.
- SLA queues and advanced escalation.

### Automation and Analytics

- Rule-based workflows.
- AI drafting and summarization with explicit operator control.
- Template, campaign, Flow, commerce, and call analytics.
- Cost and quality dashboards.

## Public API Program

Version platform contracts and add:

- `/whatsapp/messages`
- `/whatsapp/media`
- `/whatsapp/templates/*`
- `/whatsapp/flows/*`
- `/whatsapp/catalogs/*`
- `/whatsapp/commerce-orders/*`
- `/whatsapp/business-profile`
- `/whatsapp/onboarding/*`
- `/whatsapp/devices/*`
- `/whatsapp/calling/*`
- `/whatsapp/calls/*`
- `/whatsapp/call-permissions/*`

Use Zod validation, idempotency keys, tenant authorization, audit logging, and redacted errors.

## Data Migration Order

1. Webhook envelopes and normalized event metadata.
2. Message semantic fields and capability snapshot.
3. Device registry and presence support.
4. Assignment history and call models.
5. Template/Flow lifecycle expansions.
6. Catalog/product/order mapping.
7. Profile and onboarding session models.
8. Payment models only when activation is approved.

Migrations must be additive first. Backfill existing messages from current type/content where possible without inventing semantics.

## React Native Program

### Shared Infrastructure

- Capability-aware action registry.
- Message renderer registry.
- Attachment and action sheets.
- Device registration and push handling.
- Calling provider above navigation.

### Native Build

- Keep React Navigation.
- Use the existing Expo development client.
- Add WebRTC and native call integrations through config plugins/local Expo modules.
- Maintain foreground, background, killed, and lock-screen test matrices.

### UI Quality

- Operational, compact interfaces consistent with the existing app.
- No nested decorative cards.
- Stable message and call-control dimensions.
- Icons for familiar actions.
- Accessible labels and touch targets.
- Explicit loading, empty, offline, restricted, and failed states.

## Reliability and Observability

- Metrics by tenant, field, queue, message kind, template, Flow, commerce sync, and call state.
- Correlation IDs from webhook envelope to message/call/order projection.
- Error classification and bounded retries.
- Dead-letter replay.
- Alert on account restrictions, quality degradation, token expiry, queue lag, catalog disconnect, Flow endpoint failures, and calling delivery failures.
- Redact customer content, SDP, secrets, OTPs, and payment-sensitive data.

## Release Strategy

- Capability flags per integration and feature.
- Internal/test WABA first.
- Shadow normalization for new webhook fields before UI exposure.
- Staff pilot for messaging UI.
- Inbound calling pilot with owner-only routing, then assigned-agent routing.
- Commerce pilot with read-only catalog sync before writes.
- Embedded Signup rollout after account lifecycle handling is verified.

## Source Documents

- [Capability matrix](./whatsapp-capability-matrix.md)
- [Messaging review](./whatsapp-messaging-types-review.md)
- [Template review](./whatsapp-template-capabilities.md)
- [Flows review](./whatsapp-flows-review.md)
- [Commerce review](./whatsapp-commerce-review.md)
- [Payments review](./whatsapp-payments-review.md)
- [Webhooks review](./whatsapp-webhooks-review.md)
- [Embedded Signup review](./whatsapp-embedded-signup-review.md)
- [Business profile review](./whatsapp-business-profile-review.md)
- [Calling review](./whatsapp-calling-review.md)
