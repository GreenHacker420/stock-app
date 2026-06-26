import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchCustomers, fetchCustomer, createCustomer, updateCustomer, fetchCustomerSales, fetchCustomerPayments, fetchCustomerDMs, fetchCustomerReturns, fetchCustomerTimeline } from "../api/client";
import { upsertLocalCustomersFromServer } from "../local/localBilling";
import { newIdempotencyKey, newLocalCustomerId } from "../local/localIds";

export function useCustomersQuery(opts: { search?: string; includeWalkin?: boolean; limit?: number } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const query = useQuery({
    queryKey: [...queryKeys.customers(activeShopId ?? ""), { search: opts.search, includeWalkin: opts.includeWalkin, limit: opts.limit }],
    queryFn: () => fetchCustomers(token ?? "", activeShopId ?? "", opts.includeWalkin ?? false, {
      search: opts.search,
      limit: opts.limit,
    }),
    enabled: !!token && !!activeShopId,
    staleTime: 15 * 60 * 1000, // 15 mins
  });

  useEffect(() => {
    if (!activeShopId || !query.data) return;
    upsertLocalCustomersFromServer(activeShopId, query.data).catch((error) => {
      if (__DEV__) console.warn("[local-cache] customers upsert failed", error);
    });
  }, [activeShopId, query.data]);

  return query;
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
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      createCustomer(token ?? "", { ...data, shopId: activeShopId ?? "" }, {
        idempotencyKey: newIdempotencyKey("CUSTOMER", newLocalCustomerId()),
      }),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
      }
    },
  });
}

export function useUpdateCustomerMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      updateCustomer(token ?? "", id, data),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["customer", variables.id] });
    },
  });
}
