import { calculateSaleTotalMinor, getSettlementCreditMinor } from "./sale-calculations";
import { createSaleFingerprint } from "./sale-fingerprint";
import type { SaleDraft, SalePolicy } from "./sale.types";

export type SaleValidation = {
  isValid: boolean;
  errors: Partial<Record<"shop" | "customer" | "cart" | "stock" | "price" | "serialNumbers" | "payment" | "signature" | "upi", string>>;
};

export function validateSaleDraft(draft: SaleDraft, policy: SalePolicy): SaleValidation {
  const errors: SaleValidation["errors"] = {};
  const lines = Object.values(draft.lines);
  const totalMinor = calculateSaleTotalMinor(draft.lines);
  if (!draft.shopId) errors.shop = "A shop is required.";
  if (policy.customerRequired && draft.customer.kind !== "EXISTING") errors.customer = "Select a customer.";
  if (!lines.length) errors.cart = "Add at least one product.";
  if (lines.some((line) => line.quantity > line.item.availableStock)) errors.stock = "A product exceeds available stock.";
  if (lines.some((line) => line.rateMinor <= 0)) errors.price = "Every product needs a valid price.";
  if (lines.some((line) => line.item.requiresSerialNumber && line.serialNumbers.length !== line.quantity)) {
    errors.serialNumbers = "Scan every required serial number.";
  }
  if (draft.settlement.kind === "UNSETTLED") errors.payment = "Choose a payment settlement.";
  if (draft.mode === "WALK_IN" && draft.settlement.kind === "WALK_IN_UPI" && draft.settlement.confirmedFingerprint !== createSaleFingerprint(draft)) {
    errors.upi = "Confirm that the current UPI amount was received.";
  }
  if (draft.mode === "WALK_IN" && draft.settlement.kind !== "UNSETTLED" && draft.settlement.paidMinor !== totalMinor) {
    errors.payment = "Walk-in sales require full immediate settlement.";
  }
  const creditMinor = getSettlementCreditMinor(draft.settlement);
  if (creditMinor > 0 && policy.requireSignatureForCredit) {
    if (!draft.creditAuthorization || draft.creditAuthorization.transactionFingerprint !== createSaleFingerprint(draft)) {
      errors.signature = "Capture a signature for the current credit terms.";
    }
  }
  return { isValid: Object.keys(errors).length === 0, errors };
}

export const hasSaleShopChanged = (draft: SaleDraft, activeShopId: string | null | undefined) =>
  !activeShopId || draft.shopId !== activeShopId;

