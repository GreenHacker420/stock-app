import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { queryKeys } from "./query-keys";
import { fetchShops, createShop, updateShop, assignStaffToShop, setOpeningStock, fetchStaff, createDmFromOrder } from "../api/client";
import { newIdempotencyKey } from "../utils/idempotency";

export function useShopsQuery() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: queryKeys.shops(),
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
    staleTime: 15 * 60 * 1000, // 15 mins
  });
}

export function useStaffQuery() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["staff"],
    queryFn: () => fetchStaff(token ?? ""),
    enabled: !!token,
    staleTime: 15 * 60 * 1000, // 15 mins
  });
}

export function useAddDeliveryMemoMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...data }: { orderId: string; [key: string]: any }) => 
      createDmFromOrder(token ?? "", orderId, data, { idempotencyKey: newIdempotencyKey("ORDER_DM") }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });
}

export function useCreateShopMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => createShop(token ?? "", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
    },
  });
}

export function useUpdateShopMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      updateShop(token ?? "", id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
    },
  });
}

export function useAssignStaffToShopMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, staffId }: { shopId: string; staffId: string }) =>
      assignStaffToShop(token ?? "", shopId, staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
    },
  });
}

export function useSetOpeningStockMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, entries }: { shopId: string; entries: any }) =>
      setOpeningStock(token ?? "", shopId, entries),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["current-stock", variables.shopId] });
      queryClient.invalidateQueries({ queryKey: ["item-stock"] });
    },
  });
}
