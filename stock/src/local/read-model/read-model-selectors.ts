import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { queryKeys } from "../../hooks/query-keys";
import type { ItemCatalogReadModel, LocalReadModelEnvelope } from "./read-model-types";
import { refreshReadModelBootstrap } from "./read-model-coordinator";
import { selectCategories, selectCustomers, selectItemCatalog } from "./read-model-search-core";

export function useReadModelBootstrap(shopIdOverride?: string | null) {
  const queryClient = useQueryClient();
  const activeShopId = useShopStore((state) => state.activeShopId);
  const shopId = shopIdOverride ?? activeShopId ?? "";
  const key = queryKeys.readModels.bootstrap(shopId);

  return useQuery({
    queryKey: key,
    queryFn: async () => queryClient.getQueryData<LocalReadModelEnvelope>(key) ?? null,
    enabled: Boolean(shopId),
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useReadModelRefresh(shopIdOverride?: string | null) {
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const shopId = shopIdOverride ?? activeShopId ?? "";

  return async () => {
    if (!token || !userId || !shopId) return null;
    return refreshReadModelBootstrap({
      userId,
      shopId,
      token,
      queryClient,
      reason: "bootstrap",
    });
  };
}

export function useCustomerReadModel(options: {
  shopId?: string | null;
  search?: string;
  includeWalkin?: boolean;
  limit?: number;
} = {}) {
  const bootstrapQuery = useReadModelBootstrap(options.shopId);

  const data = useMemo(() => {
    const customers = bootstrapQuery.data?.customers;
    if (!customers) return null;
    return selectCustomers(customers, options);
  }, [bootstrapQuery.data?.customers, options.search, options.includeWalkin, options.limit]);

  return {
    ...bootstrapQuery,
    data,
    hasReadModel: Array.isArray(bootstrapQuery.data?.customers),
  };
}

export function useCategoryReadModel(options: { shopId?: string | null } = {}) {
  const bootstrapQuery = useReadModelBootstrap(options.shopId);
  const data = useMemo(() => {
    const categories = bootstrapQuery.data?.categories;
    if (!categories) return null;
    return selectCategories(categories);
  }, [bootstrapQuery.data?.categories]);

  return {
    ...bootstrapQuery,
    data,
    hasReadModel: Array.isArray(bootstrapQuery.data?.categories),
  };
}

export function useItemCatalogReadModel(options: {
  shopId?: string | null;
  search?: string;
  categoryId?: string;
  limit?: number;
} = {}) {
  const bootstrapQuery = useReadModelBootstrap(options.shopId);

  const data = useMemo(() => {
    const items = bootstrapQuery.data?.items;
    if (!items) return null;
    return selectItemCatalog(items, options);
  }, [bootstrapQuery.data?.items, options.search, options.categoryId, options.limit]);

  return {
    ...bootstrapQuery,
    data: data as ItemCatalogReadModel[] | null,
    hasReadModel: Array.isArray(bootstrapQuery.data?.items),
  };
}
