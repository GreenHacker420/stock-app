# WhatsApp Template Capabilities

> Audit date: 2026-06-19

## Current State

`syncTemplates()` retrieves templates and stores name, language, status, category, and raw components. Chat and broadcast sending support body text variables, while broadcasts also support simple header text variables.

This is useful generic support, but not complete template support:

- No pagination or reconciliation of removed templates.
- `metaTemplateId`, quality, rejection reason, component updates, and category updates are not populated.
- No creation, editing, deletion, appeal, or preview workflow.
- No typed validation for media headers, buttons, cards, OTP metadata, coupons, expiration, location, or call permission.
- The chat variable UI only scans numeric body placeholders.

## Capability Matrix

| Family | Meta | ShopControl | Required work |
|---|---|---|---|
| Basic marketing | Yes | Partial | Typed body/header/footer/buttons and preview |
| Media marketing | Yes | Partial | Media header parameter and upload selection |
| Coupon code | Yes, policy dependent | Missing | Copy-code button and offer metadata |
| Limited-time offer | Yes, eligibility/format dependent | Missing | Expiration, offer details, timezone validation |
| Carousel | Yes | Missing | Cards, media, per-card body and buttons |
| Deep link/dynamic URL | Yes | Partial | URL suffix variables and domain validation |
| Utility | Yes | Partial | Generic raw sync/send only |
| Location utility | Format/availability dependent | Missing | Typed location component and capability gate |
| Call permission | Calling eligible | Missing | Permission component/button and reply tracking |
| Authentication copy code | Yes | Missing | OTP component and expiration |
| Authentication one tap | Android integration required | Missing | Package name and app-signature hash |
| Authentication zero tap | Android/eligibility dependent | Missing | Zero-tap terms, app signing, fallback behavior |

## Data Model

Extend `WaTemplate` or add a versioned projection with:

- Meta template ID.
- Category and subtype.
- Parameter format: positional or named.
- Current quality score and quality timestamp.
- Rejection code and explanation.
- Previous category and category-change timestamp.
- Components schema version.
- Allow-category-change setting where Meta supports it.
- Created, submitted, approved, paused, disabled, and deleted timestamps.
- Last successful sync and last sync error.
- Raw Meta representation.

Add `WaTemplateVersion` if ShopControl will create templates. It stores an immutable submitted definition so approved Meta content can be compared with local drafts.

`WaTemplateUsage` should become a real relation or be removed in favor of message-derived analytics.

## Template Compiler

Create one compiler shared by chat, broadcasts, automations, and OTP:

```ts
compileTemplate({
  template,
  values: {
    header: [],
    body: [],
    buttons: {},
    cards: []
  }
})
```

The compiler must:

- Validate required variables and parameter format.
- Validate media type against the approved header.
- Compile quick reply, URL, copy-code, phone, Flow, and calling components.
- Compile carousel card components.
- Apply language exactly as approved.
- Reject runtime component shapes that differ from the approved template.
- Return a redacted preview and Meta payload.

Do not let the mobile application construct raw Graph API components.

## Synchronization

1. Fetch all pages.
2. Upsert by shop, name, and language while retaining Meta ID.
3. Mark locally known templates absent from Meta as deleted or unavailable.
4. Consume status, quality, component, and category webhook updates.
5. Trigger a focused refresh after webhook events.
6. Emit operator-visible events for rejection, pause, disablement, and category changes.

## APIs

```text
GET    /whatsapp/templates
GET    /whatsapp/templates/:id
POST   /whatsapp/templates/sync
POST   /whatsapp/templates/preview
POST   /whatsapp/templates                 # Phase 5
PATCH  /whatsapp/templates/:id/draft       # Phase 5 local draft
DELETE /whatsapp/templates/:id             # Phase 5 Meta delete
POST   /whatsapp/templates/:id/appeal      # only if Meta supports account action
```

Creation routes must be owner-only and capability-gated.

## React Native UI

### Template Library

- Tabs for approved, pending, rejected, paused, and disabled.
- Category, language, subtype, and quality filters.
- Sync timestamp and visible sync failures.
- Detail screen with component preview and Meta lifecycle history.

### Send Template Sheet

- Render fields from the approved component schema.
- Support text, currency, date/time, image, video, document, location, OTP, and button variables.
- Resolve ShopControl variables through a typed registry.
- Show a final WhatsApp-style preview.
- Prevent send when a required variable is unresolved.

### Template Administration

Phase 5:

- Structured editor for supported subtypes.
- Carousel card editor with stable dimensions and media preview.
- Authentication setup form with Android package and signature fields.
- Submission confirmation that explains Meta review.
- Rejection detail and clone-to-new-draft action.

## Security and Policy

- Never expose access tokens or raw secrets in template APIs.
- Record who submitted or deleted a template.
- Enforce marketing opt-out state before marketing sends.
- Do not automatically recategorize content locally; use Meta’s category as authoritative.
- Store OTP values only for the minimum operational period and avoid logging them.

## Tests

- Fixture tests for each component and subtype.
- Named and positional parameter validation.
- Carousel and button compiler tests.
- One-tap/zero-tap signing metadata validation.
- Webhook lifecycle reconciliation.
- Removed-template reconciliation.
- Chat and broadcast compiler parity.

## References

- [Meta message templates](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)
- [Meta template components](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components)
- [Meta authentication templates](https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates)

