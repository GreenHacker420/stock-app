import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchAuditLogs } from "../api/client";

export function useAuditLogsQuery(options: { entityType?: string; action?: string; userId?: string; dateFrom?: string; dateTo?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryParams = { shopId: activeShopId ?? undefined, ...options };
  return useQuery({
    queryKey: queryKeys.auditLogs(queryParams),
    queryFn: () => fetchAuditLogs(token ?? "", queryParams),
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 mins
  });
}
