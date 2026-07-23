import assert from "node:assert/strict";
import test from "node:test";
import { resolveProviderTransition } from "../services/whatsapp.status-state.js";

const current = {
  attempt: 2,
  providerStatus: "DELIVERED",
  providerStatusAt: new Date("2026-07-23T10:00:00.000Z"),
  contentState: "VISIBLE",
};

test("older attempts and older timestamps cannot modify current delivery state", () => {
  assert.equal(resolveProviderTransition(current, {
    attempt: 1,
    providerStatus: "READ",
    providerTimestamp: "2026-07-23T11:00:00.000Z",
  }).apply, false);
  assert.equal(resolveProviderTransition(current, {
    attempt: 2,
    providerStatus: "READ",
    providerTimestamp: "2026-07-23T09:00:00.000Z",
  }).apply, false);
});

test("successful provider states are monotonic and READ never regresses", () => {
  assert.equal(resolveProviderTransition(current, {
    attempt: 2,
    providerStatus: "SENT",
    providerTimestamp: "2026-07-23T11:00:00.000Z",
  }).apply, false);
  assert.equal(resolveProviderTransition({ ...current, providerStatus: "READ" }, {
    attempt: 2,
    providerStatus: "FAILED",
    providerTimestamp: "2026-07-23T11:00:00.000Z",
  }).apply, false);
});

test("newer success for the current attempt may supersede FAILED", () => {
  const result = resolveProviderTransition({
    ...current,
    providerStatus: "FAILED",
  }, {
    attempt: 2,
    providerStatus: "DELIVERED",
    providerTimestamp: "2026-07-23T11:00:00.000Z",
  });
  assert.equal(result.apply, true);
  assert.equal(result.providerStatus, "DELIVERED");
});

test("duplicate callbacks do not create another transition", () => {
  const result = resolveProviderTransition(current, {
    attempt: 2,
    providerStatus: "DELIVERED",
    providerTimestamp: "2026-07-23T10:00:00.000Z",
  });
  assert.deepEqual(result, { apply: false, reason: "duplicate" });
});
