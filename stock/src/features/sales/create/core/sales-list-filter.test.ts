import assert from "node:assert/strict";
import test from "node:test";

import {
  countSalesByStatus,
  filterSalesForPeriod,
  getSalePeriodRange,
} from "./sales-list-filter";

test("today filtering uses saleDate instead of a different creation date", () => {
  const now = new Date(2026, 6, 30, 14, 0, 0);
  const range = getSalePeriodRange("TODAY", now, now, now);
  const sales = [
    {
      saleDate: new Date(2026, 6, 30, 10, 0, 0).toISOString(),
      createdAt: new Date(2026, 6, 29, 23, 0, 0).toISOString(),
      paymentStatus: "UNPAID",
    },
    {
      saleDate: new Date(2026, 6, 29, 18, 0, 0).toISOString(),
      createdAt: new Date(2026, 6, 30, 9, 0, 0).toISOString(),
      paymentStatus: "PAID",
    },
  ];

  assert.deepEqual(filterSalesForPeriod(sales, range), [sales[0]]);
});

test("this week starts on Monday and status counts use only period sales", () => {
  const now = new Date(2026, 6, 30, 14, 0, 0);
  const range = getSalePeriodRange("WEEK", now, now, now);
  assert.equal(range?.start.getDay(), 1);

  const periodSales = filterSalesForPeriod([
    {
      saleDate: new Date(2026, 6, 26, 12, 0, 0).toISOString(),
      createdAt: new Date(2026, 6, 26, 12, 0, 0).toISOString(),
      paymentStatus: "PAID",
    },
    {
      saleDate: new Date(2026, 6, 30, 12, 0, 0).toISOString(),
      createdAt: new Date(2026, 6, 30, 12, 0, 0).toISOString(),
      paymentStatus: "UNPAID",
    },
  ], range);

  assert.deepEqual(countSalesByStatus(periodSales), {
    ALL: 1,
    PAID: 0,
    PENDING: 1,
    PARTIAL: 0,
    CANCELLED: 0,
  });
});
