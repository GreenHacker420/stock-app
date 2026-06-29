import crypto from "node:crypto";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashRequestBody(body) {
  return crypto.createHash("sha256").update(stableStringify(body || {})).digest("hex");
}

function normalizeJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getIdempotencyKey(req) {
  return req.get("Idempotency-Key") || req.get("X-Idempotency-Key") || null;
}

export async function runIdempotentCreate(req, { endpoint, resourceType, shopId, statusCode = 201 }, handler) {
  const key = getIdempotencyKey(req);
  const userId = req.user?.id;

  if (!key) {
    const data = await handler();
    return { data, statusCode, replayed: false };
  }

  if (!shopId || !userId) {
    throw new ApiError(400, "Idempotency requires shop and user context");
  }

  const requestHash = hashRequestBody(req.validated?.body || req.body || {});
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      key_shopId_endpoint: { key, shopId, endpoint },
    },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new ApiError(409, "Idempotency key reused with a different request payload", {
        code: "IDEMPOTENCY_KEY_CONFLICT",
      });
    }
    if (existing.responseJson && existing.statusCode) {
      return {
        data: existing.responseJson,
        statusCode: existing.statusCode,
        replayed: true,
        resourceId: existing.resourceId,
      };
    }
    throw new ApiError(409, "Idempotent request is already being processed", {
      code: "IDEMPOTENCY_REQUEST_IN_PROGRESS",
    });
  }

  await prisma.idempotencyKey.create({
    data: {
      key,
      shopId,
      userId,
      endpoint,
      requestHash,
      resourceType,
    },
  });

  try {
    const data = await handler();
    const responseJson = normalizeJson(data);
    await prisma.idempotencyKey.update({
      where: {
        key_shopId_endpoint: { key, shopId, endpoint },
      },
      data: {
        responseJson,
        statusCode,
        resourceId: data?.id || null,
      },
    });
    return { data, statusCode, replayed: false, resourceId: data?.id || null };
  } catch (error) {
    await prisma.idempotencyKey.delete({
      where: {
        key_shopId_endpoint: { key, shopId, endpoint },
      },
    }).catch(() => {});
    throw error;
  }
}
