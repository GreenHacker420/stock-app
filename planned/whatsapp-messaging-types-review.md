# WhatsApp Messaging Types Review

> Audit date: 2026-06-19

## Current Implementation

Outbound compilation supports:

- `TEXT`
- `TEMPLATE`
- `IMAGE`
- `DOCUMENT`
- `AUDIO`
- `VIDEO`
- Optional reply context

Inbound parsing recognizes text, image, document, audio, video, sticker, location, contacts, reaction, template button replies, interactive button/list/Flow replies, orders, system messages, and unsupported payloads.

The mobile type union omits `LOCATION`, `CONTACT_CARD`, `INTERACTIVE`, and `UNSUPPORTED` even though Prisma contains them. Several parsed events are flattened into `TEXT`, and order/system/unsupported events are also mapped to `TEXT`. This loses semantics.

## Type Matrix

| Type | Meta support | ShopControl | Gap |
|---|---|---|---|
| Plain text | Yes | Existing | Add shared validation and limits |
| URL preview | Yes | Missing | No `preview_url` output |
| Context reply | Yes | Existing | Parent content is not denormalized for reliable history rendering |
| Image | Yes | Partial | Inbound storage and linked outbound send; no upload composer |
| Video | Yes | Partial | Same as image; no thumbnail/duration UI |
| Audio | Yes | Partial | No player, duration, waveform, or upload UI |
| Voice note | Yes, audio subtype | Missing | Preserve voice flag and add recorder/player |
| Document | Yes | Partial | No outbound filename/caption compiler or document picker |
| Sticker | Yes with format/size rules | Partial | Inbound parser/download only |
| Reply buttons | Yes | Partial | Replies parsed; outbound interactive compiler missing |
| Quick replies | Button reply behavior | Partial | Same gap as reply buttons |
| List messages | Yes | Partial | List replies parsed; list send missing |
| Section lists | Part of list action | Partial | Structured sections not modeled |
| CTA URL | Yes in supported interactive/template contexts | Partial | Raw template components only |
| CTA phone | Primarily template/calling contexts | Partial | No typed component support |
| Flow interactive | Yes | Partial | Replies and E2EE endpoint exist; send path missing |
| Single product | Commerce eligible | Missing | No catalog/product mapping |
| Multi product | Commerce eligible | Missing | No product sections or compiler |
| Catalog message | Commerce eligible | Missing | No connected catalog |
| Product detail/collection | Commerce experience | Missing | Model as catalog navigation, not arbitrary generic type |
| Inbound order | Commerce eligible | Partial | Parsed but incorrectly normalized to text |
| Order status | Restricted capability | Missing | No adapter or capability gate |
| Location | Yes | Partial | Inbound payload stored; UI and outbound send missing |
| Location request | Yes in supported interactive form | Missing | No compiler |
| Contacts | Yes | Partial | Inbound raw array only; no structured render/send |
| Reactions | Yes | Existing | Add fixture tests and eligibility/error handling |
| Forwarded marker | Inbound metadata where supplied | Missing | Preserve forwarding metadata; businesses do not arbitrarily set it |
| Message edit | Capability/version dependent | Missing | Do not advertise until current Meta endpoint is verified |
| Delete/revoke | Limited API action | Partial | Recall exists; enforce ownership/time/action restrictions |
| System message | Inbound | Partial | Deletion handled; other system types lose semantics |
| Unsupported | Inbound fallback | Partial | Raw payload stored in `content`, but mapped to `TEXT` |

## Normalized Message Contract

Use a stable platform envelope:

```ts
type WhatsAppMessageEnvelope = {
  tenantId: string;
  conversationId: string;
  metaMessageId?: string;
  direction: "INBOUND" | "OUTBOUND";
  kind:
    | "text" | "image" | "video" | "audio" | "document" | "sticker"
    | "location" | "contacts" | "interactive" | "template"
    | "flow" | "product" | "product_list" | "order"
    | "reaction" | "system" | "unsupported";
  context?: { metaMessageId: string };
  content: unknown;
  rawPayload?: unknown;
  createdAt: string;
};
```

Do not make every subtype a Prisma enum. Keep a stable top-level kind and versioned JSON content validated by Zod. Preserve `rawPayload` in the webhook event archive.

## Outbound API

Replace the loose `/whatsapp/send` body with:

```text
POST /whatsapp/messages
{
  shopId,
  conversationId?,
  recipient,
  message: { kind, ...typedContent },
  replyToMessageId?,
  idempotencyKey
}
```

Backend components:

- `WhatsAppMessageCommandSchema`
- `WhatsAppPayloadCompiler`
- `TextCompiler`
- `MediaCompiler`
- `InteractiveCompiler`
- `TemplateCompiler`
- `CommerceCompiler`
- `FlowCompiler`
- `LocationCompiler`
- `ContactsCompiler`

Every compiler must enforce Meta limits and the 24-hour service window before queueing.

## Media Architecture

1. Mobile selects or records media.
2. Upload to ShopControl private storage.
3. Validate MIME type, size, filename, and tenant ownership.
4. Prefer uploading to Meta’s media endpoint and retain the returned media ID.
5. Queue the message with a durable media reference.
6. Render progress, retry, and failure states.

Do not depend exclusively on expiring third-party links. Store captions, dimensions, duration, voice flag, filename, and thumbnails separately from the binary URL.

## Webhook Corrections

- Map `order` to `ORDER`, `system` to `SYSTEM`, and unknown messages to `UNSUPPORTED`.
- Preserve the full interactive reply object and subtype.
- Preserve audio `voice` metadata.
- Store image/video/document captions as their own fields.
- Store forwarded/frequently-forwarded indicators when Meta sends them.
- Store system message subtype and target message ID.
- Record status pricing, conversation, and error details rather than discarding them.

## React Native UI

### Composer

- Attachment menu: photo, video, document, audio, location, contact, template, interactive, product, and Flow.
- Voice-note press-and-hold recorder with cancel and preview.
- URL preview toggle when a URL is detected.
- Reply strip above the composer.
- Upload progress and cancel/retry controls.
- Disable unavailable actions using integration capability flags.

### Message Rendering

- Dedicated renderers for every normalized kind.
- Audio and voice-note player with duration and playback state.
- Document card with filename, size, and download/open actions.
- Location preview with coordinates and external map action.
- Contact cards with save/link/customer actions.
- Interactive reply summary that retains title and stable action ID.
- Product and order summaries linked to mapped ERP records.
- Flow submission summary and result status.
- Unsupported message fallback that keeps the conversation usable.

### Reliability States

- Queued, sending, sent, delivered, read, failed, deleted, and unsupported.
- Retry only when the error classification permits it.
- Explain service-window and permission failures in actionable language.
- Keep local conversation deletion separate from Meta recall.

## Tests

- Payload compiler unit tests for every outbound kind.
- Webhook fixtures for every inbound type and subtype.
- Exact preservation tests for captions, context, voice flags, interactive IDs, and raw fallback.
- Service-window and template fallback tests.
- Media upload cancellation, retry, and tenant-isolation tests.
- React Native renderer snapshots and interaction tests.

## References

- [Meta send messages guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)
- [Meta Cloud API documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)

