import test from "node:test";
import assert from "node:assert";
import { buildWhatsAppNotification } from "../services/whatsapp.notification-preview.js";

test("WhatsApp text notification includes sender and message preview", () => {
  const notification = buildWhatsAppNotification({
    event: {
      type: "text",
      from: "+919876543210",
      contactName: "Chacha",
      content: "Please keep two printers ready.",
    },
    conversation: {
      contactName: "Chacha",
      phone: "+919876543210",
    },
  });

  assert.deepStrictEqual(notification, {
    title: "Chacha · WhatsApp",
    body: "Please keep two printers ready.",
  });
});

test("WhatsApp media notification describes the media and caption", () => {
  assert.deepStrictEqual(
    buildWhatsAppNotification({
      event: { type: "image", content: "Payment screenshot" },
      conversation: { contactName: "Harsh BSNL" },
    }),
    {
      title: "Harsh BSNL · WhatsApp",
      body: "📷 Photo: Payment screenshot",
    },
  );

  assert.deepStrictEqual(
    buildWhatsAppNotification({
      event: { type: "document", fileName: "purchase-order.pdf" },
      conversation: { phone: "+919999999999" },
    }),
    {
      title: "+919999999999 · WhatsApp",
      body: "📄 purchase-order.pdf",
    },
  );
});

test("WhatsApp notification preview collapses whitespace and truncates long text", () => {
  const notification = buildWhatsAppNotification({
    event: { type: "text", content: `Hello\n\n${"x".repeat(180)}` },
    conversation: { contactName: " Customer  Name " },
  });

  assert.strictEqual(notification.title, "Customer Name · WhatsApp");
  assert.ok(notification.body.length <= 140);
  assert.ok(notification.body.endsWith("…"));
  assert.ok(!notification.body.includes("\n"));
});
