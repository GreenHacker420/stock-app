# Embedded Signup and Partner Onboarding Review

> Audit date: 2026-06-19

## Current State

ShopControl provides manual credential entry and an Embedded Signup prototype. The backend exchanges an OAuth code, attempts to infer a WABA from token scopes, selects the first phone number, subscribes the app, registers the number with a generated PIN, and stores the integration.

Production gaps:

- No signed state/nonce validation.
- No durable onboarding session.
- No explicit WABA/phone selection.
- Token ownership and expiry are not modeled.
- Partial failures are not resumable.
- The generated registration PIN is not lifecycle-managed.
- Subscription and registration assumptions are not capability-aware.
- No coexistence or migration handling.
- Setup responses can expose integration fields that should be redacted.
- No partner/Tech Provider asset lifecycle.

## Recommendation

Use Embedded Signup as the default onboarding method. Keep manual setup as an owner-only recovery and development path.

Do not describe ShopControl as a Tech Provider or Solution Partner until Meta approves the required app/business status.

## Onboarding State Machine

```text
CREATED
  -> AUTHORIZED
  -> ASSETS_DISCOVERED
  -> ASSETS_SELECTED
  -> APP_SUBSCRIBED
  -> NUMBER_REGISTERED
  -> CAPABILITIES_SYNCED
  -> CONNECTED

Any step -> ACTION_REQUIRED | FAILED | CANCELLED | EXPIRED
```

Store an onboarding session containing:

- Shop and initiating owner.
- Signed state hash and nonce.
- Config ID and redirect URI.
- OAuth completion timestamp.
- Candidate WABAs and phone numbers.
- Selected assets.
- Completed steps and retryable error.
- Expiry and final integration ID.

## Secure Flow

1. Backend creates an onboarding session and signed state.
2. Mobile opens Meta’s supported Embedded Signup dialog/configuration.
3. Callback state is validated.
4. Backend exchanges the code.
5. Validate token app, scopes, expiry, and target assets.
6. Return redacted candidate WABAs/numbers if selection is required.
7. Persist owner selection.
8. Subscribe the app and configure the callback according to current Meta rules.
9. Register or migrate the number only when required.
10. Fetch capabilities, profile, quality, templates, Flows, and catalogs.
11. Generate/register Flow endpoint keys when enabled.
12. Mark connected and invalidate caches.

## Token Strategy

Model:

- Token type and owner.
- Granted scopes and asset targets.
- Issued/expiry timestamps.
- Last validation and failure.
- Reauthorization requirement.

Use encrypted storage and return only redacted metadata. A user-token prototype may be acceptable for development, but production partner onboarding should use the token model required by the approved Meta integration.

## Multiple Assets

Never select `data[0]` silently in production.

The UI must show:

- Business portfolio.
- WABA.
- Phone number and verified display name.
- Registration/migration state.
- Quality and capability summary.
- Existing integration conflicts.

One shop currently maps to one integration/number. Document that as the initial constraint and reject ambiguous multi-number selection cleanly.

## Partner and Automatic Assignment

When ShopControl is eligible:

- Persist partner solution/application identity.
- Track assigned and revoked assets.
- Consume `partner_solutions` and account lifecycle events.
- Verify automatic assignment results rather than assuming success.
- Handle customer removal, app uninstall, permission revocation, offboarding, and reconnection.

## Coexistence and Migration

Before registration:

- Detect whether the number is already on Cloud API or the WhatsApp Business app.
- Present supported migration/coexistence paths based on current Meta capability.
- Do not tell customers to delete an app account unless Meta’s current flow requires it.
- Preserve an actionable rollback path.

## APIs

```text
POST /whatsapp/onboarding/sessions
POST /whatsapp/onboarding/sessions/:id/exchange
GET  /whatsapp/onboarding/sessions/:id/assets
POST /whatsapp/onboarding/sessions/:id/select
POST /whatsapp/onboarding/sessions/:id/continue
GET  /whatsapp/onboarding/sessions/:id
POST /whatsapp/integrations/:id/reauthorize
POST /whatsapp/integrations/:id/disconnect
```

## React Native UI

- Connection overview with health and required actions.
- Native browser signup launch.
- Explicit asset selection.
- Step progress and resumable errors.
- Reauthorization and reconnect flows.
- Manual setup behind an advanced/recovery section.
- Never display access tokens after submission.
- Show webhook, capability, profile, Flow key, and catalog readiness independently.

## Disconnect

Disconnect must:

- Revoke or remove subscriptions/asset links where supported and intended.
- Clear encrypted tokens and caches.
- Stop workers from sending.
- Preserve audit/history according to retention policy.
- Mark templates/Flows/catalog mappings unavailable rather than deleting history.

## Tests

- State/nonce tampering.
- Cancelled and expired sessions.
- Multiple WABAs and numbers.
- Retry after subscription or registration failure.
- Existing connected number conflict.
- Token expiry and reauthorization.
- Disconnect and account-offboard webhooks.
- Secret redaction.

## References

- [Meta Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup)
- [Meta Cloud API get started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)

