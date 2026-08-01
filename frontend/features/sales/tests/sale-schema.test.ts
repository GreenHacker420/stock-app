import { describe, test, expect } from "vitest";
import { saleFormSchema } from "../lib/sale-schema";
import { getTodayIST } from "../lib/sale-money";

describe("saleFormSchema validation", () => {
  const validLine = {
    _lineId: "line-1",
    itemId: "item-123",
    itemName: "Widget A",
    sku: "WID-123",
    unit: "Pcs",
    availableStock: 50,
    requiresSerialNumber: false,
    defaultSellingPrice: 100,
    minimumAllowedPrice: 80,
    quantity: 2,
    rate: 100,
    discountAmount: 0,
    serialNumbers: [],
    description: "",
  };

  test("valid sale form passes validation", () => {
    const validData = {
      shopId: "shop-1",
      customerMode: "existing",
      customerId: "cust-1",
      customerName: "Acme Corp",
      customerPhone: "9876543210",
      customerEmail: "",
      isWalkin: false,
      saleDate: getTodayIST(),
      gstRequired: false,
      notes: "",
      lines: [validLine],
      payments: [],
    };

    const result = saleFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("requires customerId when customerMode is existing", () => {
    const invalidData = {
      shopId: "shop-1",
      customerMode: "existing",
      customerId: "", // missing
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      isWalkin: false,
      saleDate: getTodayIST(),
      gstRequired: false,
      notes: "",
      lines: [validLine],
      payments: [],
    };

    const result = saleFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("customerId"));
      expect(issue).toBeDefined();
    }
  });

  test("walkin mode requires full payment", () => {
    const invalidWalkin = {
      shopId: "shop-1",
      customerMode: "walkin",
      customerId: "",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      isWalkin: true,
      saleDate: getTodayIST(),
      gstRequired: false,
      notes: "",
      lines: [validLine], // total = 200
      payments: [],       // no payments -> unpaid
    };

    const result = saleFormSchema.safeParse(invalidWalkin);
    expect(result.success).toBe(false);

    // Now add full payment -> should pass
    const validWalkin = {
      ...invalidWalkin,
      payments: [
        {
          _paymentId: "p1",
          paymentMode: "CASH" as const,
          amount: 200,
          paymentDate: getTodayIST(),
          referenceNumber: "",
          notes: "",
        },
      ],
    };
    const validResult = saleFormSchema.safeParse(validWalkin);
    expect(validResult.success).toBe(true);
  });

  test("serial number requirement — exact count required", () => {
    const serialLine = {
      ...validLine,
      requiresSerialNumber: true,
      quantity: 2,
      serialNumbers: ["SN001"], // only 1 serial provided for 2 qty
    };

    const data = {
      shopId: "shop-1",
      customerMode: "existing",
      customerId: "cust-1",
      customerName: "Acme",
      customerPhone: "",
      customerEmail: "",
      isWalkin: false,
      saleDate: getTodayIST(),
      gstRequired: false,
      notes: "",
      lines: [serialLine],
      payments: [],
    };

    const result = saleFormSchema.safeParse(data);
    expect(result.success).toBe(false);

    // Provide 2 distinct serials -> pass
    const validSerialData = {
      ...data,
      lines: [{ ...serialLine, serialNumbers: ["SN001", "SN002"] }],
    };
    const validResult = saleFormSchema.safeParse(validSerialData);
    expect(validResult.success).toBe(true);
  });

  test("rejects future sale date", () => {
    const futureData = {
      shopId: "shop-1",
      customerMode: "existing",
      customerId: "cust-1",
      customerName: "Acme",
      customerPhone: "",
      customerEmail: "",
      isWalkin: false,
      saleDate: "2099-12-31", // future
      gstRequired: false,
      notes: "",
      lines: [validLine],
      payments: [],
    };

    const result = saleFormSchema.safeParse(futureData);
    expect(result.success).toBe(false);
  });
});
