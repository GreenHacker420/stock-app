import crypto from "node:crypto";
import { getJwtSecret } from "../utils/env.js";
import { ApiError } from "../utils/ApiError.js";

function signature(value) {
  return crypto.createHmac("sha256", getJwtSecret()).update(value).digest("base64url");
}

export function encodeWhatsAppCursor(kind, row) {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    kind,
    timestamp: (kind === "conversation" ? row.updatedAt : row.createdAt).toISOString(),
    id: row.id,
  })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function decodeWhatsAppCursor(cursor, kind) {
  if (!cursor) return null;
  const [payload, providedSignature, extra] = String(cursor).split(".");
  if (!payload || !providedSignature || extra) {
    throw new ApiError(400, "Invalid pagination cursor", { code: "INVALID_CURSOR" });
  }
  const expected = signature(payload);
  const valid = providedSignature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expected));
  if (!valid) {
    throw new ApiError(400, "Invalid pagination cursor", { code: "INVALID_CURSOR" });
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const timestamp = new Date(decoded.timestamp);
    if (decoded.v !== 1 || decoded.kind !== kind || !decoded.id || Number.isNaN(timestamp.getTime())) {
      throw new Error("Invalid cursor payload");
    }
    return { timestamp, id: decoded.id };
  } catch {
    throw new ApiError(400, "Invalid pagination cursor", { code: "INVALID_CURSOR" });
  }
}

export function whatsappCursorWhere(cursor, timestampField) {
  if (!cursor) return undefined;
  return {
    OR: [
      { [timestampField]: { lt: cursor.timestamp } },
      { [timestampField]: cursor.timestamp, id: { lt: cursor.id } },
    ],
  };
}
