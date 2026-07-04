import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchCustomers, fetchCustomer, createCustomer, updateCustomer, fetchCustomerSales, fetchCustomerPayments, fetchCustomerDMs, fetchCustomerReturns, fetchCustomerTimeline } from "../api/client";
import { newIdempotencyKey } from "../utils/idempotency";
import { requireActiveShopId } from "./useActiveShop";
import { useCustomerReadModel, useReadModelRefresh } from "../local/read-model/read-model-selectors";
import { refreshReadModelDomains } from "../local/read-model/read-model-coordinator";

function refreshCustomerReadModelAfterMutation({
  userId,
  shopId,
  token,
  queryClient,
}: {
  userId?: string;
  shopId?: string | null;
  token?: string | null;
  queryClient: QueryClient;
}) {
  if (!userId || !shopId || !token) return;
  void refreshReadModelDomains({
    userId,
    shopId,
    token,
    queryClient,
    reason: "reconciliation",
    writeCursor: false,
  }, ["customers"]).catch((error) => {
    if (__DEV__) console.warn("[read-model] customer mutation refresh failed", error);
  });
}

export function useCustomersQuery(opts: { search?: string; includeWalkin?: boolean; limit?: number; enabled?: boolean } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const refreshReadModel = useReadModelRefresh(activeShopId);
  const localCustomers = useCustomerReadModel({
    search: opts.search,
    includeWalkin: opts.includeWalkin,
    limit: opts.limit,
  });
  const serverQuery = useQuery({
    queryKey: [...queryKeys.customers(activeShopId ?? ""), { search: opts.search, includeWalkin: opts.includeWalkin, limit: opts.limit }],
    queryFn: () => fetchCustomers(token ?? "", activeShopId ?? "", opts.includeWalkin ?? false, {
      search: opts.search,
      limit: opts.limit,
    }),
    enabled: (opts.enabled ?? true) && !!token && !!activeShopId && !localCustomers.hasReadModel,
    staleTime: 15 * 60 * 1000, // 15 mins
  });

  return {
    ...serverQuery,
    data: localCustomers.hasReadModel ? (localCustomers.data ?? []) : serverQuery.data,
    isLoading: localCustomers.hasReadModel ? false : serverQuery.isLoading,
    isFetching: serverQuery.isFetching || localCustomers.isFetching,
    refetch: localCustomers.hasReadModel ? refreshReadModel : serverQuery.refetch,
  };
}

export function useCustomerDetailQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: queryKeys.customer(id),
    queryFn: () => fetchCustomer(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 15 * 60 * 1000, // 15 mins
  });
}

export function useCustomerSalesQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["customer-sales", id],
    queryFn: () => fetchCustomerSales(token ?? "", id),
    enabled: !!token && !!id,
  });
}

export function useCustomerPaymentsQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["customer-payments", id],
    queryFn: () => fetchCustomerPayments(token ?? "", id),
    enabled: !!token && !!id,
  });
}

export function useCustomerDMsQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["customer-dms", id],
    queryFn: () => fetchCustomerDMs(token ?? "", id),
    enabled: !!token && !!id,
  });
}

export function useCustomerReturnsQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["customer-returns", id],
    queryFn: () => fetchCustomerReturns(token ?? "", id),
    enabled: !!token && !!id,
  });
}

export function useCustomerTimelineQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["customer-timeline", id],
    queryFn: () => fetchCustomerTimeline(token ?? "", id),
    enabled: !!token && !!id,
  });
}

export function useCreateCustomerMutation() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      createCustomer(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }, {
        idempotencyKey: newIdempotencyKey("CUSTOMER"),
      }),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
        refreshCustomerReadModelAfterMutation({ userId, shopId: activeShopId, token, queryClient });
      }
    },
  });
}

export function useUpdateCustomerMutation() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      updateCustomer(token ?? "", id, data),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
        refreshCustomerReadModelAfterMutation({ userId, shopId: activeShopId, token, queryClient });
      }
      queryClient.invalidateQueries({ queryKey: ["customer", variables.id] });
    },
  });
}
