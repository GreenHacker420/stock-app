import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { apiRequest } from "../api/client";
import { requireActiveShopId } from "./useActiveShop";

export function useExpensesQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: ["expenses", activeShopId],
    queryFn: () => apiRequest<any[]>(`/expenses?shopId=${activeShopId}`, { token }),
    enabled: !!token && !!activeShopId,
  });
}

export function useCreateExpenseMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiRequest("/expenses", {
        method: "POST",
        token,
        body: JSON.stringify({ ...data, shopId: requireActiveShopId(activeShopId) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["verifications", activeShopId] });
    },
  });
}
