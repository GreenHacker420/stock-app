import type { ItemSnapshot, SaleDraft, SaleLine, SettlementDraft, SettlementResult } from "./sale.types";

// ── Strict money parsing ──────────────────────────────────────────────────────

export function parseMoneyToMinor(
  input: string | number | null | undefined,
): number | null {
  const text =
    typeof input === "number"
      ? String(input)
      : (input?.trim() ?? "");

  // Allow "0", "100", "99.99", "0.5" — reject blank, "1e3", "1.234", "-1"
  if (!/^\d+(?:\.\d{0,2})?$/.test(text)) return null;

  const [wholePart, decimalPart = ""] = text.split(".");
  const whole = Number(wholePart);
  const paise = Number(decimalPart.padEnd(2, "0"));

  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(paise)) return null;

  const minor = whole * 100 + paise;
  return Number.isSafeInteger(minor) ? minor : null;
}

export const moneyToMinorOrZero = (
  input: string | number | null | undefined,
): number => parseMoneyToMinor(input) ?? 0;

/**
 * @deprecated Use parseMoneyToMinor (strict, returns null) or
 * moneyToMinorOrZero (explicit zero-default).
 * This alias is kept for existing display-only call sites to avoid churn.
 */
export const toMinorUnits = moneyToMinorOrZero;

export const fromMinorUnits = (value: number) => value / 100;

// ── Quantity helpers ──────────────────────────────────────────────────────────


const safeInteger = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export const clampLineQuantity = (quantity: number, availableStock: number): number =>
  Math.min(safeInteger(quantity), safeInteger(availableStock));

// ── Line / total ──────────────────────────────────────────────────────────────

export const calculateLineTotalMinor = (line: SaleLine): number =>
  line.quantity * line.rateMinor;

export const calculateSaleTotalMinor = (lines: SaleDraft["lines"]): number =>
  Object.values(lines).reduce((total, line) => total + calculateLineTotalMinor(line), 0);

// ── Validated settlement builder ──────────────────────────────────────────────

export function createRegularSettlement(
  mode: "CASH" | "UPI" | "BANK_TRANSFER" | "CREDIT",
  totalMinor: number,
  paidMinor: number,
  upfrontMode: "CASH" | "UPI" | "BANK_TRANSFER" = "CASH",
): SettlementResult {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    return { ok: false, error: "INVALID_TOTAL" };
  }
  if (!Number.isSafeInteger(paidMinor) || paidMinor < 0) {
    return { ok: false, error: "INVALID_PAYMENT" };
  }

  if (mode === "CREDIT") {
    if (paidMinor > totalMinor) {
      return { ok: false, error: "CREDIT_PAYMENT_EXCEEDS_TOTAL" };
    }
    if (paidMinor === 0) {
      return { ok: true, settlement: { kind: "FULL_CREDIT", paidMinor: 0, creditMinor: totalMinor } };
    }
    if (paidMinor < totalMinor) {
      return {
        ok: true,
        settlement: {
          kind: "PARTIAL_CREDIT",
          upfrontMode,
          paidMinor,
          creditMinor: totalMinor - paidMinor,
        },
      };
    }
    // paid === total in credit mode → treat as full payment via the upfront mode
    return {
      ok: true,
      settlement: { kind: "FULL_PAYMENT", mode: upfrontMode, paidMinor: totalMinor, changeMinor: 0 },
    };
  }

  // Cash / UPI / Bank: customer must pay at least the full amount
  if (paidMinor < totalMinor) {
    return { ok: false, error: "INSUFFICIENT_PAYMENT" };
  }

  return {
    ok: true,
    settlement: {
      kind: "FULL_PAYMENT",
      mode,
      paidMinor,
      changeMinor: paidMinor - totalMinor,
    },
  };
}

export const getSettlementPaidMinor = (settlement: SettlementDraft): number =>
  settlement.kind === "UNSETTLED" ? 0 : settlement.paidMinor;

export const getSettlementCreditMinor = (settlement: SettlementDraft): number =>
  settlement.kind === "FULL_CREDIT" || settlement.kind === "PARTIAL_CREDIT"
    ? settlement.creditMinor
    : 0;

// ── Item snapshot adapter ─────────────────────────────────────────────────────

/** Structural type accepted by adaptItemToSnapshot. */
export type SnapshotItemInput = {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  availableStock?: number | string | null;
  defaultSellingPrice?: number | string | null;
  minimumAllowedPrice?: number | string | null;
  mrp?: number | string | null;
  requiresSerialNumber?: boolean | null;
  brand?: { name?: string | null } | null;
};


export function adaptItemToSnapshot(item: SnapshotItemInput): ItemSnapshot {
  if (!item.id || !item.name) {
    throw new Error("Cannot create sale item snapshot: id and name are required.");
  }

  const defaultRateMinor = parseMoneyToMinor(item.defaultSellingPrice);
  const minimumRateMinor =
    item.minimumAllowedPrice == null
      ? defaultRateMinor
      : parseMoneyToMinor(item.minimumAllowedPrice);

  if (defaultRateMinor === null || minimumRateMinor === null) {
    throw new Error(`Invalid selling price for item "${item.id}" (${item.name}).`);
  }

  const rawStock = Number(item.availableStock ?? 0);
  if (!Number.isFinite(rawStock)) {
    throw new Error(`Invalid stock quantity for item "${item.id}" (${item.name}).`);
  }

  return {
    id: item.id,
    name: item.name,
    sku: item.sku ?? undefined,
    unit: item.unit,
    availableStock: Math.max(0, Math.floor(rawStock)),
    defaultRateMinor,
    minimumRateMinor,
    mrpMinor: parseMoneyToMinor(item.mrp) ?? undefined,
    requiresSerialNumber: Boolean(item.requiresSerialNumber),
    brandName: item.brand?.name ?? null,
  };
}
