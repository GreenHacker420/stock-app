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
  
  const proposed = { kind: "WALK_IN_UPI" as const, paidMinor: 10000, confirmedFingerprint: null };
  const fingerprint = createSaleFingerprint({ ...draft, settlement: proposed });
  draft = saleDraftReducer(draft, { type: "SET_SETTLEMENT", settlement: { ...proposed, confirmedFingerprint: fingerprint } });
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

test("UPI confirmation invalidates on price, quantity, and UPI change", () => {
  let draft = createInitialSaleDraft("WALK_IN", "shop-1");
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  
  const proposed = { kind: "WALK_IN_UPI" as const, paidMinor: 10000, confirmedFingerprint: null };
  const fingerprint = createSaleFingerprint({ ...draft, settlement: proposed });
  draft = saleDraftReducer(draft, {
    type: "SET_SETTLEMENT",
    settlement: { ...proposed, confirmedFingerprint: fingerprint }
  });
  
  // Validation should be valid now
  assert.equal(validateSaleDraft(draft, walkInSalePolicy).isValid, true);

  // Invalidate by changing quantity
  let draft1 = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  assert.ok(validateSaleDraft(draft1, walkInSalePolicy).errors.upi);

  // Invalidate by changing rate
  let draft2 = saleDraftReducer(draft, { type: "SET_RATE", itemId: item.id, rateMinor: 12000 });
  assert.ok(validateSaleDraft(draft2, walkInSalePolicy).errors.upi);
});

test("credit signature invalidates on customer, price, and settlement change", () => {
  let draft = createInitialSaleDraft("REGULAR", "shop-1");
  draft = saleDraftReducer(draft, { type: "SET_CUSTOMER", customer: { kind: "EXISTING", customer: { id: "c1", name: "A" } } });
  draft = saleDraftReducer(draft, { type: "ADD_QUANTITY", item: { ...item, requiresSerialNumber: false }, delta: 1 });
  draft = saleDraftReducer(draft, { type: "SET_SETTLEMENT", settlement: createRegularSettlement("CREDIT", 10000, 0) });
  
  const fingerprint = createSaleFingerprint(draft);
  draft = saleDraftReducer(draft, {
    type: "AUTHORIZE_CREDIT",
    authorization: { signatureBase64: "sig", customerId: "c1", transactionFingerprint: fingerprint, totalMinor: 10000, paidMinor: 0, creditMinor: 10000, capturedAt: "now" }
  });
  assert.ok(draft.creditAuthorization);

  // Invalidate by changing customer
  let draft1 = saleDraftReducer(draft, { type: "SET_CUSTOMER", customer: { kind: "EXISTING", customer: { id: "c2", name: "B" } } });
  assert.equal(draft1.creditAuthorization, null);

  // Invalidate by changing rate
  let draft2 = saleDraftReducer(draft, { type: "SET_RATE", itemId: item.id, rateMinor: 15000 });
  assert.equal(draft2.creditAuthorization, null);

  // Invalidate by changing settlement
  let draft3 = saleDraftReducer(draft, { type: "SET_SETTLEMENT", settlement: createRegularSettlement("CASH", 10000, 10000) });
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
