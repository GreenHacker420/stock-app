import { money } from "./money.js";
import { ApiError } from "./ApiError.js"; // Wait, is ApiError under utils? Let's check. Yes, utils/ApiError.js exists.

export function assertMoney(value) {
  if (value === undefined || value === null) return;
  const normalized = money(value);
  
  if (!normalized.eq(value)) {
    throw new ApiError(400, `Money precision violation: ${value}`);
  }
}
