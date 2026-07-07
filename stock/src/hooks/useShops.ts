import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { queryKeys } from "./query-keys";
import { fetchShops, createShop, updateShop, assignStaffToShop, unassignStaffFromShop, setOpeningStock, fetchStaff, createDmFromOrder, transferStock, copyCatalog, type Shop } from "../api/client";
import { newIdempotencyKey } from "../utils/idempotency";

function addStaffAccessToShopsCache(queryClient: QueryClient, shopId: string, staffId: string, access: any) {
  queryClient.setQueryData<Shop[] | undefined>(queryKeys.shops(), (shops) => {
    if (!shops) return shops;
    return shops.map((shop) => {
      if (shop.id !== shopId) return shop;
      const existingAccesses = ((shop as any).staffAccesses || []) as any[];
      if (existingAccesses.some((entry) => entry.staffId === staffId)) return shop;
      return {
        ...shop,
        staffAccesses: [...existingAccesses, { ...access, staffId, shopId }],
      } as any;
    });
  });
}

function removeStaffAccessFromShopsCache(queryClient: QueryClient, shopId: string, staffId: string) {
  queryClient.setQueryData<Shop[] | undefined>(queryKeys.shops(), (shops) => {
    if (!shops) return shops;
    return shops.map((shop) => {
      if (shop.id !== shopId) return shop;
      return {
        ...shop,
        staffAccesses: (((shop as any).staffAccesses || []) as any[]).filter((entry) => entry.staffId !== staffId),
      } as any;
    });
  });
}

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
    queryKey: queryKeys.staff(),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.staff() });
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
    onSuccess: (access, variables) => {
      addStaffAccessToShopsCache(queryClient, variables.shopId, variables.staffId, access);
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
      queryClient.invalidateQueries({ queryKey: queryKeys.staff() });
    },
  });
}

export function useUnassignStaffFromShopMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, staffId }: { shopId: string; staffId: string }) =>
      unassignStaffFromShop(token ?? "", shopId, staffId),
    onSuccess: (_, variables) => {
      removeStaffAccessFromShopsCache(queryClient, variables.shopId, variables.staffId);
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
      queryClient.invalidateQueries({ queryKey: queryKeys.staff() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.items(variables.shopId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.currentStock(variables.shopId) });
      queryClient.invalidateQueries({ queryKey: ["item-stock"] });
    },
  });
}

export function useTransferStockMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { sourceShopId: string; targetShopId: string; itemId: string; quantity: number; reason?: string }) =>
      transferStock(token ?? "", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
      queryClient.invalidateQueries({ queryKey: queryKeys.items(variables.sourceShopId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.items(variables.targetShopId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.currentStock(variables.sourceShopId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.currentStock(variables.targetShopId) });
      queryClient.invalidateQueries({ queryKey: ["item-stock", variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements", variables.itemId] });
    },
  });
}

export function useCopyCatalogMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { sourceShopId: string; targetShopId: string; overwrite?: boolean; splitColors?: boolean; categoryIds?: string[]; itemIds?: string[] }) =>
      copyCatalog(token ?? "", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items(variables.targetShopId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
    },
  });
}
