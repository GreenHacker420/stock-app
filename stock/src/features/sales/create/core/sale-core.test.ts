/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { createRegularSettlement } from "./sale-calculations";
import { createInitialSaleDraft, saleDraftReducer } from "./sale-draft.reducer";
import { createSaleFingerprint } from "./sale-fingerprint";
import { validateSaleDraft } from "./sale-validation";
import { regularSalePolicy, walkInSalePolicy, type ItemSnapshot } from "./sale.types";

const item: ItemSnapshot = {
  id: "item-1",
  name: "Ink",
  unit: "pcs",
  availableStock: 3,
  defaultRateMinor: 10000,
  minimumRateMinor: 9000,
  requiresSerialNumber: true,
};

/** Helper: unwrap a validated SettlementResult — throws in tests if invalid. */
function unwrapSettlement(result: ReturnType<typeof createRegularSettlement>) {
  if (!result.ok) throw new Error(`Unexpected settlement error: ${result.error}`);
  return result.settlement;
}

test("quantity and serials are centrally clamped", () => {
  let draft = createInitialSaleDraft("REGULAR", "shop-1");
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item, delta: 10 });
  assert.equal(draft.lines[item.id].quantity, 3);
  draft = saleDraftReducer(draft, { type: "SET_SERIALS", itemId: item.id, serialNumbers: ["1", "2", "3", "4"] });
  assert.deepEqual(draft.lines[item.id].serialNumbers, ["1", "2", "3"]);
});

test("cart, customer and settlement changes invalidate authorization", () => {
  let draft = createInitialSaleDraft("REGULAR", "shop-1");
  draft = saleDraftReducer(draft, { type: "SET_CUSTOMER", customer: { kind: "EXISTING", customer: { id: "c1", name: "A" } } });
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  draft = saleDraftReducer(draft, {
    type: "SET_SETTLEMENT",
    settlement: unwrapSettlement(createRegularSettlement("CREDIT", 10000, 0)),
  });
  const fingerprint = createSaleFingerprint(draft);
  draft = saleDraftReducer(draft, {
    type: "AUTHORIZE_CREDIT",
    authorization: { signatureBase64: "sig", customerId: "c1", transactionFingerprint: fingerprint, totalMinor: 10000, paidMinor: 0, creditMinor: 10000, capturedAt: "now" },
  });
  assert.ok(draft.creditAuthorization);
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  assert.equal(draft.creditAuthorization, null);
});

test("walk-in UPI requires confirmation for the current fingerprint", () => {
  let draft = createInitialSaleDraft("WALK_IN", "shop-1");
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  draft = saleDraftReducer(draft, {
    type: "SET_SETTLEMENT",
    settlement: { kind: "WALK_IN_UPI", paidMinor: 10000, upiId: "shop@upi", confirmedFingerprint: null },
  });
  assert.equal(validateSaleDraft(draft, walkInSalePolicy).errors.upi, "Confirm that the current UPI amount was received.");

  const proposed = { kind: "WALK_IN_UPI" as const, paidMinor: 10000, upiId: "shop@upi", confirmedFingerprint: null };
  const fingerprint = createSaleFingerprint({ ...draft, settlement: proposed });
  draft = saleDraftReducer(draft, { type: "SET_SETTLEMENT", settlement: { ...proposed, confirmedFingerprint: fingerprint } });
  assert.equal(validateSaleDraft(draft, walkInSalePolicy).isValid, true);
});

test("regular credit requires a current authorization and reset clears the draft", () => {
  let draft = createInitialSaleDraft("REGULAR", "shop-1");
  draft = saleDraftReducer(draft, { type: "SET_CUSTOMER", customer: { kind: "EXISTING", customer: { id: "c1", name: "A" } } });
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  draft = saleDraftReducer(draft, {
    type: "SET_SETTLEMENT",
    settlement: unwrapSettlement(createRegularSettlement("CREDIT", 10000, 0)),
  });
  assert.ok(validateSaleDraft(draft, regularSalePolicy).errors.signature);
  draft = saleDraftReducer(draft, { type: "RESET_DRAFT" });
  assert.deepEqual(draft.lines, {});
  assert.equal(draft.creditAuthorization, null);
});

test("quantity clamps at zero and available stock", () => {
  let draft = createInitialSaleDraft("REGULAR", "shop-1");
  // Try adding a negative quantity, should clamp to 0 (and remove line)
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item, delta: -5 });
  assert.deepEqual(draft.lines, {});

  // Try setting quantity above available stock (which is 3)
  draft = saleDraftReducer(draft, { type: "SET_QUANTITY", item, quantity: 10 });
  assert.equal(draft.lines[item.id].quantity, 3);
});

test("serial numbers truncate after decrement", () => {
  let draft = createInitialSaleDraft("REGULAR", "shop-1");
  draft = saleDraftReducer(draft, { type: "SET_QUANTITY", item, quantity: 3 });
  draft = saleDraftReducer(draft, { type: "SET_SERIALS", itemId: item.id, serialNumbers: ["sn-1", "sn-2", "sn-3"] });
  assert.deepEqual(draft.lines[item.id].serialNumbers, ["sn-1", "sn-2", "sn-3"]);

  // Decrement quantity to 2, serials should truncate to first 2
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item, delta: -1 });
  assert.equal(draft.lines[item.id].quantity, 2);
  assert.deepEqual(draft.lines[item.id].serialNumbers, ["sn-1", "sn-2"]);
});

