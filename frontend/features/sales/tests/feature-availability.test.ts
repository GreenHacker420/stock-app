import { describe, test, expect } from "vitest";
import {
  getActionableFeatures,
  getEnabledFeatures,
  getFeature,
  isShortcutRegistrable,
} from "../../../lib/features/feature-availability";

describe("FEATURE_REGISTRY feature availability", () => {
  test("SALE_CREATE is the ONLY enabled write feature in Sprint 1", () => {
    const enabled = getEnabledFeatures();
    expect(enabled.map((f) => f.id)).toEqual(["SALE_CREATE"]);
  });

  test("disabled features are properly configured", () => {
    const disabledIds: Array<"ORDER_CREATE" | "DM_CREATE" | "PAYMENT_CREATE" | "STOCK_ENTRY" | "STOCK_TRANSFER"> = [
      "ORDER_CREATE",
      "DM_CREATE",
      "PAYMENT_CREATE",
      "STOCK_ENTRY",
      "STOCK_TRANSFER",
    ];
    for (const id of disabledIds) {
      const feat = getFeature(id);
      expect(feat.status).toBe("DISABLED");
      expect(feat.disabledReason).toBeDefined();
      expect(isShortcutRegistrable(feat)).toBe(false);
    }
  });

  test("UNSUPPORTED features do not register shortcuts or appear in quick actions", () => {
    const feat = getFeature("PHYSICAL_STOCK");
    expect(feat.status).toBe("UNSUPPORTED");
    expect(isShortcutRegistrable(feat)).toBe(false);
    expect(getActionableFeatures().find((f) => f.id === "PHYSICAL_STOCK")).toBeUndefined();
  });

  test("SALE_CREATE shortcut is registrable", () => {
    const sale = getFeature("SALE_CREATE");
    expect(sale.status).toBe("ENABLED");
    expect(sale.shortcut).toBe("f8");
    expect(isShortcutRegistrable(sale)).toBe(true);
  });
});
