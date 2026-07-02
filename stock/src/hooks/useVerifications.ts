import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { apiRequest } from "../api/client";
import { warmOfflineCache } from "../utils/mmkvCache";

export const GENERIC_APPROVAL_SUPPORTED_TYPES = new Set(["STOCK_ENTRY"]);

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
    mutationFn: ({ id, status, notes, type }: { id: string; status: "APPROVED" | "REJECTED"; notes?: string; type?: string }) => {
      if (type && !GENERIC_APPROVAL_SUPPORTED_TYPES.has(type)) {
        throw new Error("Open the specific verification screen for this approval type.");
      }
      return apiRequest(`/approvals/${id}/respond`, {
        method: "POST",
        token,
        body: JSON.stringify({ status, rejectedReason: notes }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["verifications", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["expenses", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["item-stock"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      if (activeShopId && token) warmOfflineCache(activeShopId, token).catch(() => {});
    },
  });
}