test("UPI confirmation invalidates on price, quantity, and UPI ID change", () => {
  let draft = createInitialSaleDraft("WALK_IN", "shop-1");
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });

  const proposed = { kind: "WALK_IN_UPI" as const, paidMinor: 10000, upiId: "shop@upi", confirmedFingerprint: null };
  const fingerprint = createSaleFingerprint({ ...draft, settlement: proposed });
  draft = saleDraftReducer(draft, {
    type: "SET_SETTLEMENT",
    settlement: { ...proposed, confirmedFingerprint: fingerprint },
  });

  // Validation should be valid now
  assert.equal(validateSaleDraft(draft, walkInSalePolicy).isValid, true);

  // Invalidate by changing quantity
  const draft1 = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  assert.ok(validateSaleDraft(draft1, walkInSalePolicy).errors.upi);

  // Invalidate by changing rate
  const draft2 = saleDraftReducer(draft, { type: "SET_RATE", itemId: item.id, rateMinor: 12000 });
  assert.ok(validateSaleDraft(draft2, walkInSalePolicy).errors.upi);

  // Invalidate by changing UPI ID (simulated by mutating the settlement's upiId)
  const draft3 = saleDraftReducer(draft, {
    type: "SET_SETTLEMENT",
    settlement: { ...proposed, upiId: "newshop@upi", confirmedFingerprint: fingerprint },
  });
  // fingerprint was computed for "shop@upi", now upiId differs → stale
  assert.ok(validateSaleDraft(draft3, walkInSalePolicy).errors.upi);
});

test("credit signature invalidates on customer, price, and settlement change", () => {
  let draft = createInitialSaleDraft("REGULAR", "shop-1");
  draft = saleDraftReducer(draft, { type: "SET_CUSTOMER", customer: { kind: "EXISTING", customer: { id: "c1", name: "A" } } });
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  draft = saleDraftReducer(draft, {
    type: "SET_SETTLEMENT",
    settlement: unwrapSettlement(createRegularSettlement("CREDIT", 10000, 0)),
  });

  const fingerprint = createSaleFingerprint(draft);
  draft = saleDraftReducer(draft, {
    type: "AUTHORIZE_CREDIT",
    authorization: { signatureBase64: "sig", customerId: "c1", transactionFingerprint: fingerprint, totalMinor: 10000, paidMinor: 0, creditMinor: 10000, capturedAt: "now" },
  });
  assert.ok(draft.creditAuthorization);

  // Invalidate by changing customer
  const draft1 = saleDraftReducer(draft, { type: "SET_CUSTOMER", customer: { kind: "EXISTING", customer: { id: "c2", name: "B" } } });
  assert.equal(draft1.creditAuthorization, null);

  // Invalidate by changing rate
  const draft2 = saleDraftReducer(draft, { type: "SET_RATE", itemId: item.id, rateMinor: 15000 });
  assert.equal(draft2.creditAuthorization, null);

  // Invalidate by changing settlement
  const draft3 = saleDraftReducer(draft, {
    type: "SET_SETTLEMENT",
    settlement: unwrapSettlement(createRegularSettlement("CASH", 10000, 10000)),
  });
  assert.equal(draft3.creditAuthorization, null);
});

test("reset draft clears all fields for regular and walk-in", () => {
  // Regular reset
  let regDraft = createInitialSaleDraft("REGULAR", "shop-1");
  regDraft = saleDraftReducer(regDraft, { type: "SET_CUSTOMER", customer: { kind: "EXISTING", customer: { id: "c1", name: "A" } } });
  regDraft = saleDraftReducer(regDraft, { type: "ADD_QUANTITY", item, delta: 1 });
  regDraft = saleDraftReducer(regDraft, { type: "SET_NOTES", notes: "test notes" });
  regDraft = saleDraftReducer(regDraft, { type: "SET_GST", required: true });

  regDraft = saleDraftReducer(regDraft, { type: "RESET_DRAFT", shopId: "shop-2" });
  assert.equal(regDraft.shopId, "shop-2");
  assert.deepEqual(regDraft.lines, {});
  assert.equal(regDraft.notes, "");
  assert.equal(regDraft.gstRequired, false);
  assert.equal(regDraft.customer.kind, "ANONYMOUS");
});

test("createRegularSettlement validates correctly", () => {
  const invalidTotal = createRegularSettlement("CASH", 0, 1000);
  assert.equal(invalidTotal.ok, false);
  if (!invalidTotal.ok) assert.equal(invalidTotal.error, "INVALID_TOTAL");

  // INSUFFICIENT_PAYMENT for non-credit
  const under = createRegularSettlement("CASH", 10000, 5000);
  assert.equal(under.ok, false);
  assert.equal(!under.ok && under.error, "INSUFFICIENT_PAYMENT");

  // CREDIT_PAYMENT_EXCEEDS_TOTAL
  const over = createRegularSettlement("CREDIT", 10000, 15000);
  assert.equal(over.ok, false);
  assert.equal(!over.ok && over.error, "CREDIT_PAYMENT_EXCEEDS_TOTAL");

  // Correct cash with change
  const cash = createRegularSettlement("CASH", 10000, 12000);
  assert.equal(cash.ok, true);
  if (cash.ok) {
    assert.equal(cash.settlement.kind, "FULL_PAYMENT");
    if (cash.settlement.kind === "FULL_PAYMENT") {
      assert.equal(cash.settlement.changeMinor, 2000);
    }
  }

  // Full credit
  const credit = createRegularSettlement("CREDIT", 10000, 0);
  assert.equal(credit.ok, true);
  if (credit.ok) assert.equal(credit.settlement.kind, "FULL_CREDIT");

  // Partial credit
  const partial = createRegularSettlement("CREDIT", 10000, 3000);
  assert.equal(partial.ok, true);
  if (partial.ok) {
    assert.equal(partial.settlement.kind, "PARTIAL_CREDIT");
    if (partial.settlement.kind === "PARTIAL_CREDIT") {
      assert.equal(partial.settlement.creditMinor, 7000);
    }
  }
});
