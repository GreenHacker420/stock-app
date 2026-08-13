import { describe, expect, test } from "vitest";
import {
  getActionableFeatures,
  getEnabledFeatures,
  getFeature,
  isShortcutRegistrable,
} from "../../../lib/features/feature-availability";

describe("FEATURE_REGISTRY feature availability", () => {
  test("recovered transaction writes are enabled", () => {
    const enabled = getEnabledFeatures();
    expect(enabled.map((feature) => feature.id)).toEqual([
      "SALE_CREATE",
      "ORDER_CREATE",
      "DM_CREATE",
      "PAYMENT_CREATE",
    ]);
  });

  test("remaining recovery features stay disabled until their workflows land", () => {
    const disabledIds: Array<"STOCK_ENTRY" | "STOCK_TRANSFER"> = [
      "STOCK_ENTRY",
      "STOCK_TRANSFER",
    ];

    for (const id of disabledIds) {
      const feature = getFeature(id);
      expect(feature.status).toBe("DISABLED");
      expect(feature.disabledReason).toBeDefined();
      expect(isShortcutRegistrable(feature)).toBe(false);
    }
  });

  test("UNSUPPORTED features do not register shortcuts or appear in quick actions", () => {
    const feature = getFeature("PHYSICAL_STOCK");
    expect(feature.status).toBe("UNSUPPORTED");
    expect(isShortcutRegistrable(feature)).toBe(false);
    expect(getActionableFeatures().find((item) => item.id === "PHYSICAL_STOCK")).toBeUndefined();
  });

  test("enabled transaction shortcuts are registrable", () => {
    expect(getFeature("SALE_CREATE").shortcut).toBe("f8");
    expect(getFeature("ORDER_CREATE").shortcut).toBe("ctrl+f8");
    expect(getFeature("DM_CREATE").shortcut).toBe("alt+f8");
    expect(getFeature("PAYMENT_CREATE").shortcut).toBe("f6");

    for (const id of ["SALE_CREATE", "ORDER_CREATE", "DM_CREATE", "PAYMENT_CREATE"] as const) {
      expect(isShortcutRegistrable(getFeature(id))).toBe(true);
    }
  });
});
