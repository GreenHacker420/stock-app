import { fromMinorUnits, getSettlementCreditMinor, getSettlementPaidMinor } from "./sale-calculations";
import type { SaleDraft } from "./sale.types";

export function buildSalePayload(draft: SaleDraft) {
  const customerId = draft.customer.kind === "EXISTING" ? draft.customer.customer.id : undefined;
  const customerInfo = draft.customer.kind === "QUICK_WALK_IN"
    ? { name: draft.customer.name, phone: draft.customer.phone }
    : undefined;
  const settlement = draft.settlement;
  const paymentMode = settlement.kind === "FULL_PAYMENT"
    ? settlement.mode
    : settlement.kind === "PARTIAL_CREDIT"
      ? settlement.upfrontMode
      : settlement.kind === "WALK_IN_UPI"
        ? "UPI"
        : undefined;
  const paidMinor = getSettlementPaidMinor(settlement);
  return {
    shopId: draft.shopId,
    customerId,
    customerInfo,
    isWalkin: draft.mode === "WALK_IN" && !customerId,
    items: Object.values(draft.lines).map((line) => ({
      itemId: line.item.id,
      quantity: line.quantity,
      rate: fromMinorUnits(line.rateMinor),
      serialNumbers: line.serialNumbers,
    })),
    payments: paymentMode && paidMinor > 0 ? [{ paymentMode, amount: fromMinorUnits(paidMinor) }] : undefined,
    notes: draft.notes || undefined,
    gstRequired: draft.gstRequired,
    customerSignature: draft.creditAuthorization?.signatureBase64,
    creditAmount: fromMinorUnits(getSettlementCreditMinor(settlement)),
  };
}

