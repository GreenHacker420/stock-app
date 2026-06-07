import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { apiRequest } from "../api/client";

export function usePendingVerificationsQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: ["verifications", activeShopId],
    queryFn: () => apiRequest<any[]>(`/approvals?status=PENDING&shopId=${activeShopId}`, { token }),
    enabled: !!token && !!activeShopId,
  });
}

export function useProcessVerificationMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: "APPROVED" | "REJECTED"; notes?: string }) =>
      apiRequest(`/approvals/${id}/respond`, {
        method: "POST",
        token,
        body: JSON.stringify({ status, rejectedReason: notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["verifications", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["expenses", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["item-stock"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}
