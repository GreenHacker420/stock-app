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
  draft = saleDraftReducer(draft, { type: "SET_SETTLEMENT", settlement: createRegularSettlement("CREDIT", 10000, 0) });
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
  draft = saleDraftReducer(draft, { type: "SET_SETTLEMENT", settlement: { kind: "WALK_IN_UPI", paidMinor: 10000, confirmedFingerprint: null } });
  assert.equal(validateSaleDraft(draft, walkInSalePolicy).errors.upi, "Confirm that the current UPI amount was received.");
  const fingerprint = createSaleFingerprint(draft);
  draft = { ...draft, settlement: { kind: "WALK_IN_UPI", paidMinor: 10000, confirmedFingerprint: fingerprint } };
  assert.equal(validateSaleDraft(draft, walkInSalePolicy).isValid, true);
});

test("regular credit requires a current authorization and reset clears the draft", () => {
  let draft = createInitialSaleDraft("REGULAR", "shop-1");
  draft = saleDraftReducer(draft, { type: "SET_CUSTOMER", customer: { kind: "EXISTING", customer: { id: "c1", name: "A" } } });
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  draft = saleDraftReducer(draft, { type: "SET_SETTLEMENT", settlement: createRegularSettlement("CREDIT", 10000, 0) });
  assert.ok(validateSaleDraft(draft, regularSalePolicy).errors.signature);
  draft = saleDraftReducer(draft, { type: "RESET_DRAFT" });
  assert.deepEqual(draft.lines, {});
  assert.equal(draft.creditAuthorization, null);
});
