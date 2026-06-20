import test from "node:test";
import assert from "node:assert/strict";
import {
  createOnboardingState,
  hashOnboardingNonce,
  parseOnboardingState,
} from "../services/whatsapp.onboarding-state.js";

test("creates and validates a signed onboarding state", () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const created = createOnboardingState("session-1", expiresAt);
  const parsed = parseOnboardingState(created.state);
  assert.equal(parsed.sessionId, "session-1");
  assert.equal(hashOnboardingNonce(parsed.nonce), created.nonceHash);
});

test("rejects tampered and expired onboarding state", () => {
  const active = createOnboardingState("session-2", new Date(Date.now() + 60_000));
  assert.throws(() => parseOnboardingState(`${active.state}x`), /invalid/i);
  const expired = createOnboardingState("session-3", new Date(Date.now() - 1));
  assert.throws(() => parseOnboardingState(expired.state), /expired/i);
});
