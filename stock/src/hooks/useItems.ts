import { useQuery, useMutation, useQueryClient, useInfiniteQuery, keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import {
  fetchItems,
  createItem,
  updateItem,
  deleteItem,
  fetchCurrentStock,
  createStockMovement,
  fetchStockMovements,
  addStock,
  fetchItemStock,
  fetchItemPriceHistory,
  fetchItemPriceChangeHistory,
  fetchCategories,
  fetchBrands,
  fetchItemSummary,
  createCategory,
  updateCategory,
  deleteCategory,
  createBrand,
  updateBrand,
  deleteBrand,
  CreateItemPayload,
  UpdateItemPayload,
  StockEntryPayload,
  ItemCategory,
  ItemBrand,
  ItemSummary,
  batchQuickUpdate,
  Item,
} from "../api/client";
import { newIdempotencyKey } from "../utils/idempotency";
import { requireActiveShopId } from "./useActiveShop";
import { useCategoryReadModel, useReadModelRefresh } from "../local/read-model/read-model-selectors";
import { refreshReadModelDomains } from "../local/read-model/read-model-coordinator";
import type { ReadModelDomain } from "../local/read-model/read-model-types";

function refreshCatalogReadModelAfterMutation({
  userId,
  shopId,
  token,
  queryClient,
  domains,
}: {
  userId?: string;
  shopId?: string | null;
  token?: string | null;
  queryClient: QueryClient;
  domains: ReadModelDomain[];
}) {
  if (!userId || !shopId || !token) return;
  void refreshReadModelDomains({
    userId,
    shopId,
    token,
    queryClient,
    reason: "reconciliation",
    writeCursor: false,
  }, domains).catch((error) => {
    if (__DEV__) console.warn("[read-model] catalog mutation refresh failed", error);
  });
}

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
    staleTime: 30 * 60 * 1000, // 30 mins
  });
}

export function useItemsQuery(opts: { search?: string; categoryId?: string; brandId?: string; page?: number; limit?: number; enabled?: boolean } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const normalizedOptions = {
    search: opts.search?.trim() || undefined,
    categoryId: opts.categoryId || undefined,
    brandId: opts.brandId || undefined,
    page: opts.page,
    limit: opts.limit,
  };
  return useQuery({
    queryKey: queryKeys.items(activeShopId ?? "", normalizedOptions),
    queryFn: () =>
      fetchItems(token ?? "", activeShopId ?? "", {
        search: normalizedOptions.search,
        categoryId: normalizedOptions.categoryId,
        brandId: normalizedOptions.brandId,
        page: normalizedOptions.page,
        limit: normalizedOptions.limit,
      }),
    enabled: (opts.enabled ?? true) && !!token && !!activeShopId,
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}


export function useCurrentStockQuery(itemId?: string, options?: { enabled?: boolean }) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.currentStock(activeShopId ?? "", itemId),
    queryFn: () => fetchCurrentStock(token ?? "", activeShopId ?? "", itemId),
    enabled: (options?.enabled ?? true) && !!token && !!activeShopId,
    staleTime: 5 * 60 * 1000, // 5 mins
  });
}

export function useStockMovementsQuery(itemId?: string, movementType?: string, options?: { enabled?: boolean }) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.stockMovements(activeShopId ?? "", itemId, movementType),
    queryFn: () => fetchStockMovements(token ?? "", activeShopId ?? "", itemId, movementType),
    enabled: (options?.enabled ?? true) && !!token && !!activeShopId,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useCreateItemMutation() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<CreateItemPayload, "shopId">) =>
      createItem(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["item-summary", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["stock-movements", activeShopId] });
        refreshCatalogReadModelAfterMutation({ userId, shopId: activeShopId, token, queryClient, domains: ["items"] });
      }
    },
  });
}

export function useUpdateItemMutation() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
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
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["item-summary", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["stock-movements", activeShopId] });
        refreshCatalogReadModelAfterMutation({ userId, shopId: activeShopId, token, queryClient, domains: ["items"] });
      }
    },
  });
}

