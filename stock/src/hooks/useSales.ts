import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchSales, fetchSale, createSale, createWalkInSale, CreateSalePayload, updateSaleGst, updateSale, amendSale, issueInvoice, cancelInvoice } from "../api/client";
import { newIdempotencyKey } from "../utils/idempotency";
import { requireActiveShopId } from "./useActiveShop";

const SALES_PAGE_SIZE = 30;

/** Infinite-scroll version — preferred for list screens */
export function useInfiniteSalesQuery(opts: {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
} = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useInfiniteQuery({
    queryKey: [...queryKeys.sales(activeShopId ?? ""), "infinite", opts],
    queryFn: ({ pageParam = 1 }) =>
      fetchSales(token ?? "", activeShopId ?? "", {
        page: pageParam as number,
        limit: SALES_PAGE_SIZE,
        dateFrom: opts.dateFrom,
        dateTo: opts.dateTo,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === SALES_PAGE_SIZE ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    enabled: !!token && !!activeShopId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Simple one-shot query — kept for backward compat / small datasets */
export function useSalesQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.sales(activeShopId ?? ""),
    queryFn: () => fetchSales(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
    staleTime: 10 * 60 * 1000, // 10 mins
  });
}


export function useSaleQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["sale", id],
    queryFn: () => fetchSale(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 10 * 60 * 1000, // 10 mins
  });
}

export function useSaleDetailQuery(id: string) {
  return useSaleQuery(id);
}


export function useCreateSaleMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<CreateSalePayload, "shopId">) =>
      createSale(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }, {
        idempotencyKey: newIdempotencyKey("SALE"),
      }),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
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
      createWalkInSale(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["cash-sessions", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-cash-session", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
      }
    },
  });
}

export function useUpdateGstMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, gstRequired, gstInvoiceNumber }: { saleId: string; gstRequired?: boolean; gstInvoiceNumber?: string | null }) =>
      updateSaleGst(token ?? "", saleId, { gstRequired, gstInvoiceNumber }),
    onSuccess: (updatedSale: any) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sale", updatedSale.id] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      }
    },
  });
}


export function useUpdateSaleMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, data }: { saleId: string; data: any }) =>
      updateSale(token ?? "", saleId, data),
    onSuccess: (updatedSale) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sale", updatedSale.id] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
      }
    },
  });
}

export function useAmendSaleMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, data }: { saleId: string; data: any }) =>
      amendSale(token ?? "", saleId, data),
    onSuccess: (updatedSale) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sale", updatedSale.id] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
      }
    },
  });
}

export function useIssueInvoiceMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, data }: { saleId: string; data: any }) =>
      issueInvoice(token ?? "", saleId, data),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sale", variables.saleId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      }
    },
  });
}

export function useCancelInvoiceMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, data }: { saleId: string; data?: any }) =>
      cancelInvoice(token ?? "", saleId, data),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sale", variables.saleId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      }
    },
  });
}
