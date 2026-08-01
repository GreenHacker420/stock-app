import { describe, it, expect } from "vitest";
import { queryKeys } from "../../lib/query/query-keys";

describe("Query Keys Factory", () => {
  it("includes shopId in shop-specific dashboard query keys", () => {
    const ownerKey = queryKeys.dashboard.owner("shop-123", "2026-08-01");
    expect(ownerKey).toEqual(["dashboard", "owner", "shop-123", "2026-08-01"]);

    const staffKey = queryKeys.dashboard.staff("shop-456", "2026-08-01");
    expect(staffKey).toEqual(["dashboard", "staff", "shop-456", "2026-08-01"]);
  });

  it("includes shopId in whatsapp capability query keys", () => {
    const key = queryKeys.whatsapp.capability("shop-789");
    expect(key).toEqual(["whatsapp", "capability", "shop-789"]);
  });
});