export function useDeleteItemMutation() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteItem(token ?? "", id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item-stock", id] });
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["item-summary", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["stock-movements", activeShopId] });
        refreshCatalogReadModelAfterMutation({ userId, shopId: activeShopId, token, queryClient, domains: ["items"] });
      }
    },
  });
}

export function useCreateStockMovementMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      createStockMovement(token ?? "", data, { idempotencyKey: newIdempotencyKey("STOCK_MOVEMENT") }),
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
      addStock(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }, { idempotencyKey: newIdempotencyKey("STOCK_ENTRY") }),
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

export function useCreateStockRequestMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<StockEntryPayload, "shopId">) =>
      addStock(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }, { idempotencyKey: newIdempotencyKey("STOCK_REQUEST") }),
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

export function useItemStockQuery(itemId?: string, options?: { enabled?: boolean }) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["item-stock", itemId],
    queryFn: () => fetchItemStock(token ?? "", itemId ?? ""),
    enabled: (options?.enabled ?? true) && !!token && !!itemId,
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

export function useItemPriceChangeHistoryQuery(itemId?: string, options?: { enabled?: boolean }) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["item-price-change-history", itemId],
    queryFn: () => fetchItemPriceChangeHistory(token ?? "", itemId ?? ""),
    enabled: (options?.enabled ?? true) && !!token && !!itemId,
    staleTime: 5 * 60 * 1000, // 5 mins
  });
}

export function useCategoriesQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const localCategories = useCategoryReadModel();
  const refreshReadModel = useReadModelRefresh(activeShopId);
  const serverQuery = useQuery({
    queryKey: queryKeys.categories(activeShopId ?? ""),
    queryFn: () => fetchCategories(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId && !localCategories.hasReadModel,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...serverQuery,
    data: localCategories.hasReadModel ? (localCategories.data ?? []) : serverQuery.data,
    isLoading: localCategories.hasReadModel ? false : serverQuery.isLoading,
    isFetching: serverQuery.isFetching || localCategories.isFetching,
    refetch: localCategories.hasReadModel ? refreshReadModel : serverQuery.refetch,
  };
}

export function useCreateCategoryMutation() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createCategory(token ?? "", requireActiveShopId(activeShopId), name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories(activeShopId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      refreshCatalogReadModelAfterMutation({ userId, shopId: activeShopId, token, queryClient, domains: ["items", "categories"] });
    },
  });
}

export function useUpdateCategoryMutation() {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(token ?? "", id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories(activeShopId ?? "") });
      // Also refresh items in case category names are shown inline
      queryClient.invalidateQueries({ queryKey: ["items"] });
      refreshCatalogReadModelAfterMutation({ userId, shopId: activeShopId, token, queryClient, domains: ["items", "categories"] });
    },
  });
}

export function useDeleteCategoryMutation() {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(token ?? "", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories(activeShopId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      refreshCatalogReadModelAfterMutation({ userId, shopId: activeShopId, token, queryClient, domains: ["items", "categories"] });
    },
  });
}

export function useBrandsQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: ["brands", activeShopId ?? ""],
    queryFn: () => fetchBrands(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateBrandMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createBrand(token ?? "", requireActiveShopId(activeShopId), name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands", activeShopId ?? ""] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useUpdateBrandMutation() {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateBrand(token ?? "", id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands", activeShopId ?? ""] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useDeleteBrandMutation() {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBrand(token ?? "", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands", activeShopId ?? ""] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useItemQuery(itemId?: string, options?: { enabled?: boolean }) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      const data = (await fetchItemStock(token ?? "", itemId ?? "")) as any;
      return data.item as Item;
    },
    enabled: (options?.enabled ?? true) && !!token && !!itemId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBatchQuickUpdateMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Array<{
      itemId: string;
      pricePatch?: { mrp?: number | null; defaultSellingPrice?: number };
      stockAdjustment?: number;
    }>) =>
      batchQuickUpdate(token ?? "", {
        shopId: requireActiveShopId(activeShopId),
        updates,
      }, { idempotencyKey: newIdempotencyKey("ITEM_QUICK_UPDATE") }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["item-summary", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["stock-movements", activeShopId] });
      }
    },
  });
}
