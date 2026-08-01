import { describe, it, expect } from "vitest";
import { OwnerDashboardData, StaffDashboardData } from "../../lib/api/client";

describe("Dashboard Contract Schema Verification", () => {
  it("validates exact OwnerDashboardData response structure", () => {
    const data: OwnerDashboardData = {
      date: "2026-08-01",
      todaySales: 15000,
      walkinSales: 5000,
      salesCount: 12,
      ordersCreated: 4,
      ordersToPack: 2,
      ordersDispatched: 3,
      pendingDmAmount: 2500,
      cashCollected: 8000,
      upiCollected: 7000,
      cardCollected: 0,
      bankCollected: 0,
      chequeReceived: 0,
      paymentVerificationPending: 1,
      cashMismatch: 0,
      pendingApprovalRequests: 2,
      pendingVerifications: 2,
      cashSessionDifferencesCount: 0,
      rateChangeRequests: 1,
      correctionRequests: 1,
      lowStockAlerts: 5,
      todayExpenses: 1200,
      gstInvoicesPendingCount: 3,
      gstInvoicesPendingAmount: 18000,
      newCustomersToday: 2,
      outstandingCustomersCount: 15,
      inactiveCustomersCount: 8,
      topCustomers: [],
    };

    expect(data.todaySales).toBe(15000);
    expect(data.salesCount).toBe(12);
    expect(data.date).toBe("2026-08-01");
  });

  it("validates exact StaffDashboardData response structure", () => {
    const staffData: StaffDashboardData = {
      date: "2026-08-01",
      salesCount: 5,
      salesTotal: 8500,
      walkinSalesCount: 2,
      walkinSalesTotal: 3000,
      dmsCreated: 1,
      dmTotal: 1200,
      cashCollected: 5000,
      upiRecorded: 3500,
      chequesReceived: 0,
      ordersPacked: 3,
      ordersDispatched: 2,
      stockEntries: 4,
      dayCloseStatus: "NOT_OPENED",
    };

    expect(staffData.salesTotal).toBe(8500);
    expect(staffData.dayCloseStatus).toBe("NOT_OPENED");
  });
});
