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
