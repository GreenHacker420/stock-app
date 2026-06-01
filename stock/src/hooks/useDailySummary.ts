import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import {
  fetchDailySummary,
  lockDailySummary,
  generateDailySummary,
  fetchDailySummaries,
  fetchDailySummaryById,
  lockDailySummaryById,
} from "../api/client";

export function useDailySummaryQuery(date: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.dailySummary(activeShopId ?? "", date),
    queryFn: () => fetchDailySummary(token ?? "", activeShopId ?? "", date),
    enabled: !!token && !!activeShopId && !!date,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useLockDailySummaryMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => lockDailySummary(token ?? "", activeShopId ?? "", date),
    onSuccess: (_, date) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.dailySummary(activeShopId, date) });
        queryClient.invalidateQueries({ queryKey: ["daily-summaries"] });
      }
    },
  });
}

export function useGenerateDailySummaryMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => generateDailySummary(token ?? "", activeShopId ?? "", date),
    onSuccess: (_, date) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.dailySummary(activeShopId, date) });
        queryClient.invalidateQueries({ queryKey: ["daily-summaries"] });
      }
    },
  });
}

export function useDailySummariesQuery(options: { dateFrom?: string; dateTo?: string; status?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryParams = { shopId: activeShopId ?? undefined, ...options };
  return useQuery({
    queryKey: queryKeys.dailySummaries(queryParams),
    queryFn: () => fetchDailySummaries(token ?? "", queryParams),
    enabled: !!token,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useDailySummaryByIdQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: queryKeys.dailySummaryById(id),
    queryFn: () => fetchDailySummaryById(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useLockDailySummaryByIdMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => lockDailySummaryById(token ?? "", id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailySummaryById(id) });
      queryClient.invalidateQueries({ queryKey: ["daily-summaries"] });
    },
  });
}
