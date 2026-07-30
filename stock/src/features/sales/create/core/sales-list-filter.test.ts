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

test("local or legacy server drafts never appear in sales history totals", () => {
  const completed = {
    saleDate: "2026-07-30T10:00:00.000Z",
    createdAt: "2026-07-30T10:00:00.000Z",
    paymentStatus: "PAID",
    saleStatus: "COMPLETED",
  };
  const draft = {
    saleDate: "2026-07-30T11:00:00.000Z",
    createdAt: "2026-07-30T11:00:00.000Z",
    paymentStatus: "PENDING",
    saleStatus: "DRAFT",
  };

  const visible = filterSalesForPeriod([completed, draft], null);

  assert.deepEqual(visible, [completed]);
  assert.deepEqual(countSalesByStatus(visible), {
    ALL: 1,
    PAID: 1,
    PENDING: 0,
    PARTIAL: 0,
    CANCELLED: 0,
  });
});
