import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
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
        limit: 50,
      }),
    enabled: enabled && !!token && !!shopId,
    staleTime: 30_000,     // customer list — 30s
    gcTime: 120_000,
    retry: 1,
  });
}

export function useInfiniteCustomerSearchQuery({ token, shopId, search, enabled = true }: UseCustomerSearchOptions) {
  return useInfiniteQuery({
    queryKey: queryKeys.customers.list(shopId ?? "", `${search}:infinite`),
    queryFn: ({ pageParam = 1 }) =>
      searchCustomersApi(token!, {
        shopId: shopId!,
        search: search.trim() || undefined,
        includeWalkin: false,
        page: pageParam as number,
        limit: 50,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < 50) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
    enabled: enabled && !!token && !!shopId,
    staleTime: 30_000,
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
        limit: 50,
      }),
    enabled: enabled && !!token && !!shopId,
    staleTime: 60_000,     // item list — 1min
    gcTime: 300_000,
    retry: 1,
  });
}

export function useInfiniteItemSearchQuery({ token, shopId, search, enabled = true }: UseItemSearchOptions) {
  return useInfiniteQuery({
    queryKey: queryKeys.items.list(shopId ?? "", { search, mode: "infinite" }),
    queryFn: ({ pageParam = 1 }) =>
      searchItemsApi(token!, {
        shopId: shopId!,
        search: search.trim() || undefined,
        page: pageParam as number,
        limit: 50,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < 50) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
    enabled: enabled && !!token && !!shopId,
    staleTime: 60_000,
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
