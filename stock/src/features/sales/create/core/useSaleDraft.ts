import { useMemo, useReducer } from "react";
import { calculateSaleTotalMinor } from "./sale-calculations";
import { createInitialSaleDraft, saleDraftReducer } from "./sale-draft.reducer";
import { validateSaleDraft } from "./sale-validation";
import type { SaleMode, SalePolicy } from "./sale.types";

export function useSaleDraft(mode: SaleMode, shopId: string, policy: SalePolicy) {
  const [draft, dispatch] = useReducer(saleDraftReducer, undefined, () => createInitialSaleDraft(mode, shopId));
  const totalMinor = useMemo(() => calculateSaleTotalMinor(draft.lines), [draft.lines]);
  const validation = useMemo(() => validateSaleDraft(draft, policy), [draft, policy]);
  return { draft, dispatch, totalMinor, validation };
}

