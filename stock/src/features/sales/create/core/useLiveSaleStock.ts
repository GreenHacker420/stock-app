import { useCallback, useEffect, useRef } from "react";
import { useCurrentStockQuery } from "@/hooks/useItems";
import {
  buildAvailableStockMap,
  findStockShortages,
  type StockShortage,
} from "./sale-stock";
import type { SaleDraftAction } from "./sale-draft.reducer";
import type { SaleDraft } from "./sale.types";

type LiveSaleStockOptions = {
  draft: SaleDraft;
  dispatch: React.Dispatch<SaleDraftAction>;
  enabled: boolean;
  onShortage: (shortages: StockShortage[]) => void;
};

export function useLiveSaleStock({
  draft,
  dispatch,
  enabled,
  onShortage,
}: LiveSaleStockOptions) {
  const stockQuery = useCurrentStockQuery(undefined, { enabled });
  const draftRef = useRef(draft);
  const shortageSignatureRef = useRef("");

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!stockQuery.data) return;
    const availability = buildAvailableStockMap(stockQuery.data);
    const currentDraft = draftRef.current;
    dispatch({ type: "SYNC_AVAILABLE_STOCK", availability });

    const shortages = findStockShortages(currentDraft.lines, availability);
    const signature = shortages
      .map((shortage) => `${shortage.itemId}:${shortage.requested}:${shortage.available}`)
      .sort()
      .join("|");
    if (signature && signature !== shortageSignatureRef.current) {
      onShortage(shortages);
    }
    shortageSignatureRef.current = signature;
  }, [dispatch, onShortage, stockQuery.data]);

  const verifyLatestStock = useCallback(async () => {
    const result = await stockQuery.refetch();
    if (result.error || !result.data) {
      return {
        verified: false as const,
        shortages: [] as StockShortage[],
      };
    }
    const availability = buildAvailableStockMap(result.data);
    const currentDraft = draftRef.current;
    dispatch({ type: "SYNC_AVAILABLE_STOCK", availability });
    const shortages = findStockShortages(currentDraft.lines, availability, true);
    return {
      verified: true as const,
      shortages,
    };
  }, [dispatch, stockQuery]);

  return {
    stockQuery,
    verifyLatestStock,
  };
}
