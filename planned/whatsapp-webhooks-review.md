# WhatsApp Webhooks Review

> Audit date: 2026-06-19

## Current State

The webhook controller correctly:

- Resolves tenants from `metadata.phone_number_id`.
- Requires a valid `X-Hub-Signature-256`.
- Pushes payloads to BullMQ.
- Returns quickly.

The processor only understands the contents of `messages` changes. Management fields such as template quality/status, phone quality/name, account updates, capability updates, user preferences, payment configuration, settings, and calls are ignored.

`WaWebhookEvent` stores only a generated ID, coarse event type, shop, and timestamp. It is not an immutable webhook archive and cannot support replay or diagnosis.

## Field Matrix

| Webhook field/event | Current | Storage | Socket behavior |
|---|---|---|---|
| `messages`: text/media/location/contacts | Partial | Normalize message and raw envelope | Message received |
| `messages`: interactive replies | Partial | Preserve subtype and action IDs | Message received |
| `messages`: order/system/unsupported | Partial | Correct semantic type plus raw payload | Message/system event as appropriate |
| `statuses`: sent/delivered/read/failed | Existing | Message status, timestamps, errors, pricing | Status update |
| Template status update | Missing | Template lifecycle event and projection | Owner alert for rejected/paused/disabled |
| Template quality update | Missing | Quality history and current projection | Owner alert on degradation |
| Template components/category update | Missing | Refresh template and audit diff | Owner event when behavior changes |
| Phone number quality update | Missing | Integration health history | Owner health alert |
| Phone number name update | Missing | Display-name review state | Owner setup alert |
| `account_update` | Missing | WABA lifecycle/restriction history | Owner critical alert when actionable |
| `account_review_update` | Missing | Review status | Owner setup alert |
| `business_capability_update` | Missing | Capability snapshot | Settings refresh; alert on decrease |
| `account_alerts` | Missing | Operational alert | Owner alert |
| `account_settings_update` | Missing | Calling/settings projection | Settings refresh |
| `user_preferences` | Missing | Marketing/call preference projection | Conversation/settings refresh |
| `payment_configuration_update` | Missing | Payment capability/config state | Owner settings alert |
| `partner_solutions` | Missing | Partner lifecycle | Onboarding/admin alert |
| `calls` | Missing | Call lifecycle | Targeted call events only |

Meta field names must be verified in the app dashboard/current documentation before subscription because naming evolves.

## Pipeline

```text
HTTP webhook
  -> raw-body signature validation
  -> extract phone number/WABA routing identity
  -> persist immutable envelope
  -> enqueue envelope ID
  -> dispatch by change.field
  -> normalize one or more events
  -> transactional projection update
  -> mark processing outcome
  -> emit user-visible realtime event
```

## Immutable Envelope

Add:

```text
WaWebhookEnvelope
  id
  shopId?
  appId?
  wabaId?
  phoneNumberId?
  field
  payloadJson
  payloadHash
  signatureVerified
  receivedAt
  processingStatus
  attemptCount
  processedAt
  errorCode/errorMessage
```

Add normalized event records with Meta identifiers and event timestamps. Use unique constraints based on stable Meta IDs where available, otherwise hash the canonical event payload.

Unknown fields are stored and quarantined, not silently discarded.

## Message Event Corrections

- Keep order, system, and unsupported types distinct.
- Store status `conversation`, `pricing`, and full error details.
- Update `WaBroadcastRecipient` when its Meta message status changes.
- Prevent invalid status regression while allowing terminal failure details.
- Update `lastWebhookAt`.
- Use exact customer identifier handling, including BSUID where Meta supplies it.

## Management Event Handlers

Create field-specific handlers:

- `TemplateWebhookHandler`
- `PhoneNumberWebhookHandler`
- `AccountWebhookHandler`
- `CapabilityWebhookHandler`
- `UserPreferenceWebhookHandler`
- `PaymentConfigurationWebhookHandler`
- `CallingWebhookHandler`
- `UnknownWebhookHandler`

Handlers update local projections but retain the immutable event.

## Realtime Policy

Emit sockets only for user-visible state:

- New/updated message.
- Message status/reaction/deletion.
- Conversation metadata changes.
- Template or account action required.
- Integration health/capability change.
- Targeted call lifecycle.

Do not emit raw account, payment, or call payloads. Do not publish an incoming call to the whole shop room.

## Replay and Operations

- Owner/admin replay endpoint for failed envelopes.
- Dead-letter dashboard and metrics.
- Per-field processing latency and failure counts.
- Payload redaction in logs.
- Retention tiers: operational projection longer, raw payload shorter where privacy requires.
- Alert on signature failures, unknown tenant spikes, queue lag, and repeated handler failures.

## React Native UI

- WhatsApp setup health screen showing connection, quality, capability, token, webhook, template, Flow, catalog, payment, and calling states.
- Owner alerts for actionable template/account/phone events.
- Background query invalidation for projection changes without exposing raw payloads.
- Conversation updates for message, preference, commerce, and call events.
- Admin-only failed-event list with sanitized error, field, receive time, attempts, and replay action.
- Unknown-event indicators visible to operators without rendering customer payload data.
- Targeted call events handled by the calling provider, never the generic shop-wide toast path.

## Tests

- Official/representative fixtures for every subscribed field.
- Duplicate, batched, out-of-order, and unknown-field payloads.
- Invalid signature and missing tenant.
- Transaction rollback without losing the envelope.
- Replay idempotency.
- Status-to-broadcast-recipient reconciliation.
- Targeted call event privacy.

## References

- [Meta webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Meta webhook components](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components)
- [Webhook fields secondary index](https://dualhook.com/docs/webhooks)
