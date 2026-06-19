# WhatsApp Flows Review

> Audit date: 2026-06-19

## Current State

ShopControl currently has:

- `WaFlow` and `WaFlowExecution` models.
- Meta Flow list synchronization.
- RSA key generation per shop with encrypted private keys.
- An E2EE data-exchange endpoint.
- `nfm_reply` parsing.
- Basic execution updates when a known `flow_token` is received.

The endpoint is a proof of concept, not a generic platform endpoint. It hard-codes item lookup, screen names, and success responses. There is no Flow send compiler, CRUD, asset upload, validation, publish, deprecate, preview, health, public-key registration, or retry model.

## Builder Options

| Option | Benefits | Problems | Decision |
|---|---|---|---|
| Store Meta-created flows only | Smallest scope | ShopControl cannot manage drafts or domain integration cleanly | Reject as long-term model |
| Full visual builder immediately | Best nontechnical UX | Large schema/UI project; difficult to track Flow JSON evolution | Defer |
| Managed JSON drafts synchronized with Meta | Full lifecycle with controlled scope | Requires schema editor and sync machinery | Recommended |

## Recommended Architecture

Meta remains deployment authority. ShopControl stores:

- Local editable Flow JSON draft.
- Meta Flow ID and lifecycle status.
- Categories and validation errors.
- Endpoint URI and endpoint health.
- Preview URL and expiry.
- Local revision and Meta synchronization revision.
- Last publish/deprecate/delete action.
- Raw Meta representation and last sync error.

Start with a schema-assisted JSON editor and structured common-component helpers. A visual builder can be added only after the lifecycle and endpoint runtime are stable.

## Lifecycle

1. Create local draft.
2. Validate locally against the supported Flow JSON schema.
3. Create or bind a Meta Flow.
4. Upload `flow.json`.
5. Persist Meta validation errors.
6. Generate preview.
7. Register endpoint/public key when data exchange is enabled.
8. Publish.
9. Send using a generated execution token.
10. Track data exchange and final `nfm_reply`.
11. Deprecate before removal where required.

Published definitions must be immutable locally. Changes create a new draft/revision.

## Generic Endpoint Runtime

Replace hard-coded action handling with:

```ts
interface FlowDataHandler {
  initialize(context): Promise<FlowResponse>;
  exchange(request, context): Promise<FlowResponse>;
  complete(request, context): Promise<FlowResponse>;
}
```

Resolve handlers by tenant and a stable local Flow handler key, not by trusting arbitrary data from the encrypted request.

Endpoint processing:

1. Resolve tenant from route-bound opaque endpoint ID.
2. Decrypt request.
3. Validate payload and supported protocol version.
4. Enforce idempotency.
5. Resolve execution token and handler.
6. Execute with a bounded timeout.
7. Persist request outcome and latency.
8. Encrypt response.
9. Return Meta-compatible status codes.

Do not log decrypted customer data.

## Execution Model

Extend execution tracking with:

- Unique idempotency key.
- Meta message ID.
- Flow token hash and protected token value.
- Current screen and last action.
- Attempt count and last endpoint error.
- Sent, opened where observable, submitted, completed, cancelled, expired timestamps.
- Input snapshot and result with retention controls.
- Conversation, customer, message, and originating automation references.

Create the execution record before sending the Flow message.

## APIs

```text
GET    /whatsapp/flows
POST   /whatsapp/flows
GET    /whatsapp/flows/:id
PATCH  /whatsapp/flows/:id/draft
POST   /whatsapp/flows/:id/validate
POST   /whatsapp/flows/:id/sync
POST   /whatsapp/flows/:id/upload
POST   /whatsapp/flows/:id/preview
POST   /whatsapp/flows/:id/publish
POST   /whatsapp/flows/:id/deprecate
DELETE /whatsapp/flows/:id
GET    /whatsapp/flows/:id/executions
POST   /whatsapp/conversations/:id/flow-messages
```

## React Native UI

- Flow library with status, category, endpoint state, and sync errors.
- Draft editor using JSON validation plus structured helpers for common screens.
- Validation issue list linked to paths.
- Preview action using Meta preview URL.
- Publish/deprecate confirmations.
- Execution list with contact, status, timestamps, and sanitized result summary.
- Chat composer Flow picker with CTA, header, body, initial screen, and optional seed data.

The editor is owner-only. Staff can send approved published Flows and inspect permitted execution results.

## Reliability and Security

- Separate endpoint opaque IDs from shop IDs.
- Validate request size before cryptographic work.
- Rotate keys with overlap: register new public key, confirm, then retire old private key.
- Add endpoint health probes and alerts.
- Use retry-safe handlers; never create duplicate ERP orders or payments from duplicate exchanges.
- Keep handler side effects behind idempotent domain commands.

## Tests

- Official encryption/decryption vectors.
- Wrong key, bad tag, malformed payload, and unsupported protocol tests.
- Ping, INIT, exchange, completion, retry, and duplicate request fixtures.
- Publish lifecycle and validation error synchronization.
- Execution creation before send and final reply reconciliation.
- Tenant isolation and log-redaction tests.

## References

- [WhatsApp Flows](https://developers.facebook.com/docs/whatsapp/flows)
- [Flows API](https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi)
- [Flows endpoint implementation](https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint)

