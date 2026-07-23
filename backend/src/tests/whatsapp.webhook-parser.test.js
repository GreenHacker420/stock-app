import test from "node:test";
import assert from "node:assert/strict";
import {
  mapEventTypeToMessageType,
  parseWebhookPayload,
  splitWebhookPayload,
} from "../services/whatsapp.webhook-parser.js";

function messagePayload(messages, statuses = []) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "phone-1" },
          contacts: [{ wa_id: "919876543210", profile: { name: "Customer" } }],
          messages,
          statuses,
        },
      }],
    }],
  };
}

test("splits webhook payload into durable field envelopes", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [
        { field: "messages", value: { metadata: { phone_number_id: "phone-1" } } },
        { field: "account_update", value: { event: "ACCOUNT_RECONNECTED" } },
      ],
    }],
  };

  const changes = splitWebhookPayload(payload);
  assert.equal(changes.length, 2);
  assert.deepEqual(
    changes.map(({ field, wabaId, phoneNumberId }) => ({ field, wabaId, phoneNumberId })),
    [
      { field: "messages", wabaId: "waba-1", phoneNumberId: "phone-1" },
      { field: "account_update", wabaId: "waba-1", phoneNumberId: null },
    ],
  );
  assert.equal(changes[0].payload.entry[0].changes.length, 1);
});

test("preserves voice-note, forwarding, and reply metadata", () => {
  const events = parseWebhookPayload(messagePayload([{
    id: "wamid.audio",
    from: "919876543210",
    timestamp: "1710000000",
    context: {
      id: "wamid.parent",
      forwarded: true,
      frequently_forwarded: true,
    },
    audio: {
      id: "media-1",
      mime_type: "audio/ogg; codecs=opus",
      voice: true,
    },
  }]));

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "audio");
  assert.equal(events[0].voice, true);
  assert.equal(events[0].forwarded, true);
  assert.equal(events[0].frequentlyForwarded, true);
  assert.equal(events[0].replyToMetaMessageId, "wamid.parent");
  assert.equal(events[0].contactName, "Customer");
});

test("keeps order, system, referral, and unsupported messages semantically distinct", () => {
  const base = {
    from: "919876543210",
    timestamp: "1710000000",
  };
  const events = parseWebhookPayload(messagePayload([
    { ...base, id: "wamid.order", order: { catalog_id: "catalog-1", product_items: [] } },
    { ...base, id: "wamid.system", system: { type: "customer_changed_number" } },
    { ...base, id: "wamid.referral", referral: { source_type: "ad", headline: "Summer offer" } },
    { ...base, id: "wamid.unknown", type: "future_message" },
  ]));

  assert.deepEqual(events.map((event) => event.type), ["order", "system", "system", "unsupported"]);
  assert.deepEqual(
    events.map((event) => mapEventTypeToMessageType(event.type)),
    ["ORDER", "SYSTEM", "SYSTEM", "UNSUPPORTED"],
  );
  assert.equal(events[2].payload.body, "Summer offer");
  assert.equal(events[3].payload.type, "future_message");
});

test("matches Meta profile names using normalized phone numbers", () => {
  const payload = messagePayload([{
    id: "wamid.name",
    from: "+91 98765 43210",
    timestamp: "1710000000",
    text: { body: "Hello" },
  }]);
  payload.entry[0].changes[0].value.contacts[0].profile.name = "  Customer Name  ";

  const [event] = parseWebhookPayload(payload);
  assert.equal(event.from, "+919876543210");
  assert.equal(event.contactName, "Customer Name");
});

test("normalizes statuses and interactive replies", () => {
  const events = parseWebhookPayload(messagePayload(
    [{
      id: "wamid.reply",
      from: "919876543210",
      timestamp: "1710000001",
      interactive: {
        type: "list_reply",
        list_reply: { id: "row-1", title: "First row" },
      },
    }],
    [{
      id: "wamid.outbound",
      status: "delivered",
      recipient_id: "919876543210",
      timestamp: "1710000002",
      pricing: { billable: true, category: "utility" },
    }],
  ));

  assert.equal(events[0].type, "status");
  assert.equal(events[0].pricing.category, "utility");
  assert.equal(events[1].type, "list_reply");
  assert.equal(mapEventTypeToMessageType(events[1].type), "INTERACTIVE");
  assert.equal(events[1].payload.id, "row-1");
});

test("ignores non-WhatsApp webhook objects", () => {
  assert.deepEqual(parseWebhookPayload({ object: "page", entry: [] }), []);
});
