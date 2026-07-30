/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";

import { filterAndRankCustomers, filterAndRankItems } from "../../../../utils/search";

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
