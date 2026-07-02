import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { fetchDeliveryMemos, fetchDeliveryMemo, createDeliveryMemo } from "../api/client";
import { warmOfflineCache } from "../utils/mmkvCache";
import { newIdempotencyKey } from "../utils/idempotency";
import { requireActiveShopId } from "./useActiveShop";

const DM_PAGE_SIZE = 30;

/** Infinite-scroll version — preferred for the DMs list screen */
export function useInfiniteDeliveryMemosQuery(opts: {
  status?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useInfiniteQuery({
    queryKey: ["delivery-memos-infinite", activeShopId ?? "", opts],
    queryFn: ({ pageParam = 1 }) =>
      fetchDeliveryMemos(token ?? "", activeShopId ?? "", {
        ...opts,
        page: pageParam as number,
        limit: DM_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === DM_PAGE_SIZE ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    enabled: !!token && !!activeShopId,
    staleTime: 2 * 60 * 1000,
  });
}

/** Simple one-shot query — kept for backward compat */
export function useDeliveryMemosQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: ["delivery-memos", activeShopId],
    queryFn: () => fetchDeliveryMemos(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}


export function useDeliveryMemoQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["delivery-memo", id],
    queryFn: () => fetchDeliveryMemo(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useCreateDeliveryMemoMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      createDeliveryMemo(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }, { idempotencyKey: newIdempotencyKey("DELIVERY_MEMO") }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-memos", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      if (activeShopId && token) warmOfflineCache(activeShopId, token).catch(() => {});
    },
  });
}
