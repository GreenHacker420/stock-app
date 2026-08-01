import test from "node:test";
import assert from "node:assert";
import * as dashboardService from "../services/dashboard.service.js";

test("getOwnerDashboardAnalytics - validation and aggregation tests", async (t) => {
  await t.test("rejects invalid date range (dateFrom > dateTo)", async () => {
    const ownerUser = { id: "user-1", role: "OWNER" };
    await assert.rejects(
      async () => {
        await dashboardService.getOwnerDashboardAnalytics(ownerUser, {
          dateFrom: "2026-08-10",
          dateTo: "2026-08-01",
        });
      },
      (err) => err.status === 400 && err.message.includes("dateFrom cannot be after dateTo")
    );
  });

  await t.test("rejects range greater than 366 days", async () => {
    const ownerUser = { id: "user-1", role: "OWNER" };
    await assert.rejects(
      async () => {
        await dashboardService.getOwnerDashboardAnalytics(ownerUser, {
          dateFrom: "2024-01-01",
          dateTo: "2026-08-01",
        });
      },
      (err) => err.status === 400 && err.message.includes("366 days")
    );
  });

  await t.test("returns valid empty payload structure when user has no owned shops", async () => {
    const ownerUser = { id: "non-existent-owner-id", role: "OWNER" };
    const res = await dashboardService.getOwnerDashboardAnalytics(ownerUser, {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-10",
    });

    assert.strictEqual(res.range.dateFrom, "2026-08-01");
    assert.strictEqual(res.range.dateTo, "2026-08-10");
    assert.strictEqual(res.range.granularity, "DAY");
    assert.strictEqual(res.range.timezone, "Asia/Kolkata");
    assert.strictEqual(res.totals.salesAmount, 0);
    assert.deepStrictEqual(res.salesTrend, []);
  });
});
