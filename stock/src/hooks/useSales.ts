import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchSales, fetchSale, createSale, createWalkInSale, CreateSalePayload } from "../api/client";

export function useSalesQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.sales(activeShopId ?? ""),
    queryFn: () => fetchSales(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useSaleDetailQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: queryKeys.sale(id),
    queryFn: () => fetchSale(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useCreateSaleMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<CreateSalePayload, "shopId">) =>
      createSale(token ?? "", { ...data, shopId: activeShopId ?? "" }),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["items", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["cash-sessions", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-cash-session", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
      }
    },
  });
}

export function useCreateWalkInSaleMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      createWalkInSale(token ?? "", { ...data, shopId: activeShopId ?? "" }),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["items", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["cash-sessions", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-cash-session", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
      }
    },
  });
}
