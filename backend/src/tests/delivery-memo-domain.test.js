import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveDeliveryMemoDueStatus,
  legacyDeliveryMemoStatusForPayment,
  withDerivedMemoState,
} from "../services/deliveryMemo.domain.js";

test("zero-payment delivery memo remains created/unpaid", () => {
  assert.equal(legacyDeliveryMemoStatusForPayment("UNPAID"), "CREATED");
  assert.equal(legacyDeliveryMemoStatusForPayment("PARTIALLY_PAID"), "PARTIALLY_PAID");
  assert.equal(legacyDeliveryMemoStatusForPayment("PAID"), "FULLY_PAID");
});

test("due state is derived independently from lifecycle and payment state", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  assert.equal(deriveDeliveryMemoDueStatus({ balanceAmount: 0 }, now), "SETTLED");
  assert.equal(deriveDeliveryMemoDueStatus({ balanceAmount: 100, expectedPaymentDate: null }, now), "NOT_DUE");
  assert.equal(deriveDeliveryMemoDueStatus({ balanceAmount: 100, expectedPaymentDate: "2026-07-13T00:00:00.000Z" }, now), "OVERDUE");
  assert.equal(deriveDeliveryMemoDueStatus({ balanceAmount: 100, expectedPaymentDate: "2026-07-14T00:00:00.000Z" }, now), "DUE_TODAY");
});

test("server action policy prevents draft collection and duplicate conversion", () => {
  const base = {
    staffId: "staff-1",
    balanceAmount: 500,
    returnStatus: "NO_RETURN",
    invoicingStatus: "NOT_INVOICED",
    documentPurpose: "CREDIT_DELIVERY",
    sales: [],
    expectedPaymentDate: null,
  };
  const draft = withDerivedMemoState({ ...base, lifecycleStatus: "DRAFT" }, { id: "staff-1", role: "STAFF" });
  assert.equal(draft.allowedActions.canPost, true);
  assert.equal(draft.allowedActions.canCollectPayment, false);

  const posted = withDerivedMemoState({ ...base, lifecycleStatus: "DISPATCHED" }, { id: "staff-1", role: "STAFF" });
  assert.equal(posted.allowedActions.canCollectPayment, true);
  assert.equal(posted.allowedActions.canConvertToSale, true);

  const invoiced = withDerivedMemoState({ ...base, lifecycleStatus: "DISPATCHED", invoicingStatus: "FULLY_INVOICED" }, { id: "staff-1", role: "STAFF" });
  assert.equal(invoiced.allowedActions.canConvertToSale, false);
  assert.equal(invoiced.allowedActions.canRequestCancellation, false);
});
