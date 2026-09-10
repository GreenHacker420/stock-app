import assert from "node:assert/strict";
import test from "node:test";

import {
  formatStockMovementQuantity,
  getStockMovementDirection,
  getStockMovementReferenceKind,
} from "./stock-movement";

test("normalizes mixed-case movement references", () => {
  assert.equal(getStockMovementReferenceKind("Sale"), "SALE");
  assert.equal(getStockMovementReferenceKind("delivery_memo"), "DM");
  assert.equal(getStockMovementReferenceKind("order_dispatch"), "ORDER");
});

test("does not render zero movement as negative", () => {
  const movement = { quantityIn: 0, quantityOut: 0 };
  assert.equal(getStockMovementDirection(movement), "neutral");
  assert.equal(formatStockMovementQuantity(movement, "pcs"), "0 pcs");
});

test("formats incoming and outgoing quantities with a clear direction", () => {
  assert.equal(formatStockMovementQuantity({ quantityIn: 4, quantityOut: 0 }, "pcs"), "+4 pcs");
  assert.equal(formatStockMovementQuantity({ quantityIn: 0, quantityOut: "2" }, "pcs"), "−2 pcs");
});
