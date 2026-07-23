import crypto from "node:crypto";
import { ApiError } from "../utils/ApiError.js";

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashLogicalMessage(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function queueJobId(messageId, attempt) {
  return `wa-send-${messageId}-attempt-${attempt}`;
}

export function resolveIdempotentMessage(existing, clientPayloadHash) {
  if (!existing) return null;
  if (existing.clientPayloadHash !== clientPayloadHash) {
    throw new ApiError(409, "Client message ID reused with different content", {
      code: "IDEMPOTENCY_CONFLICT",
    });
  }
  return existing;
}
