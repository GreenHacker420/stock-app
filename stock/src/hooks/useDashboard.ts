import { useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import {
  fetchOwnerDashboard,
  fetchStaffTodaySummary,
  fetchStorageObjects,
  deleteStorageObject,
  bulkDeleteOrphans,
} from "../api/client";
import { readAssetCache, writeAssetCache, invalidateAssetCache } from "./useAssetCache";

export function useOwnerDashboardQuery(options: { date?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.ownerDashboard(activeShopId ?? undefined, options.date),
    queryFn: () =>
      fetchOwnerDashboard(token ?? "", {
        shopId: activeShopId ?? undefined,
        date: options.date,
      }),
    enabled: !!token && !!activeShopId,
    staleTime: 60 * 1000,
    refetchOnReconnect: false,
  });
}

export function useStaffTodaySummaryQuery(
  options: {
    date?: string;
    staffId?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}
) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.staffTodaySummary(
      activeShopId ?? "",
      options.date,
      options.staffId,
      options.dateFrom,
      options.dateTo
    ),
    queryFn: () =>
      fetchStaffTodaySummary(
        token ?? "",
        activeShopId ?? "",
        options.date,
        options.staffId,
        options.dateFrom,
        options.dateTo
      ),
    enabled: !!token && !!activeShopId,
    staleTime: 60 * 1000,
    refetchOnReconnect: false,
  });
}

export function useStorageObjectsInfiniteQuery(params?: {
  filter?: "ALL" | "ORPHANED";
  search?: string;
  categoryId?: string;
  brandId?: string;
  type?: string;
  sortBy?: string;
}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const effectiveFilter = params?.filter ?? "ALL";

  const isDefaultQuery =
    effectiveFilter === "ALL" &&
    !params?.search &&
    (!params?.categoryId || params?.categoryId === "ALL") &&
    (!params?.brandId || params?.brandId === "ALL") &&
    (!params?.type || params?.type === "ALL") &&
    (!params?.sortBy || params?.sortBy === "date_desc");

  const [initialData] = useState(() => {
    if (!activeShopId || !isDefaultQuery) return undefined;
    const cached = readAssetCache(activeShopId, effectiveFilter);
    if (!cached) return undefined;
    return {
      pages: [cached],
      pageParams: [undefined],
    };
  });

  return useInfiniteQuery({
    queryKey: queryKeys.storageObjectsInfinite(activeShopId ?? "", params),
    queryFn: async ({ pageParam }) => {
      const result = await fetchStorageObjects(
        token ?? "",
        activeShopId ?? "",
        {
          filter: params?.filter,
          search: params?.search,
          categoryId: params?.categoryId,
          brandId: params?.brandId,
          type: params?.type,
          sortBy: params?.sortBy,
          cursor: pageParam as string | undefined,
          limit: 30,
        }
      );
      if (!pageParam && activeShopId && isDefaultQuery) {
        writeAssetCache(activeShopId, effectiveFilter, result);
      }
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: initialData as any,
    enabled: !!token && !!activeShopId,
    staleTime: isDefaultQuery ? 5 * 60 * 1000 : 0,
  });
}

export function useStorageObjectsQuery(filter?: "ALL" | "ORPHANED") {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const effectiveFilter = filter ?? "ALL";

  // Synchronously read MMKV on first render → instant data on app restart
  const [initialData] = useState(() =>
    activeShopId
      ? readAssetCache(activeShopId, effectiveFilter) ?? undefined
      : undefined
  );

  return useQuery({
    queryKey: queryKeys.storageObjects(activeShopId ?? "", filter),
    queryFn: async () => {
      const result = await fetchStorageObjects(
        token ?? "",
        activeShopId ?? "",
        { filter }
      );
      if (activeShopId) writeAssetCache(activeShopId, effectiveFilter, result);
      return result;
    },
    initialData,
    enabled: !!token && !!activeShopId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeleteStorageObjectMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) =>
      deleteStorageObject(token ?? "", assetId),
    onSuccess: () => {
      if (activeShopId) invalidateAssetCache(activeShopId);
      queryClient.invalidateQueries({ queryKey: ["storage-objects"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["shopStorageStats"] });
    },
  });
}

export function useBulkDeleteOrphansMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => bulkDeleteOrphans(token ?? "", activeShopId ?? ""),
    onSuccess: () => {
      if (activeShopId) invalidateAssetCache(activeShopId);
      queryClient.invalidateQueries({ queryKey: ["storage-objects"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["shopStorageStats"] });
    },
  });
}
