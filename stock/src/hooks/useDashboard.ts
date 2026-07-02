import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchOwnerDashboard, fetchStaffTodaySummary } from "../api/client";

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

export function useStaffTodaySummaryQuery(options: { date?: string; staffId?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.staffTodaySummary(activeShopId ?? "", options.date, options.staffId),
    queryFn: () => fetchStaffTodaySummary(token ?? "", activeShopId ?? "", options.date, options.staffId),
    enabled: !!token && !!activeShopId,
    staleTime: 60 * 1000,
    refetchOnReconnect: false,
  });
}
