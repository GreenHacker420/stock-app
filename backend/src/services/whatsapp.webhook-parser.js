import { normalizePhone } from "./whatsapp.phone.js";

export function splitWebhookPayload(payload) {
  const changes = [];

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      if (!change?.field) continue;

      changes.push({
        wabaId: entry.id || null,
        phoneNumberId: change.value?.metadata?.phone_number_id || null,
        field: change.field,
        payload: {
          object: payload.object,
          entry: [{
            id: entry.id,
            changes: [change],
          }],
        },
      });
    }
  }

  return changes;
}

export function parseWebhookPayload(payload) {
  if (payload?.object !== "whatsapp_business_account") return [];

  const events = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      for (const status of value.statuses || []) {
        events.push({
          type: "status",
          metaMessageId: status.id,
          status: status.status,
          recipientId: status.recipient_id,
          timestamp: status.timestamp,
          errors: status.errors,
          conversation: status.conversation,
          pricing: status.pricing,
        });
      }

      const contactMap = new Map();
      for (const contact of value.contacts || []) {
        const phone = normalizePhone(contact.wa_id);
        const name = contact.profile?.name?.trim();
        if (phone && name) contactMap.set(phone, name);
      }

      for (const message of value.messages || []) {
        const from = message.from;
        const baseEvent = {
          metaMessageId: message.id,
          from: normalizePhone(from),
          timestamp: message.timestamp,
          contactName: contactMap.get(normalizePhone(from)),
          replyToMetaMessageId: message.context?.id,
          forwarded: message.context?.forwarded === true,
          frequentlyForwarded: message.context?.frequently_forwarded === true,
        };

        if (message.text) {
          events.push({ ...baseEvent, type: "text", content: message.text.body });
        } else if (message.image) {
          events.push({ ...baseEvent, type: "image", mediaId: message.image.id, mimeType: message.image.mime_type, content: message.image.caption });
        } else if (message.document) {
          events.push({ ...baseEvent, type: "document", mediaId: message.document.id, mimeType: message.document.mime_type, fileName: message.document.filename, content: message.document.caption });
        } else if (message.audio) {
          events.push({ ...baseEvent, type: "audio", mediaId: message.audio.id, mimeType: message.audio.mime_type, voice: message.audio.voice === true });
        } else if (message.video) {
          events.push({ ...baseEvent, type: "video", mediaId: message.video.id, mimeType: message.video.mime_type, content: message.video.caption });
        } else if (message.sticker) {
          events.push({ ...baseEvent, type: "sticker", mediaId: message.sticker.id, mimeType: message.sticker.mime_type, animated: message.sticker.animated === true });
        } else if (message.location) {
          events.push({ ...baseEvent, type: "location", payload: message.location });
        } else if (message.contacts) {
          events.push({ ...baseEvent, type: "contacts", payload: message.contacts });
        } else if (message.reaction) {
          events.push({ ...baseEvent, type: "reaction", payload: message.reaction });
        } else if (message.button) {
          events.push({ ...baseEvent, type: "button", payload: message.button });
        } else if (message.interactive) {
          const interactive = message.interactive;
          if (interactive.type === "button_reply") {
            events.push({ ...baseEvent, type: "button_reply", payload: interactive.button_reply });
          } else if (interactive.type === "list_reply") {
            events.push({ ...baseEvent, type: "list_reply", payload: interactive.list_reply });
          } else if (interactive.type === "nfm_reply") {
            events.push({ ...baseEvent, type: "flow_reply", payload: interactive.nfm_reply });
          } else {
            events.push({
              ...baseEvent,
              type: "unsupported",
              payload: { type: `interactive:${interactive.type || "unknown"}` },
            });
          }
        } else if (message.order) {
          events.push({ ...baseEvent, type: "order", payload: message.order });
        } else if (message.system) {
          events.push({ ...baseEvent, type: "system", payload: message.system });
        } else if (message.referral) {
          events.push({
            ...baseEvent,
            type: "system",
            payload: {
              type: "referral",
              body: message.referral.body || message.referral.headline || "Conversation started from an ad",
              sourceUrl: message.referral.source_url,
              sourceType: message.referral.source_type,
            },
          });
        } else if (message.type === "request_welcome") {
          events.push({
            ...baseEvent,
            type: "system",
            payload: { type: "request_welcome", body: "Customer started a conversation" },
          });
        } else {
          events.push({
            ...baseEvent,
            type: "unsupported",
            payload: { type: message.type || "unknown" },
          });
        }
      }
    }
  }

  return events;
}

export function mapEventTypeToMessageType(type) {
  const map = {
    text: "TEXT",
    image: "IMAGE",
    document: "DOCUMENT",
    audio: "AUDIO",
    video: "VIDEO",
    sticker: "STICKER",
    location: "LOCATION",
    contacts: "CONTACT_CARD",
    reaction: "REACTION",
    button: "INTERACTIVE",
    button_reply: "INTERACTIVE",
    list_reply: "INTERACTIVE",
    flow_reply: "FLOW",
    order: "ORDER",
    system: "SYSTEM",
    unsupported: "UNSUPPORTED",
  };
  return map[type] || "UNSUPPORTED";
}
