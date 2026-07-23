import assert from "node:assert/strict";
import test from "node:test";
import {
  hashLogicalMessage,
  queueJobId,
  resolveIdempotentMessage,
} from "../services/whatsapp.idempotency.js";

test("canonical content hashing is stable across object key order", () => {
  const first = hashLogicalMessage({
    conversationId: "conversation-a",
    message: { kind: "text", text: "Hello", previewUrl: true },
  });
  const second = hashLogicalMessage({
    message: { previewUrl: true, text: "Hello", kind: "text" },
    conversationId: "conversation-a",
  });
  assert.equal(first, second);
});

test("same logical client message returns the existing database message", () => {
  const existing = { id: "message-a", clientPayloadHash: "hash-a", attempt: 1 };
  assert.strictEqual(resolveIdempotentMessage(existing, "hash-a"), existing);
});

test("reusing a client message ID with different canonical content conflicts", () => {
  assert.throws(
    () => resolveIdempotentMessage({ id: "message-a", clientPayloadHash: "hash-a" }, "hash-b"),
    (error) => error.statusCode === 409 && error.details?.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("queue job IDs change per attempt without changing the message ID", () => {
  assert.equal(queueJobId("message-a", 1), "wa-send-message-a-attempt-1");
  assert.equal(queueJobId("message-a", 2), "wa-send-message-a-attempt-2");
  assert.notEqual(queueJobId("message-a", 1), queueJobId("message-a", 2));
});
