import { calculateSaleTotalMinor, fromMinorUnits, getSettlementCreditMinor, getSettlementPaidMinor } from "./sale-calculations";
import type { SaleDraft } from "./sale.types";

export function adaptSaleToInvoice(draft: SaleDraft, serverSale?: any) {
  if (serverSale?.items?.length) return serverSale;
  const totalMinor = calculateSaleTotalMinor(draft.lines);
  return {
    ...serverSale,
    saleNumber: serverSale?.saleNumber ?? "N/A",
    totalAmount: String(fromMinorUnits(totalMinor)),
    paidAmount: String(fromMinorUnits(getSettlementPaidMinor(draft.settlement))),
    balanceAmount: String(fromMinorUnits(getSettlementCreditMinor(draft.settlement))),
    isWalkin: draft.mode === "WALK_IN" && draft.customer.kind !== "EXISTING",
    createdAt: serverSale?.createdAt ?? new Date().toISOString(),
    customer: draft.customer.kind === "EXISTING" ? draft.customer.customer : undefined,
    customerSignature: draft.creditAuthorization?.signatureBase64,
    items: Object.values(draft.lines).map((line) => ({
      itemId: line.item.id,
      quantity: String(line.quantity),
      rate: String(fromMinorUnits(line.rateMinor)),
      totalAmount: String(fromMinorUnits(line.quantity * line.rateMinor)),
      item: line.item,
    })),
    notes: draft.notes || null,
  };
}

