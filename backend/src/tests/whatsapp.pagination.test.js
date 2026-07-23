import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET ||= "whatsapp-pagination-test-secret-with-adequate-length";
const {
  decodeWhatsAppCursor,
  encodeWhatsAppCursor,
  whatsappCursorWhere,
} = await import("../services/whatsapp.pagination.js");

test("signed cursor preserves the timestamp and id tie-breaker", () => {
  const row = { id: "message-002", createdAt: new Date("2026-07-23T10:00:00.000Z") };
  const cursor = encodeWhatsAppCursor("message", row);
  const decoded = decodeWhatsAppCursor(cursor, "message");
  assert.equal(decoded.timestamp.toISOString(), row.createdAt.toISOString());
  assert.equal(decoded.id, row.id);
  assert.deepEqual(whatsappCursorWhere(decoded, "createdAt"), {
    OR: [
      { createdAt: { lt: row.createdAt } },
      { createdAt: row.createdAt, id: { lt: row.id } },
    ],
  });
});

test("cursor rejects tampering and use with another collection", () => {
  const cursor = encodeWhatsAppCursor("message", {
    id: "message-002",
    createdAt: new Date("2026-07-23T10:00:00.000Z"),
  });
  assert.throws(() => decodeWhatsAppCursor(`${cursor}x`, "message"), /Invalid pagination cursor/);
  assert.throws(() => decodeWhatsAppCursor(cursor, "conversation"), /Invalid pagination cursor/);
});
