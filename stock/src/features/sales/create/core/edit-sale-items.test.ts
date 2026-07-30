import test from "node:test";
import assert from "node:assert/strict";
import type { Sale } from "../../../../api/client";
import {
  buildSaleEditPayload,
  hydrateEditableSaleItems,
  updateEditableSaleItemQuantity,
  updateEditableSaleItemSerials,
} from "./edit-sale-items";

const serializedSaleItems = [
  {
    id: "sale-item-1",
    itemId: "item-1",
    quantity: "1",
    rate: "3250",
    discountAmount: "50",
    totalAmount: "3200",
    serialNumbers: ["MORPHO-123"],
    description: "Customer device",
    item: {
      id: "item-1",
      name: "Morpho E3 RD",
      unit: "pcs",
      defaultSellingPrice: "3250",
      minimumStock: "0",
      requiresSerialNumber: true,
    },
  },
] as Sale["items"];

test("amount-only sale edits preserve serials, description, and line discount", () => {
  const editable = hydrateEditableSaleItems(serializedSaleItems);
  editable[0].rate = "3000";

  assert.deepStrictEqual(buildSaleEditPayload(editable), [
    {
      itemId: "item-1",
      quantity: 1,
      rate: 3000,
      discountAmount: 50,
      serialNumbers: ["MORPHO-123"],
      description: "Customer device",
    },
  ]);
});

test("legacy serial description is carried into the edit payload", () => {
  const items = structuredClone(serializedSaleItems) as NonNullable<Sale["items"]>;
  items[0].serialNumbers = null;
  items[0].description = "S/N: OLD-1, OLD-2";
  items[0].quantity = "2";

  const editable = hydrateEditableSaleItems(items);

  assert.deepStrictEqual(editable[0].serialNumbers, ["OLD-1", "OLD-2"]);
  assert.deepStrictEqual(buildSaleEditPayload(editable)[0].serialNumbers, ["OLD-1", "OLD-2"]);
});

test("quantity changes retain existing serials on increase and release extras on decrease", () => {
  const item = hydrateEditableSaleItems(serializedSaleItems)[0];

  const increased = updateEditableSaleItemQuantity(item, "2");
  assert.deepStrictEqual(increased.serialNumbers, ["MORPHO-123"]);

  const scanned = updateEditableSaleItemSerials(increased, ["MORPHO-123", "MORPHO-456"]);
  assert.deepStrictEqual(scanned.serialNumbers, ["MORPHO-123", "MORPHO-456"]);

  const decreased = updateEditableSaleItemQuantity(scanned, "1");
  assert.deepStrictEqual(decreased.serialNumbers, ["MORPHO-123"]);
});
