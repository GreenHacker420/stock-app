import { describe, expect, test } from "vitest";
import {
  getActionableFeatures,
  getEnabledFeatures,
  getFeature,
  isShortcutRegistrable,
} from "../../../lib/features/feature-availability";

describe("FEATURE_REGISTRY feature availability", () => {
  test("recovered write workflows are enabled", () => {
    const enabled = getEnabledFeatures();
    expect(enabled.map((feature) => feature.id)).toEqual([
      "SALE_CREATE",
      "ORDER_CREATE",
      "DM_CREATE",
      "PAYMENT_CREATE",
      "STOCK_ENTRY",
      "STOCK_TRANSFER",
      "PHYSICAL_STOCK",
    ]);
  });

  test("physical stock is actionable and uses the central keyboard registry", () => {
    const feature = getFeature("PHYSICAL_STOCK");
    expect(feature.status).toBe("ENABLED");
    expect(feature.shortcut).toBe("ctrl+f7");
    expect(isShortcutRegistrable(feature)).toBe(true);
    expect(getActionableFeatures().find((item) => item.id === "PHYSICAL_STOCK")).toBe(feature);
  });

  test("enabled write shortcuts are registrable", () => {
    expect(getFeature("SALE_CREATE").shortcut).toBe("f8");
    expect(getFeature("ORDER_CREATE").shortcut).toBe("ctrl+f8");
    expect(getFeature("DM_CREATE").shortcut).toBe("alt+f8");
    expect(getFeature("PAYMENT_CREATE").shortcut).toBe("f6");
    expect(getFeature("STOCK_ENTRY").shortcut).toBe("f9");
    expect(getFeature("STOCK_TRANSFER").shortcut).toBe("alt+f9");
    expect(getFeature("PHYSICAL_STOCK").shortcut).toBe("ctrl+f7");

    for (const id of [
      "SALE_CREATE",
      "ORDER_CREATE",
      "DM_CREATE",
      "PAYMENT_CREATE",
      "STOCK_ENTRY",
      "STOCK_TRANSFER",
      "PHYSICAL_STOCK",
    ] as const) {
      expect(isShortcutRegistrable(getFeature(id))).toBe(true);
    }
  });
});
