import { describe, it, expect, vi } from "vitest";
import { ApiError, setUnauthorizedHandler } from "../../lib/api/client";

describe("API Client Errors & Authorization Handlers", () => {
  it("creates ApiError instances with correct status and payload data", () => {
    const err = new ApiError("Forbidden access", 403, { code: "FORBIDDEN" });
    expect(err.message).toBe("Forbidden access");
    expect(err.status).toBe(403);
    expect(err.data).toEqual({ code: "FORBIDDEN" });
  });

  it("registers and accepts unauthorized 401 callback handler", () => {
    const callback = vi.fn();
    setUnauthorizedHandler(callback);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("searchItemsApi Response Unwrapping", () => {
  it("unwraps items array from paginated response payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          items: [{ id: "item-1", name: "Test Product", defaultSellingPrice: 100 }],
          total: 1,
          page: 1,
          limit: 25,
          hasMore: false,
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { searchItemsApi } = await import("../../lib/api/client");
    const result = await searchItemsApi("token-123", { shopId: "shop-1", search: "Test" });

    expect(result).toEqual([{ id: "item-1", name: "Test Product", defaultSellingPrice: 100 }]);
    vi.unstubAllGlobals();
  });
});
