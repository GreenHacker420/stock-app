import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { fetchPayments, verifyPayment, addPayment, markPaymentMismatch, attachPayment, PaymentStatus } from "../api/client";
import { newIdempotencyKey } from "../utils/idempotency";
import { requireActiveShopId } from "./useActiveShop";

const PAYMENTS_PAGE_SIZE = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Backend-filter params — never includes React Query control flags */
type PaymentsFilters = {
  status?: PaymentStatus;
  customerId?: string;
  unlinked?: boolean;
};

/** React Query control options — separated from API params */
type PaymentsQueryOptions = {
  enabled?: boolean;
};

// ─── Infinite-scroll (payments list screen) ───────────────────────────────────

export function useInfinitePaymentsQuery(opts: PaymentsFilters = {}) {
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

// ─── Simple one-shot query ────────────────────────────────────────────────────


export function usePaymentsQuery(
  shopId?: string,
  filters: PaymentsFilters = {},
  queryOptions: PaymentsQueryOptions = {}
) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const targetShopId = shopId || activeShopId;

  return useQuery({
    // `filters` in key, NOT queryOptions — avoids cache splits on `enabled` flag
    queryKey: ["payments", targetShopId ?? "", filters],
    queryFn: () => fetchPayments(token ?? "", targetShopId ?? "", filters),
    enabled:
      !!token &&
      !!targetShopId &&
      queryOptions.enabled !== false,
    staleTime: 3 * 60 * 1000,
  });
}

// ─── Add payment ──────────────────────────────────────────────────────────────

export function useAddPaymentMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Parameters<typeof addPayment>[1], "shopId">) =>
      addPayment(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }, {
        idempotencyKey: newIdempotencyKey("PAYMENT"),
      }),
    onSuccess: (_result, _variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["payments-infinite", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}

// ─── Verify payment ───────────────────────────────────────────────────────────

export function useVerifyPaymentMutation(shopId?: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  // Use the sale's shop for all invalidation, not the active shop
  const targetShopId = shopId || activeShopId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, note }: { paymentId: string; note?: string }) =>
      verifyPayment(token ?? "", paymentId, note),
    onSuccess: (updatedPayment: any) => {
      if (targetShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["payments-infinite", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["sales", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["orders", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", targetShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      // Invalidate the specific sale detail if the API returns saleId
      if (updatedPayment?.saleId) {
        queryClient.invalidateQueries({ queryKey: ["sale", updatedPayment.saleId] });
      }
    },
  });
}

// ─── Mark payment mismatch ────────────────────────────────────────────────────

export function useMarkPaymentMismatchMutation(shopId?: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const targetShopId = shopId || activeShopId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, note }: { paymentId: string; note?: string }) =>
      markPaymentMismatch(token ?? "", paymentId, note),
    onSuccess: (updatedPayment: any) => {
      if (targetShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["payments-infinite", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["sales", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["orders", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", targetShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      if (updatedPayment?.saleId) {
        queryClient.invalidateQueries({ queryKey: ["sale", updatedPayment.saleId] });
      }
    },
  });
}

// ─── Attach payment ───────────────────────────────────────────────────────────

export function useAttachPaymentMutation(shopId?: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const targetShopId = shopId || activeShopId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, saleId, dmId, orderId }: { paymentId: string; saleId?: string; dmId?: string; orderId?: string }) =>
      attachPayment(token ?? "", paymentId, { saleId, dmId, orderId }),
    onSuccess: (updatedPayment: any) => {
      if (targetShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["payments-infinite", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["sales", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["orders", targetShopId] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", targetShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      if (updatedPayment?.saleId) {
        queryClient.invalidateQueries({ queryKey: ["sale", updatedPayment.saleId] });
      }
    },
  });
}
