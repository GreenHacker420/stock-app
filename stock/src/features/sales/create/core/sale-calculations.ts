import type { SaleDraft, SaleLine, SettlementDraft } from "./sale.types";

export const toMinorUnits = (value: number | string | null | undefined) => {
  const parsed = typeof value === "string" ? Number(value.trim()) : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export const fromMinorUnits = (value: number) => value / 100;

export const clampLineQuantity = (quantity: number, availableStock: number) =>
  Math.min(Math.max(0, Math.floor(availableStock)), Math.max(0, Math.floor(quantity)));

export const calculateLineTotalMinor = (line: SaleLine) => line.quantity * line.rateMinor;

export const calculateSaleTotalMinor = (lines: SaleDraft["lines"]) =>
  Object.values(lines).reduce((total, line) => total + calculateLineTotalMinor(line), 0);

export function createRegularSettlement(
  mode: "CASH" | "UPI" | "BANK_TRANSFER" | "CREDIT",
  totalMinor: number,
  paidMinor: number,
  upfrontMode: "CASH" | "UPI" | "BANK_TRANSFER" = "CASH",
): SettlementDraft {
  const safePaid = Math.max(0, Math.round(paidMinor));
  if (mode === "CREDIT") {
    if (safePaid <= 0) return { kind: "FULL_CREDIT", paidMinor: 0, creditMinor: totalMinor };
    if (safePaid < totalMinor) {
      return { kind: "PARTIAL_CREDIT", upfrontMode, paidMinor: safePaid, creditMinor: totalMinor - safePaid };
    }
    return { kind: "FULL_PAYMENT", mode: upfrontMode, paidMinor: totalMinor, changeMinor: 0 };
  }

  return {
    kind: "FULL_PAYMENT",
    mode,
    paidMinor: safePaid,
    changeMinor: Math.max(0, safePaid - totalMinor),
  };
}

export const getSettlementPaidMinor = (settlement: SettlementDraft) =>
  settlement.kind === "UNSETTLED" ? 0 : settlement.paidMinor;

export const getSettlementCreditMinor = (settlement: SettlementDraft) =>
  settlement.kind === "FULL_CREDIT" || settlement.kind === "PARTIAL_CREDIT"
    ? settlement.creditMinor
    : 0;

