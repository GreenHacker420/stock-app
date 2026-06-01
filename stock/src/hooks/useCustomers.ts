import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchCustomers, fetchCustomer, createCustomer, updateCustomer } from "../api/client";

export function useCustomersQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.customers(activeShopId ?? ""),
    queryFn: () => fetchCustomers(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
    staleTime: 5 * 60 * 1000, // 5 mins
  });
}

export function useCustomerDetailQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: queryKeys.customer(id),
    queryFn: () => fetchCustomer(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 5 * 60 * 1000, // 5 mins
  });
}

export function useCreateCustomerMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      createCustomer(token ?? "", { ...data, shopId: activeShopId ?? "" }),
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
