import { useState, useCallback } from "react";
import type { SaleLineFormValue } from "../lib/sale-types";
import { getTodayIST } from "../lib/sale-money";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for SSR
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface NewSaleDraftState {
  idempotencyKey: string;
  cycleKey: () => void;
}

export function useNewSaleDraft(): NewSaleDraftState {
  const [idempotencyKey, setIdempotencyKey] = useState<string>(generateUUID);

  const cycleKey = useCallback(() => {
    setIdempotencyKey(generateUUID());
  }, []);

  return { idempotencyKey, cycleKey };
}


export function createEmptyLine(overrides?: Partial<SaleLineFormValue>): SaleLineFormValue {
  return {
    _lineId: generateUUID(),
    itemId: "",
    itemName: "",
    sku: "",
    unit: "",
    availableStock: null,
    requiresSerialNumber: false,
    defaultSellingPrice: 0,
    minimumAllowedPrice: null,
    quantity: 1,
    rate: 0,
    discountAmount: 0,
    serialNumbers: [],
    description: "",
    ...overrides,
  };
}

export { getTodayIST };
