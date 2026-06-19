import test from "node:test";
import assert from "node:assert/strict";
import { validateWhatsAppMedia } from "../services/whatsapp.media-policy.js";

function file(overrides = {}) {
  return {
    buffer: Buffer.from("media"),
    mimetype: "image/jpeg",
    originalname: "photo.jpg",
    size: 5,
    ...overrides,
  };
}

test("validates supported WhatsApp media kinds and MIME types", () => {
  assert.equal(validateWhatsAppMedia({ kind: "image", file: file() }), "image");
  assert.equal(validateWhatsAppMedia({
    kind: "document",
    file: file({
      mimetype: "application/pdf",
      originalname: "invoice.pdf",
    }),
  }), "document");
});

test("rejects mismatched media MIME types and oversized files", () => {
  assert.throws(
    () => validateWhatsAppMedia({ kind: "image", file: file({ mimetype: "application/pdf" }) }),
    /not supported/i,
  );
  assert.throws(
    () => validateWhatsAppMedia({
      kind: "image",
      file: file({ size: 5 * 1024 * 1024 + 1 }),
    }),
    /5 MB or smaller/i,
  );
});
