import { calculateSaleTotalMinor, getSettlementCreditMinor, getSettlementPaidMinor } from "./sale-calculations";
import type { SaleDraft } from "./sale.types";

const stableHash = (input: string) => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};


export function createSaleFingerprint(draft: SaleDraft): string {
  const customerId =
    draft.customer.kind === "EXISTING"
      ? draft.customer.customer.id
      : draft.customer.kind;

  const lines = Object.values(draft.lines)
    .sort((left, right) => left.item.id.localeCompare(right.item.id))
    .map((line) => [line.item.id, line.quantity, line.rateMinor, [...line.serialNumbers].sort()]);


  const paymentDestination =
    draft.settlement.kind === "WALK_IN_UPI" ? draft.settlement.upiId : null;

  const payload = JSON.stringify({
    shopId: draft.shopId,
    customerId,
    lines,
    totalMinor: calculateSaleTotalMinor(draft.lines),
    paidMinor: getSettlementPaidMinor(draft.settlement),
    creditMinor: getSettlementCreditMinor(draft.settlement),
    paymentDestination,
  });

  return stableHash(payload);
}
