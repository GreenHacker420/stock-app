import { describe, test, expect } from "vitest";
import {
  computeLineTotal,
  computeSaleTotals,
  computeTotalPayments,
  computeBalance,
  formatINR,
  getTodayIST,
  isDateNotFuture,
} from "../lib/sale-money";
import type { SaleLineFormValue, SalePaymentFormValue } from "../lib/sale-types";

describe("sale-money utilities", () => {
  test("computeLineTotal — accurate paise arithmetic", () => {
    // 10 units @ 100.50, discount 5.25 => (10 * 100.50) - 5.25 = 1005 - 5.25 = 999.75
    const total = computeLineTotal({
      rate: 100.5,
      quantity: 10,
      discountAmount: 5.25,
    });
    expect(total).toBe(999.75);
  });

  test("computeLineTotal — zero when discount exceeds gross", () => {
    const total = computeLineTotal({
      rate: 10,
      quantity: 1,
      discountAmount: 15,
    });
    expect(total).toBe(0);
  });

  test("computeSaleTotals — aggregates multiple lines without float drift", () => {
    const lines: SaleLineFormValue[] = [
      {
        _lineId: "1",
        itemId: "item-1",
        itemName: "Item A",
        sku: "",
        unit: "Pcs",
        availableStock: 10,
        requiresSerialNumber: false,
        defaultSellingPrice: 100,
        minimumAllowedPrice: null,
        quantity: 2,
        rate: 100.33,
        discountAmount: 0.66,
        serialNumbers: [],
        description: "",
      },
      {
        _lineId: "2",
        itemId: "item-2",
        itemName: "Item B",
        sku: "",
        unit: "Kg",
        availableStock: 5,
        requiresSerialNumber: false,
        defaultSellingPrice: 50,
        minimumAllowedPrice: null,
        quantity: 3,
        rate: 50.1,
        discountAmount: 0.3,
        serialNumbers: [],
        description: "",
      },
    ];

    // Line 1: (2 * 100.33) - 0.66 = 200.66 - 0.66 = 200.00
    // Line 2: (3 * 50.10) - 0.30 = 150.30 - 0.30 = 150.00
    // Total = 350.00
    const result = computeSaleTotals(lines);
    expect(result.subtotal).toBe(350);
    expect(result.totalAmount).toBe(350);
    expect(result.lineTotals).toEqual([200, 150]);
  });

  test("computeTotalPayments and computeBalance", () => {
    const payments: SalePaymentFormValue[] = [
      {
        _paymentId: "p1",
        paymentMode: "CASH",
        amount: 200,
        paymentDate: "2026-08-01",
        referenceNumber: "",
        notes: "",
      },
      {
        _paymentId: "p2",
        paymentMode: "UPI",
        amount: 150,
        paymentDate: "2026-08-01",
        referenceNumber: "UTR123",
        notes: "",
      },
    ];

    const totalPay = computeTotalPayments(payments);
    expect(totalPay).toBe(350);

    expect(computeBalance(350, 350)).toBe(0);
    expect(computeBalance(400, 350)).toBe(50);
    expect(computeBalance(300, 350)).toBe(-50); // overpaid
  });

  test("formatINR — Indian formatting", () => {
    expect(formatINR(125750.5)).toContain("1,25,750.50");
    expect(formatINR(0)).toContain("0.00");
    expect(formatINR(null)).toContain("0.00");
  });

  test("getTodayIST & isDateNotFuture", () => {
    const today = getTodayIST();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isDateNotFuture(today)).toBe(true);
    expect(isDateNotFuture("2099-12-31")).toBe(false);
  });
});
