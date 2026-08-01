import { useQuery } from "@tanstack/react-query";
import { searchCustomersApi, searchItemsApi, getItemStockApi, getRateSuggestionApi } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/query-keys";

// ─── Customer search ────────────────────────────────────────────────────────

interface UseCustomerSearchOptions {
  token: string | null;
  shopId: string | null;
  search: string;
  enabled?: boolean;
}

export function useCustomerSearchQuery({ token, shopId, search, enabled = true }: UseCustomerSearchOptions) {
  return useQuery({
    queryKey: queryKeys.customers.list(shopId ?? "", search),
    queryFn: () =>
      searchCustomersApi(token!, {
        shopId: shopId!,
        search: search.trim() || undefined,
        includeWalkin: false,
        limit: 20,
      }),
    enabled: enabled && !!token && !!shopId,
    staleTime: 30_000,     // customer list — 30s
    gcTime: 120_000,
    retry: 1,
  });
}

// ─── Item search ─────────────────────────────────────────────────────────────

interface UseItemSearchOptions {
  token: string | null;
  shopId: string | null;
  search: string;
  enabled?: boolean;
}

export function useItemSearchQuery({ token, shopId, search, enabled = true }: UseItemSearchOptions) {
  return useQuery({
    queryKey: queryKeys.items.list(shopId ?? "", { search }),
    queryFn: () =>
      searchItemsApi(token!, {
        shopId: shopId!,
        search: search.trim() || undefined,
        limit: 25,
      }),
    enabled: enabled && !!token && !!shopId,
    staleTime: 60_000,     // item list — 1min
    gcTime: 300_000,
    retry: 1,
  });
}

// ─── Item stock ──────────────────────────────────────────────────────────────

interface UseItemStockOptions {
  token: string | null;
  itemId: string | null;
  enabled?: boolean;
}

export function useItemStockQuery({ token, itemId, enabled = true }: UseItemStockOptions) {
  return useQuery({
    queryKey: queryKeys.items.stock(itemId ?? ""),
    queryFn: () => getItemStockApi(token!, itemId!),
    enabled: enabled && !!token && !!itemId,
    staleTime: 15_000,     // stock — 15s (fast moving)
    gcTime: 60_000,
    retry: 1,
  });
}

// ─── Rate suggestion ─────────────────────────────────────────────────────────

interface UseRateSuggestionOptions {
  token: string | null;
  itemId: string | null;
  customerId: string | null;
  enabled?: boolean;
}

export function useRateSuggestionQuery({ token, itemId, customerId, enabled = true }: UseRateSuggestionOptions) {
  return useQuery({
    queryKey: queryKeys.items.rateSuggestion(itemId ?? "", customerId ?? ""),
    queryFn: () => getRateSuggestionApi(token!, itemId!, customerId!),
    enabled: enabled && !!token && !!itemId && !!customerId,
    staleTime: 120_000,    // rate suggestion — 2min
    gcTime: 300_000,
    retry: 1,
  });
}
