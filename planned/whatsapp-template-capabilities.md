# WhatsApp Template Capabilities

> Audit date: 2026-06-19
>
> Implementation checkpoint updated: 2026-06-20

## Current State

ShopControl now has tenant-scoped template CRUD, pagination, reconciliation, immutable versions, Meta-authoritative status, typed definitions, dynamic attribute mappings, previews, and approved-template sending.

Implemented component families include:

- Text, media, and location headers.
- Body, footer, quick reply, URL, phone, Flow, and copy-code buttons.
- Authentication copy-code, one-tap, and zero-tap definitions.
- Media card and product card carousel definitions.
- Card-scoped body and URL variables.
- Calling capability-gated call permission request templates.
- Resumable Meta review-media upload backed by the Asset table.

Remaining work is limited-time-offer metadata, appeal operations, fully named-parameter editing, template analytics, and automatic catalog/product selection through the commerce adapter.

## Capability Matrix

| Family | Meta | ShopControl | Required work |
|---|---|---|---|
| Basic marketing | Yes | Implemented | Continue policy validation and analytics |
| Media marketing | Yes | Implemented | Add reusable asset-library picker |
| Coupon code | Yes, policy dependent | Partial | Copy-code exists; offer metadata remains |
| Limited-time offer | Yes, eligibility/format dependent | Missing | Expiration, offer details, timezone validation |
| Carousel | Yes | Implemented | Commerce adapter should supply product mappings automatically |
| Deep link/dynamic URL | Yes | Implemented | Add domain allowlist administration |
| Utility | Yes | Implemented | Continue subtype capability gating |
| Location utility | Yes | Implemented | Location is supplied through the normalized send contract |
| Call permission | Calling eligible | Partial | Creation/send exists; permission reply projection remains with calling phase |
| Authentication copy code | Yes | Implemented | Add OTP-specific operational analytics |
| Authentication one tap | Android integration required | Implemented | Validate app signing during onboarding |
| Authentication zero tap | Android/eligibility dependent | Implemented | Add eligibility visibility and fallback analytics |

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
