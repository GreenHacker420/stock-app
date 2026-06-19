import test from "node:test";
import assert from "node:assert/strict";
import {
  compileMetaMessage,
  getLocalMessageProjection,
  outboundCommandSchema,
  requiresServiceWindow,
} from "../services/whatsapp.message-compiler.js";

test("compiles text with URL preview and reply context", () => {
  const command = outboundCommandSchema.parse({
    shopId: "shop-1",
    to: "919876543210",
    message: {
      kind: "text",
      text: "View https://example.com/order",
      previewUrl: true,
    },
  });

  assert.deepEqual(
    compileMetaMessage({
      to: command.to,
      message: command.message,
      replyToMetaMessageId: "wamid.parent",
    }),
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919876543210",
      context: { message_id: "wamid.parent" },
      type: "text",
      text: {
        body: "View https://example.com/order",
        preview_url: true,
      },
    },
  );
});

test("compiles media metadata without leaking unsupported fields", () => {
  const document = outboundCommandSchema.parse({
    shopId: "shop-1",
    to: "919876543210",
    message: {
      kind: "document",
      link: "https://cdn.example.com/invoice.pdf",
      caption: "Invoice",
      filename: "INV-100.pdf",
    },
  }).message;

  assert.deepEqual(compileMetaMessage({ to: "919876543210", message: document }), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "919876543210",
    type: "document",
    document: {
      link: "https://cdn.example.com/invoice.pdf",
      caption: "Invoice",
      filename: "INV-100.pdf",
    },
  });
  assert.equal(getLocalMessageProjection(document).type, "DOCUMENT");
  assert.equal(getLocalMessageProjection(document).fileName, "INV-100.pdf");

  const voice = outboundCommandSchema.parse({
    shopId: "shop-1",
    to: "919876543210",
    message: {
      kind: "audio",
      link: "https://cdn.example.com/voice.ogg",
      voice: true,
    },
  }).message;
  assert.deepEqual(compileMetaMessage({ to: "919876543210", message: voice }).audio, {
    link: "https://cdn.example.com/voice.ogg",
    voice: true,
  });
});

test("compiles reply buttons and removes absent optional sections", () => {
  const message = outboundCommandSchema.parse({
    shopId: "shop-1",
    to: "919876543210",
    message: {
      kind: "reply_buttons",
      body: "Choose an action",
      buttons: [
        { id: "confirm", title: "Confirm" },
        { id: "later", title: "Later" },
      ],
    },
  }).message;

  const payload = compileMetaMessage({ to: "919876543210", message });
  assert.equal(payload.type, "interactive");
  assert.equal(payload.interactive.type, "button");
  assert.equal(payload.interactive.header, undefined);
  assert.equal(payload.interactive.footer, undefined);
  assert.deepEqual(payload.interactive.action.buttons[0], {
    type: "reply",
    reply: { id: "confirm", title: "Confirm" },
  });
});

test("rejects interactive lists with more than ten total rows", () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({
    id: `row-${index}`,
    title: `Row ${index}`,
  }));

  const parsed = outboundCommandSchema.safeParse({
    shopId: "shop-1",
    to: "919876543210",
    message: {
      kind: "list",
      body: "Choose one",
      button: "Options",
      sections: [
        { title: "First", rows: rows.slice(0, 6) },
        { title: "Second", rows: rows.slice(6) },
      ],
    },
  });

  assert.equal(parsed.success, false);
  assert.match(parsed.error.issues[0].message, /at most 10 rows/i);
});

test("compiles location and contact messages", () => {
  const location = outboundCommandSchema.parse({
    shopId: "shop-1",
    to: "919876543210",
    message: {
      kind: "location",
      latitude: 19.076,
      longitude: 72.8777,
      name: "Mumbai",
    },
  }).message;

  const contacts = outboundCommandSchema.parse({
    shopId: "shop-1",
    to: "919876543210",
    message: {
      kind: "contacts",
      contacts: [{
        name: { formatted_name: "Support Team" },
        phones: [{ phone: "+919876543210", type: "WORK" }],
      }],
    },
  }).message;

  assert.equal(compileMetaMessage({ to: "919876543210", message: location }).type, "location");
  assert.equal(compileMetaMessage({ to: "919876543210", message: contacts }).contacts[0].name.formatted_name, "Support Team");
});

test("compiles Flow messages and marks only templates as window-independent", () => {
  const flow = outboundCommandSchema.parse({
    shopId: "shop-1",
    to: "919876543210",
    message: {
      kind: "flow",
      flowId: "flow-1",
      flowToken: "token-1",
      cta: "Open form",
      body: "Complete the form",
      initialScreen: "DETAILS",
      data: { orderId: "order-1" },
    },
  }).message;

  const payload = compileMetaMessage({ to: "919876543210", message: flow });
  assert.equal(payload.interactive.type, "flow");
  assert.equal(payload.interactive.action.parameters.flow_action_payload.screen, "DETAILS");
  assert.equal(requiresServiceWindow(flow), true);
  assert.equal(requiresServiceWindow({
    kind: "template",
    template: { name: "hello", language: { code: "en_US" } },
  }), false);
});
