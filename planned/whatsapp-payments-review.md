# WhatsApp Payments Review

> Audit date: 2026-06-19  
> Recommendation: research-complete, implementation deferred until Meta confirms eligibility for the production WABA

## Executive Decision

Do not implement WhatsApp Payments as part of the immediate messaging or commerce phases.

Meta payment capabilities are market-, provider-, account-, and configuration-dependent. Public ecosystem references identify payment configuration support for India and Brazil, but this does not mean every Indian Cloud API WABA can send payment requests. Production access must be confirmed in WhatsApp Manager and through the account’s capability/configuration APIs.

ShopControl should prepare a provider-neutral adapter and data model, then activate it only for eligible tenants.

## Capability Review

| Capability | Meta availability | ShopControl | Decision |
|---|---|---|---|
| Payment configuration | Restricted by market/account | Missing | Model capability and configuration state |
| Payment request message | Restricted | Missing | Defer until eligible |
| Payment status webhook | Restricted | Missing | Normalize when enabled |
| Payment/order linkage | Supported in payment commerce flows | Missing | Add immutable external references |
| Refund/cancellation | Provider and market dependent | Missing | Never infer; use provider-specific adapter |
| Settlement reconciliation | Provider responsibility | Existing ERP payment verification only | Integrate through verification workflow |
| India support | Exists for eligible configurations | Not configured | Confirm tenant eligibility; do not assume universal access |

## Architecture

```ts
interface WhatsAppPaymentAdapter {
  getCapability(integrationId): Promise<PaymentCapability>;
  getConfiguration(integrationId): Promise<PaymentConfiguration>;
  createRequest(input): Promise<ExternalPaymentRequest>;
  refreshStatus(externalPaymentId): Promise<ExternalPaymentStatus>;
  requestRefund?(input): Promise<ExternalRefund>;
}
```

Adapters may vary by Meta market/provider configuration, but the ShopControl domain contract remains stable.

## Data Model

- `WaPaymentConfiguration`: shop, WABA, market, provider/configuration ID, currency, state, capabilities, last sync.
- `WaPaymentRequest`: conversation, customer, commerce/ERP order link, amount, currency, external ID, expiry, status.
- `WaPaymentEvent`: immutable provider/Meta status event, payload hash, event time.
- `WaPaymentReconciliation`: external status, provider reference, ERP payment ID, reconciliation result, reviewer.
- `WaPaymentRefund`: only when the provider exposes a supported refund operation.

Store money using decimal minor-unit-safe handling. Never use floating point.

## Order and Payment Linkage

1. Create or select an ERP order.
2. Snapshot payable amount and currency.
3. Create a WhatsApp payment request through the adapter.
4. Store the external request ID and message ID.
5. Receive payment status events.
6. Verify status with the provider/configuration API.
7. Create or update an ERP `Payment` through the existing verification workflow.
8. Mark settled only after authoritative provider confirmation.

A WhatsApp webhook alone must never increase `paidAmount`, reduce `balanceAmount`, or release inventory.

## India Assessment

The audit should state:

- India has WhatsApp payment-related platform capability for eligible businesses/configurations.
- Eligibility, onboarding, provider support, transaction operations, and production access must be checked for the exact WABA.
- UPI-related user experiences do not automatically imply a generally available Cloud API payment request product.
- ShopControl’s existing UPI and payment verification logic remains independent.
- Any activation requires legal review, provider agreement, refund/support procedures, and auditable reconciliation.

## Compliance

- Collect only data required for transaction support.
- Do not store card credentials, UPI PINs, bank authentication secrets, or provider private credentials in message payloads.
- Encrypt provider credentials separately from WhatsApp access tokens.
- Define retention for payment payloads and customer identifiers.
- Record operator actions and status overrides.
- Provide customer support and dispute workflows.
- Validate tax invoice and order references independently of Meta.

## Webhooks

When enabled:

- Subscribe to `payment_configuration_update`.
- Normalize payment status fields without dropping unknown provider data.
- Persist before processing.
- Re-fetch authoritative status for terminal transitions.
- Emit UI events only after the local projection is updated.

## React Native UI

Future payment UI:

- Eligibility and configuration state in WhatsApp settings.
- Payment request action only on eligible orders/conversations.
- Amount, currency, order, expiry, and provider confirmation.
- Pending, successful, failed, expired, cancelled, disputed, and refunded states.
- Reconciliation queue for mismatches.
- No manual “mark paid” shortcut from a WhatsApp event.

## Activation Gates

All must be true:

- Meta exposes payment capability for the production WABA.
- Supported country, currency, and provider are confirmed.
- Legal/compliance review is complete.
- Webhook fixtures and sandbox tests pass.
- Provider status verification works.
- ERP reconciliation is idempotent.
- Support and refund procedures exist.

## Tests

- Decimal amount and currency validation.
- Duplicate and out-of-order status events.
- Webhook/provider status disagreement.
- Expired and cancelled requests.
- Partial or overpayment handling if provider supports it.
- Reconciliation transaction and tenant isolation.
- No settlement from unauthenticated webhook input.

## References

- [WhatsApp Business Platform documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp)
- [Webhook fields reference](https://dualhook.com/docs/webhooks) as a secondary index for `payment_configuration_update`

