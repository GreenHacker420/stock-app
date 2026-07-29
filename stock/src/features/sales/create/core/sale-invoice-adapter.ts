import { calculateSaleTotalMinor, fromMinorUnits, getSettlementCreditMinor, getSettlementPaidMinor } from "./sale-calculations";
import type { SaleDraft } from "./sale.types";

export function adaptSaleToInvoice(draft: SaleDraft, serverSale?: any) {
  const totalMinor = calculateSaleTotalMinor(draft.lines);
  const draftLines = Object.values(draft.lines);
  const serverItems = Array.isArray(serverSale?.items) ? serverSale.items : [];
  const items = (serverItems.length ? serverItems : draftLines).map((serverItem: any) => {
    const itemId = serverItem.itemId ?? serverItem.item?.id;
    const draftLine = draft.lines[itemId] ?? (serverItem.item ? undefined : serverItem);
    if (!draftLine && serverItem.item) return serverItem;
    const line = draftLine ?? serverItem;
    return {
      ...serverItem,
      itemId: itemId ?? line.item.id,
      quantity: String(serverItem.quantity ?? line.quantity),
      rate: String(serverItem.rate ?? fromMinorUnits(line.rateMinor)),
      totalAmount: String(serverItem.totalAmount ?? fromMinorUnits(line.quantity * line.rateMinor)),
      serialNumbers: serverItem.serialNumbers ?? line.serialNumbers,
      item: serverItem.item ?? line.item,
    };
  });

  return {
    ...serverSale,
    saleNumber: serverSale?.saleNumber ?? "N/A",
    totalAmount: String(fromMinorUnits(totalMinor)),
    paidAmount: String(fromMinorUnits(getSettlementPaidMinor(draft.settlement))),
    balanceAmount: String(fromMinorUnits(getSettlementCreditMinor(draft.settlement))),
    isWalkin: draft.mode === "WALK_IN" && draft.customer.kind !== "EXISTING",
    saleDate: serverSale?.saleDate ?? `${draft.saleDate}T12:00:00.000Z`,
    createdAt: serverSale?.createdAt ?? new Date().toISOString(),
    customer: serverSale?.customer ?? (draft.customer.kind === "EXISTING" ? draft.customer.customer : undefined),
    staff: serverSale?.staff,
    customerSignature: draft.creditAuthorization?.signatureBase64,
    items,
    notes: draft.notes || null,
  };
}
