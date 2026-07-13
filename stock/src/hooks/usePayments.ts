import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchPayments, verifyPayment, addPayment, markPaymentMismatch, attachPayment, PaymentStatus } from "../api/client";
import { newIdempotencyKey } from "../utils/idempotency";
import { requireActiveShopId } from "./useActiveShop";

const PAYMENTS_PAGE_SIZE = 30;

/** Infinite-scroll version — preferred for the payments list screen */
export function useInfinitePaymentsQuery(opts: {
  status?: PaymentStatus;
  customerId?: string;
  unlinked?: boolean;
} = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useInfiniteQuery({
    queryKey: ["payments-infinite", activeShopId ?? "", opts],
    queryFn: ({ pageParam = 1 }) =>
      fetchPayments(token ?? "", activeShopId ?? "", {
        ...opts,
        page: pageParam as number,
        limit: PAYMENTS_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAYMENTS_PAGE_SIZE ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    enabled: !!token && !!activeShopId,
    staleTime: 3 * 60 * 1000,
  });
}

/** Simple one-shot query — kept for backward compat (customer detail page, etc.) */
export function usePaymentsQuery(shopId?: string, options: { status?: PaymentStatus; customerId?: string; unlinked?: boolean; enabled?: boolean } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const targetShopId = shopId || activeShopId;
  const isEnabled = options.enabled !== false;
  return useQuery({
    queryKey: ["payments", targetShopId ?? "", options],
    queryFn: () => fetchPayments(token ?? "", targetShopId ?? "", options),
    enabled: !!token && !!targetShopId && isEnabled,
    staleTime: 3 * 60 * 1000, // 3 mins
  });
}


export function useAddPaymentMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Parameters<typeof addPayment>[1], "shopId">) =>
      addPayment(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }, {
        idempotencyKey: newIdempotencyKey("PAYMENT"),
      }),
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

export function useAttachPaymentMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, saleId, dmId, orderId }: { paymentId: string; saleId?: string; dmId?: string; orderId?: string }) =>
      attachPayment(token ?? "", paymentId, { saleId, dmId, orderId }),
    onSuccess: (updatedPayment: any) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
      }
      if (updatedPayment.saleId) {
        queryClient.invalidateQueries({ queryKey: ["sale", updatedPayment.saleId] });
      }
    },
  });
}
