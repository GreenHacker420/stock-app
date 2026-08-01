import { describe, test, expect } from "vitest";
import { buildSalePayload } from "../lib/sale-payload";
import type { SaleFormSchema } from "../lib/sale-schema";
import { getTodayIST } from "../lib/sale-money";

describe("buildSalePayload mapper", () => {
  test("maps existing customer form correctly", () => {
    const form: SaleFormSchema = {
      shopId: "shop-123",
      customerMode: "existing",
      customerId: "cust-456",
      customerName: "Acme Store",
      customerPhone: "9876543210",
      customerEmail: "",
      isWalkin: false,
      saleDate: getTodayIST(),
      gstRequired: true,
      notes: "Deliver by 5 PM",
      lines: [
        {
          _lineId: "l1",
          itemId: "item-1",
          itemName: "Widget A",
          sku: "W1",
          unit: "Pcs",
          availableStock: 10,
          requiresSerialNumber: false,
          defaultSellingPrice: 100,
          minimumAllowedPrice: null,
          quantity: 2,
          rate: 100,
          discountAmount: 10,
          serialNumbers: [],
          description: "Red color",
        },
      ],
      payments: [
        {
          _paymentId: "p1",
          paymentMode: "UPI",
          amount: 190,
          paymentDate: getTodayIST(),
          referenceNumber: "UPI-999",
          notes: "",
        },
      ],
    };

    const payload = buildSalePayload(form);

    expect(payload.shopId).toBe("shop-123");
    expect(payload.customerId).toBe("cust-456");
    expect(payload.isWalkin).toBeUndefined();
    expect(payload.gstRequired).toBe(true);
    expect(payload.notes).toBe("Deliver by 5 PM");

    const item = payload.items[0];
    expect(item).toEqual({
      itemId: "item-1",
      quantity: 2,
      rate: 100,
      discountAmount: 10,
      serialNumbers: undefined,
      description: "Red color",
    });

    const payment = payload.payments?.[0];
    expect(payment).toEqual({
      paymentMode: "UPI",
      amount: 190,
      paymentDate: getTodayIST(),
      referenceNumber: "UPI-999",
      notes: undefined,
    });
  });

  test("maps walkin customer form correctly", () => {
    const form: SaleFormSchema = {
      shopId: "shop-123",
      customerMode: "walkin",
      customerId: "",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      isWalkin: true,
      saleDate: getTodayIST(),
      gstRequired: false,
      notes: "",
      lines: [
        {
          _lineId: "l1",
          itemId: "item-1",
          itemName: "Widget",
          sku: "",
          unit: "",
          availableStock: 5,
          requiresSerialNumber: false,
          defaultSellingPrice: 50,
          minimumAllowedPrice: null,
          quantity: 1,
          rate: 50,
          discountAmount: 0,
          serialNumbers: [],
          description: "",
        },
      ],
      payments: [
        {
          _paymentId: "p1",
          paymentMode: "CASH",
          amount: 50,
          paymentDate: getTodayIST(),
          referenceNumber: "",
          notes: "",
        },
      ],
    };

    const payload = buildSalePayload(form);
    expect(payload.isWalkin).toBe(true);
    expect(payload.customerId).toBeUndefined();
  });
});
