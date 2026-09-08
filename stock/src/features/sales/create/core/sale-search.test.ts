/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";

import { filterAndRankCustomers, filterAndRankItems } from "../../../../utils/search";
import { getMatchRanges } from "../../../../utils/highlight";

test("multi-word product search requires every token and ranks the full name first", () => {
  const products = [
    { id: "wrong-1", name: "A4 Copier Paper", categoryName: "Paper" },
    { id: "right", name: "Lamination Pouch A4", categoryName: "Office Supplies" },
    { id: "wrong-2", name: "Lamination Machine", categoryName: "Machines" },
  ];

  assert.deepEqual(
    filterAndRankItems(products, "A4 lamination pouch").map((item) => item.id),
    ["right"],
  );
});

test("product search can match query words across name, category, brand, and SKU", () => {
  const products = [
    {
      id: "right",
      name: "Pouch",
      sku: "A4-125",
      categoryName: "Lamination",
      brandName: "Oddy",
    },
    { id: "wrong", name: "A4 Paper Pouch", categoryName: "Stationery" },
  ];

  assert.deepEqual(
    filterAndRankItems(products, "A4 lamination pouch").map((item) => item.id),
    ["right"],
  );
});

test("dimension search: 70x100 matches 70*100, 70 x 100, and 70x100 interchangeably", () => {
  const products = [
    { id: "star-1", name: "70*100 jmd 250 mic" },
    { id: "star-2", name: "70*100 jmd 350mic(50pc)" },
    { id: "x-1", name: "70x100 250 mic mizu" },
    { id: "star-3", name: "Lamination Pouch 70*100 125 mic mizu" },
    { id: "x-2", name: "70x100 125mic. Lamination pouch" },
    { id: "other", name: "80x120 250 mic pouch" },
  ];

  // Searching "70x100" should match all 5 items with 70 and 100
  const result1 = filterAndRankItems(products, "70x100").map((item) => item.id);
  assert.equal(result1.includes("other"), false);
  assert.equal(result1.length, 5);

  // Searching "70*100" should match all 5 items as well
  const result2 = filterAndRankItems(products, "70*100").map((item) => item.id);
  assert.equal(result2.includes("other"), false);
  assert.equal(result2.length, 5);
});

test("dimension highlight ranges: getMatchRanges handles dimension delimiter variants", () => {
  // Query 70x100 on text with 70*100
  const ranges1 = getMatchRanges("70*100 125mic. Lamination pouch", "70x100");
  assert.deepEqual(ranges1, [[0, 6]]);

  // Query 70*100 on text with 70x100
  const ranges2 = getMatchRanges("70x100 250 mic mizu", "70*100");
  assert.deepEqual(ranges2, [[0, 6]]);

  // Query with space "70 100" on text with 70*100
  const ranges3 = getMatchRanges("Lamination Pouch 70*100 125 mic", "70 100");
  assert.deepEqual(ranges3, [[17, 23]]);
});

test("customer search ranks exact name and normalized phone matches", () => {
  const customers = [
    { id: "contains", name: "Harsh BSNL Services", phone: "9999999999" },
    { id: "exact", name: "Harsh BSNL", phone: "9329470933" },
    { id: "other", name: "Harsh Traders", phone: "8888888888" },
  ];

  assert.deepEqual(
    filterAndRankCustomers(customers, "Harsh BSNL").map((customer) => customer.id),
    ["exact", "contains"],
  );
  assert.deepEqual(
    filterAndRankCustomers(customers, "932 947 0933").map((customer) => customer.id),
    ["exact"],
  );
});
