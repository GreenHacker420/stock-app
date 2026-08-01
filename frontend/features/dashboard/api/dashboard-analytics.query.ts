import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/query-keys";
import { OwnerDashboardAnalytics, AnalyticsQueryParams } from "../lib/analytics-types";

export async function fetchOwnerDashboardAnalyticsApi(
  token: string,
  params: AnalyticsQueryParams
): Promise<OwnerDashboardAnalytics> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  if (params.shopId) query.set("shopId", params.shopId);
  if (params.granularity) query.set("granularity", params.granularity);
  if (params.topLimit) query.set("topLimit", String(params.topLimit));

  return apiRequest(`/dashboard/owner/analytics?${query.toString()}`, { token });
}

export function useOwnerDashboardAnalyticsQuery({
  token,
  shopId,
  dateFrom,
  dateTo,
  granularity = "AUTO",
  topLimit = 5,
  enabled = true,
}: {
  token: string | null;
  shopId?: string | null;
  dateFrom: string;
  dateTo: string;
  granularity?: "AUTO" | "DAY" | "WEEK" | "MONTH";
  topLimit?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.dashboard.ownerAnalytics({
      shopId: shopId || undefined,
      dateFrom,
      dateTo,
      granularity,
      topLimit,
    }),
    queryFn: () =>
      fetchOwnerDashboardAnalyticsApi(token || "", {
        shopId: shopId || undefined,
        dateFrom,
        dateTo,
        granularity,
        topLimit,
      }),
    enabled: !!token && enabled,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
