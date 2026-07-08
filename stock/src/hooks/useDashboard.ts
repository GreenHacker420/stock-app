import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchOwnerDashboard, fetchStaffTodaySummary, fetchStorageObjects, deleteStorageObject, bulkDeleteOrphans } from "../api/client";

export function useOwnerDashboardQuery(options: { date?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.ownerDashboard(activeShopId ?? undefined, options.date),
    queryFn: () => fetchOwnerDashboard(token ?? "", { shopId: activeShopId ?? undefined, date: options.date }),
    enabled: !!token && !!activeShopId,
    staleTime: 60 * 1000,
    refetchOnReconnect: false,
  });
}

export function useStaffTodaySummaryQuery(options: { date?: string; staffId?: string; dateFrom?: string; dateTo?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.staffTodaySummary(activeShopId ?? "", options.date, options.staffId, options.dateFrom, options.dateTo),
    queryFn: () => fetchStaffTodaySummary(token ?? "", activeShopId ?? "", options.date, options.staffId, options.dateFrom, options.dateTo),
    enabled: !!token && !!activeShopId,
    staleTime: 60 * 1000,
    refetchOnReconnect: false,
  });
}

export function useStorageObjectsQuery(filter?: "ALL" | "ORPHANED") {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.storageObjects(activeShopId ?? "", filter),
    queryFn: () => fetchStorageObjects(token ?? "", activeShopId ?? "", filter),
    enabled: !!token && !!activeShopId,
  });
}

export function useDeleteStorageObjectMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => deleteStorageObject(token ?? "", assetId),
    onSuccess: () => {
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
      queryClient.invalidateQueries({ queryKey: ["storage-objects"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["shopStorageStats"] });
    },
  });
}
