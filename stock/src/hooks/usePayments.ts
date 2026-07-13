import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { fetchPayments, verifyPayment, addPayment, markPaymentMismatch, attachPayment, PaymentStatus } from "../api/client";
import { newIdempotencyKey } from "../utils/idempotency";
import { requireActiveShopId } from "./useActiveShop";
import { queryKeys } from "./query-keys";

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

// ─── Invalidation Helper ──────────────────────────────────────────────────────

function invalidatePaymentDomains(
  queryClient: any,
  shopId: string,
  saleId?: string,
  customerId?: string
) {
  // Invalidate payment lists (finite and infinite)
  queryClient.invalidateQueries({ queryKey: queryKeys.payments(shopId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.paymentsInfinite(shopId) });

  // Invalidate associated transactions
  queryClient.invalidateQueries({ queryKey: queryKeys.sales(shopId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.orders(shopId) });

  // Invalidate operational dashboards & summaries
  queryClient.invalidateQueries({ queryKey: queryKeys.ownerDashboard(shopId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.staffTodaySummary(shopId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.currentCashSession(shopId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.cashSessions(shopId) });

  // Invalidate sale detail if present
  if (saleId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.sale(saleId) });
  }

  // Invalidate customer detail & list if present
  if (customerId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.customer(customerId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.customers(shopId) });
  }
}

// ─── Infinite-scroll (payments list screen) ───────────────────────────────────

export function useInfinitePaymentsQuery(shopId?: string, opts: PaymentsFilters = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const targetShopId = shopId || activeShopId;

  return useInfiniteQuery({
    queryKey: queryKeys.paymentsInfinite(targetShopId ?? "", opts),
    queryFn: ({ pageParam = 1 }) =>
      fetchPayments(token ?? "", targetShopId ?? "", {
        ...opts,
        page: pageParam as number,
        limit: PAYMENTS_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAYMENTS_PAGE_SIZE ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    enabled: !!token && !!targetShopId,
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
    queryKey: queryKeys.payments(targetShopId ?? "", filters),
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
    onSuccess: (result: any) => {
      const shopId = activeShopId || result?.shopId;
      if (shopId) {
        invalidatePaymentDomains(queryClient, shopId, result?.saleId, result?.customerId);
      }
    },
  });
}

// ─── Verify payment ───────────────────────────────────────────────────────────

export function useVerifyPaymentMutation(shopId?: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const targetShopId = shopId || activeShopId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, saleId, customerId, note }: { paymentId: string; saleId?: string; customerId?: string; note?: string }) =>
      verifyPayment(token ?? "", paymentId, note),
    onSuccess: (updatedPayment: any, variables) => {
      const shopId = targetShopId || updatedPayment?.shopId;
      const saleId = updatedPayment?.saleId || variables.saleId;
      const customerId = updatedPayment?.customerId || variables.customerId;
      if (shopId) {
        invalidatePaymentDomains(queryClient, shopId, saleId, customerId);
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
    mutationFn: ({ paymentId, saleId, customerId, note }: { paymentId: string; saleId?: string; customerId?: string; note?: string }) =>
      markPaymentMismatch(token ?? "", paymentId, note),
    onSuccess: (updatedPayment: any, variables) => {
      const shopId = targetShopId || updatedPayment?.shopId;
      const saleId = updatedPayment?.saleId || variables.saleId;
      const customerId = updatedPayment?.customerId || variables.customerId;
      if (shopId) {
        invalidatePaymentDomains(queryClient, shopId, saleId, customerId);
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
      const shopId = targetShopId || updatedPayment?.shopId;
      if (shopId) {
        invalidatePaymentDomains(queryClient, shopId, updatedPayment?.saleId, updatedPayment?.customerId);
      }
    },
  });
}
