import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
        filter
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
