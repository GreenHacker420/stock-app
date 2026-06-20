# Embedded Signup and Partner Onboarding Review

> Audit date: 2026-06-19
>
> Implementation checkpoint updated: 2026-06-20

## Implementation Status

ShopControl now implements the Meta Embedded Signup v4 architecture:

- Server-created, expiring onboarding sessions scoped to shop and initiating owner.
- HMAC-signed one-time state with hashed nonce persistence and tamper/expiry rejection.
- HTTPS launch bridge using the Facebook JavaScript SDK, `FB.login`, session logging version 3, and Graph API `v25.0`.
- Coordinated capture of the 30-second exchangeable code and `WA_EMBEDDED_SIGNUP` asset event.
- Cloud API and WhatsApp Business app coexistence launch modes.
- Cancellation step, Meta session ID, error code, finish event, and raw session metadata persistence.
- Immediate server-side exchange for a customer-scoped business token.
- App ID, token validity, granted scope, target WABA, and token expiry validation.
- Encrypted business-token and registration-PIN storage.
- WABA webhook subscription with per-integration verification token.
- Phone verification checks and Cloud API registration; coexistence skips registration as required by Meta.
- Phone/WABA conflict rejection across tenants.
- Retryable state after subscription or registration failure.
- Integration projection for portfolio, token metadata, onboarding mode, quality, display name, and phone capability data.
- RSA key generation and tenant credential cache refresh on completion.
- React Native launch, lifecycle progress, cancellation/error display, retry, and Cloud API/coexistence controls.
- Manual credentials retained only in the advanced recovery section.

## Activation Requirements

- ShopControl must be approved as a Meta Tech Provider or Solution Partner before production customer onboarding.
- `WHATSAPP_APP_ID` and `WHATSAPP_APP_SECRET` must identify the approved Meta app.
- `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` must reference an Embedded Signup v4 Facebook Login for Business configuration.
- `PUBLIC_API_URL` must be a public HTTPS origin allowed in the App Dashboard.
- App Dashboard allowed domains and valid OAuth redirect URIs must include the bridge domain.
- Cloudflare must not issue browser challenges on onboarding, webhook, or Flow endpoint paths.
- Use a single-WABA configuration until explicit multi-WABA selection is added.

## State Machine

```text
CREATED -> AUTHORIZED -> ASSETS_DISCOVERED -> APP_SUBSCRIBED
        -> NUMBER_REGISTERED -> CONNECTED

Any step -> ACTION_REQUIRED | FAILED | CANCELLED | EXPIRED
```

Coexistence onboarding skips `NUMBER_REGISTERED` because the WhatsApp Business app number is already registered.

## Secure Flow

1. Backend creates a tenant- and owner-scoped session with a 30-minute expiry.
2. Backend signs a state containing session ID, nonce, and expiry.
3. Mobile opens the server-hosted HTTPS bridge.
4. Bridge launches Embedded Signup v4 through the Facebook JavaScript SDK.
5. Bridge captures both the session-logging asset event and exchangeable token code.
6. Backend validates state and exchanges the code immediately.
7. Backend validates token app, validity, scopes, expiry, and selected WABA target.
8. Backend encrypts the business token and records returned asset IDs.
9. Backend subscribes the WABA to the ShopControl webhook.
10. Backend verifies and registers Cloud API numbers when required.
11. Backend fetches phone identity/capabilities and upserts the integration.
12. Backend creates Flow E2EE keys, invalidates caches, and marks the session connected.

No access token, registration PIN, App Secret, or raw OAuth code is returned to the app.

## Token Strategy

Persist:

- Encrypted customer business token.
- Token type and expiry.
- Granted scopes.
- Business portfolio, WABA, and phone asset targets.
- Last validation timestamp.
- Reauthorization requirement.

The business customer owns the WhatsApp assets. ShopControl stores authorization and mapping metadata only.

## Asset Constraints

The current product constraint is one WABA phone number per shop.

- Reject a phone already connected to another ShopControl tenant.
- Do not infer a phone by selecting the first WABA phone-number API result.
- The phone ID is captured from Embedded Signup session logging.
- `FINISH_ONLY_WABA` becomes `ACTION_REQUIRED`.
- Multi-WABA session payloads require a future explicit selector.

## Coexistence

The app can launch the Meta-supported WhatsApp Business app onboarding mode using:

```text
featureType = whatsapp_business_app_onboarding
sessionInfoVersion = 3
```

For successful `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` events:

- Persist mode as `COEXISTENCE`.
- Skip Cloud API phone registration.
- Subscribe webhooks and complete normal integration setup.
- History, state-sync, and message-echo webhook ingestion remain separate follow-up work.

## APIs

```text
POST /whatsapp/onboarding/sessions
GET  /whatsapp/onboarding/sessions/:id
POST /whatsapp/onboarding/sessions/:id/continue
GET  /whatsapp/onboarding/launch/:id
POST /whatsapp/onboarding/sessions/:id/complete
```

The launch and completion routes are public but protected by signed, expiring, one-time session state. Session status and retry routes require owner authentication and shop access.

## React Native UI

- Server-configured onboarding; App ID, App Secret, and config ID are not client inputs.
- Cloud API and WhatsApp Business app modes.
- Native browser launch.
- Lifecycle and completed-step status.
- Action-required and failure details.
- Retry without repeating Meta login when authorization already succeeded.
- Manual setup remains in the advanced recovery tab.
- Test-notification action verifies device registration and delivery infrastructure.

## Notifications

Notification delivery now includes:

- Multi-device Expo push targeting.
- BullMQ delivery worker.
- Per-device delivery records.
- Expo ticket ID and provider error persistence.
- Automatic invalid-token disabling.
- In-app test endpoint and setup-screen action.

A physical-device Expo token is required to verify a successful provider ticket. Local E2E testing verified queue execution and correct handling of Expo `DeviceNotRegistered`.

## Remaining Work

- Meta Tech Provider/Solution Partner approval.
- Real v4 configuration ID and App Dashboard domain configuration.
- Live successful Meta onboarding with an approved test business.
- Explicit multi-WABA selection.
- Reauthorization UI and token-expiry scheduling.
- Remote app unsubscribe and asset-offboarding cleanup.
- Solution Partner credit-line sharing and automatic asset assignment.
- Coexistence history/state-sync ingestion.
- Expo push receipt reconciliation after accepted tickets.

## Tests Completed

- Signed state success.
- State tampering rejection.
- State expiry rejection.
- Session creation and authenticated retrieval.
- JS-SDK bridge rendering.
- Cancellation and current-step capture.
- Migration application through `prisma migrate dev`.
- Notification queueing.
- Expo provider-error persistence.
- Invalid push-token disabling.
- Android production bundle.

## References

- [Meta Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup)
- [Meta Embedded Signup implementation](https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation/)
- [Meta Embedded Signup webhooks](https://developers.facebook.com/docs/whatsapp/embedded-signup/webhooks/)
- [Meta business phone numbers](https://developers.facebook.com/docs/whatsapp/embedded-signup/manage-accounts/phone-numbers/)
- [Meta WhatsApp Business app onboarding](https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/)
