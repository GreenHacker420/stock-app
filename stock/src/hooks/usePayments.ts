import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchPayments, verifyPayment, addPayment, markPaymentMismatch } from "../api/client";

export function usePaymentsQuery(shopId?: string, options: { verificationStatus?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const targetShopId = shopId || activeShopId;
  return useQuery({
    queryKey: queryKeys.payments(targetShopId ?? "", options.verificationStatus),
    queryFn: () => fetchPayments(token ?? "", targetShopId ?? "", options),
    enabled: !!token && !!targetShopId,
    staleTime: 3 * 60 * 1000, // 3 mins
  });
}

export function useAddPaymentMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Parameters<typeof addPayment>[1], "shopId">) =>
      addPayment(token ?? "", { ...data, shopId: activeShopId ?? "" }),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
      }
    },
  });
}

export function useVerifyPaymentMutation(shopId?: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const targetShopId = shopId || activeShopId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, note }: { paymentId: string; note?: string }) =>
      verifyPayment(token ?? "", paymentId, note),
    onSuccess: () => {
      if (targetShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", targetShopId] });
      }
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
      }
    },
  });
}

export function useMarkPaymentMismatchMutation(shopId?: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const targetShopId = shopId || activeShopId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, note }: { paymentId: string; note?: string }) =>
      markPaymentMismatch(token ?? "", paymentId, note),
    onSuccess: () => {
      if (targetShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", targetShopId] });
      }
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
      }
    },
  });
}
