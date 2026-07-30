import { useMemo, useReducer } from "react";
import { calculateSaleTotalMinor } from "./sale-calculations";
import { createInitialSaleDraft, saleDraftReducer } from "./sale-draft.reducer";
import { validateSaleDraft } from "./sale-validation";
import { regularSalePolicy, walkInSalePolicy } from "./sale.types";
import type { SaleMode } from "./sale.types";

export interface UseSaleDraftOptions {
  mode: SaleMode;
  shopId: string;
  initialDraft?: import("./sale.types").SaleDraft | null;
}

export function useSaleDraft({ mode, shopId, initialDraft }: UseSaleDraftOptions) {
  const [draft, dispatch] = useReducer(
    saleDraftReducer,
    undefined,
    () => initialDraft?.mode === mode && initialDraft.shopId === shopId
      ? initialDraft
      : createInitialSaleDraft(mode, shopId),
  );
  const policy = useMemo(() => (mode === "WALK_IN" ? walkInSalePolicy : regularSalePolicy), [mode]);
  const totalMinor = useMemo(() => calculateSaleTotalMinor(draft.lines), [draft.lines]);
  const validation = useMemo(() => validateSaleDraft(draft, policy), [draft, policy]);
  return { draft, dispatch, totalMinor, validation, policy };
}
