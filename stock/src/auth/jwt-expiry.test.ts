import assert from "node:assert/strict";
import test from "node:test";
import { isJwtExpired } from "./jwt-expiry";

function tokenWithPayload(payload: Record<string, unknown>) {
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString("base64url");
  return `header.${encodedPayload}.signature`;
}

test("accepts a JWT that remains valid beyond the clock allowance", () => {
  const nowMs = 1_700_000_000_000;
  const token = tokenWithPayload({ exp: nowMs / 1000 + 31 });

  assert.equal(isJwtExpired(token, nowMs), false);
});

test("rejects expired and nearly-expired JWTs before authenticated startup", () => {
  const nowMs = 1_700_000_000_000;

  assert.equal(isJwtExpired(tokenWithPayload({ exp: nowMs / 1000 - 1 }), nowMs), true);
  assert.equal(isJwtExpired(tokenWithPayload({ exp: nowMs / 1000 + 30 }), nowMs), true);
});

test("rejects malformed JWTs and JWTs without an expiry", () => {
  assert.equal(isJwtExpired("not-a-jwt"), true);
  assert.equal(isJwtExpired(tokenWithPayload({ sub: "user-1" })), true);
});
