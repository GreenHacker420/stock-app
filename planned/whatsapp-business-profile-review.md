# WhatsApp Business Profile Review

> Audit date: 2026-06-19

## Current State

ShopControl stores only phone number and verified business name in `WaIntegration`. There is no business-profile read/update API, profile image management, synchronization model, or mobile editor.

## Capability Matrix

| Field | Meta | ShopControl | Recommendation |
|---|---|---|---|
| Profile picture | Yes | Missing | Upload media, set profile, cache projection |
| Description/about | Yes | Missing | Owner editor with Meta limits |
| Address | Yes | Missing | Structured local input, Meta string output |
| Email | Yes | Missing | Validation and owner-only update |
| Websites | Yes, bounded list | Missing | Store ordered URLs and validate |
| Vertical/category | Yes | Missing | Select from Meta-supported values |
| Business hours | API/rollout dependent | Missing | Capability-gate and verify current field support |

## Data Model

Add `WaBusinessProfile`:

- Integration ID.
- About/description.
- Address.
- Email.
- Websites.
- Vertical.
- Profile picture media ID and local preview reference.
- Hours JSON only when supported.
- Raw Meta representation.
- Last synced, last updated, and sync error.

The Meta projection is authoritative. Shop/shopfront fields may prefill a draft but should not remain implicitly synchronized.

## APIs

```text
GET   /whatsapp/business-profile
POST  /whatsapp/business-profile/refresh
PATCH /whatsapp/business-profile
POST  /whatsapp/business-profile/photo
```

Validate updates before calling Meta. Return field-level errors and preserve the last known remote state when an update fails.

## Synchronization

- Fetch after onboarding.
- Refresh on demand and periodically.
- Consume account/profile-related alerts where Meta exposes them.
- Record remote/local differences.
- Avoid overwriting owner edits from unrelated Shop record changes.

## React Native UI

- Profile preview showing the customer-visible identity.
- Owner-only edit form.
- Image crop/upload and progress.
- Field counters and validation.
- Save state per field and actionable Meta errors.
- Last synchronized timestamp.
- Business-hours editor only when the capability is confirmed.

Use the existing app’s quiet operational style. This is a settings surface, not a marketing page.

## Security and Governance

- Owner-only writes.
- Audit old and new values.
- Validate URLs and email.
- Scan/validate uploaded media.
- Do not expose raw access tokens or Graph responses.

## Tests

- Field validation and Meta-limit fixtures.
- Partial update failure.
- Profile image upload lifecycle.
- Remote refresh conflict.
- Capability-hidden business hours.
- Tenant authorization.

## References

- [Meta business profiles](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/business-profiles)

