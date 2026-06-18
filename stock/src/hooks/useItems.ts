import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import {
  fetchItems,
  createItem,
  updateItem,
  fetchCurrentStock,
  createStockMovement,
  fetchStockMovements,
  addStock,
  fetchItemStock,
  fetchItemPriceHistory,
  fetchItemPriceChangeHistory,
  fetchCategories,
  fetchItemSummary,
  createCategory,
  updateCategory,
  deleteCategory,
  CreateItemPayload,
  UpdateItemPayload,
  StockEntryPayload,
  ItemCategory,
  ItemSummary,
} from "../api/client";

export function useItemSummaryQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: ["item-summary", activeShopId],
    queryFn: () => fetchItemSummary(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
    staleTime: 10 * 60 * 1000, // 10 mins
  });
}

export function useInfiniteItemsQuery(opts: { search?: string; limit?: number } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useInfiniteQuery({
    queryKey: queryKeys.itemsInfinite(activeShopId ?? "", opts.search),
    queryFn: ({ pageParam = 1 }) =>
      fetchItems(token ?? "", activeShopId ?? "", {
        search: opts.search,
        page: pageParam as number,
        limit: opts.limit ?? 20,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: !!token && !!activeShopId,
    staleTime: 10 * 60 * 1000, // 10 mins
  });
}

export function useItemsQuery(opts: { search?: string; page?: number; limit?: number; enabled?: boolean } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.items(activeShopId ?? "", opts.search),
    queryFn: () =>
      fetchItems(token ?? "", activeShopId ?? "", {
        search: opts.search,
        page: opts.page,
        limit: opts.limit,
      }),
    enabled: (opts.enabled ?? true) && !!token && !!activeShopId,
    staleTime: 30 * 60 * 1000, // 30 mins for offline-first
  });
}


export function useCurrentStockQuery(itemId?: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.currentStock(activeShopId ?? "", itemId),
    queryFn: () => fetchCurrentStock(token ?? "", activeShopId ?? "", itemId),
    enabled: !!token && !!activeShopId,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useStockMovementsQuery(itemId?: string, movementType?: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.stockMovements(activeShopId ?? "", itemId, movementType),
    queryFn: () => fetchStockMovements(token ?? "", activeShopId ?? "", itemId, movementType),
    enabled: !!token && !!activeShopId,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useCreateItemMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<CreateItemPayload, "shopId">) =>
      createItem(token ?? "", { ...data, shopId: activeShopId ?? "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useUpdateItemMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateItemPayload }) =>
      updateItem(token ?? "", id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item-price-history", id] });
      queryClient.invalidateQueries({ queryKey: ["item-price-change-history", id] });
      queryClient.invalidateQueries({ queryKey: ["item-stock", id] });
    },
  });
}

export function useCreateStockMovementMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => createStockMovement(token ?? "", data),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["stock-movements", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
      }
    },
  });
}

export function useAddStockMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<StockEntryPayload, "shopId">) =>
      addStock(token ?? "", { ...data, shopId: activeShopId ?? "" }),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["stock-movements", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
      }
    },
  });
}

export function useItemStockQuery(itemId?: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["item-stock", itemId],
    queryFn: () => fetchItemStock(token ?? "", itemId ?? ""),
    enabled: !!token && !!itemId,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useItemPriceHistoryQuery(itemId?: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["item-price-history", itemId],
    queryFn: () => fetchItemPriceHistory(token ?? "", itemId ?? ""),
    enabled: !!token && !!itemId,
    staleTime: 5 * 60 * 1000, // 5 mins
  });
}

export function useItemPriceChangeHistoryQuery(itemId?: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["item-price-change-history", itemId],
    queryFn: () => fetchItemPriceChangeHistory(token ?? "", itemId ?? ""),
    enabled: !!token && !!itemId,
    staleTime: 5 * 60 * 1000, // 5 mins
  });
}

export function useCategoriesQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.categories(activeShopId ?? ""),
    queryFn: () => fetchCategories(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCategoryMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createCategory(token ?? "", activeShopId ?? "", name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories(activeShopId ?? "") });
    },
  });
}

export function useUpdateCategoryMutation() {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(token ?? "", id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories(activeShopId ?? "") });
      // Also refresh items in case category names are shown inline
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useDeleteCategoryMutation() {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(token ?? "", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories(activeShopId ?? "") });
    },
  });
}
