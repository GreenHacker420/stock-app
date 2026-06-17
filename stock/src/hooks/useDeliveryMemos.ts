import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { fetchDeliveryMemos, fetchDeliveryMemo, createDeliveryMemo } from "../api/client";

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
    mutationFn: (data: any) => createDeliveryMemo(token ?? "", { ...data, shopId: activeShopId ?? "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-memos", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}
