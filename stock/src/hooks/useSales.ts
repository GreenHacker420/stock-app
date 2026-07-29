import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/auth/auth-store";
import { useShopStore } from "@/auth/shop-store";
import { queryKeys } from "@/hooks/query-keys";
import { fetchSales, fetchSale, createSale, createWalkInSale, CreateSalePayload, updateSaleGst, updateSale, amendSale, issueInvoice, cancelInvoice, cancelSale, type Sale } from "@/api/client";
import { newIdempotencyKey } from "@/utils/idempotency";
import { requireActiveShopId } from "@/hooks/useActiveShop";

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

export function useSalesQuery(opts: { dateFrom?: string; dateTo?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: [...queryKeys.sales(activeShopId ?? ""), opts],
    queryFn: () => fetchSales(token ?? "", activeShopId ?? "", opts),
    enabled: !!token && !!activeShopId,
    staleTime: 5 * 60 * 1000,
  });
}


export function useSaleQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();

  return useQuery<Sale, Error>({
    queryKey: ["sale", id],
    queryFn: () => fetchSale(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 30 * 1000, // 30 seconds
    initialData: () => {
      // 1. Try single sale query cache first if it contains full details
      const singleCache = queryClient.getQueryData<Sale>(["sale", id]);
      if (singleCache && Array.isArray((singleCache as any).items) && Array.isArray((singleCache as any).payments)) {
        return singleCache;
      }

      if (!activeShopId) return undefined;

      // 2. Try to find the sale in the infinite query cache
      const infiniteQueries = queryClient.getQueriesData<any>({
        queryKey: ["sales", activeShopId, "infinite"],
      });
      for (const [_, queryData] of infiniteQueries) {
        if (queryData?.pages) {
          for (const page of queryData.pages) {
            if (Array.isArray(page)) {
              const found = page.find((s: any) => s.id === id);
              if (found) return found;
            }
          }
        }
      }

      // 3. Fallback to the simple list query cache
      const sales = queryClient.getQueryData<Sale[]>(["sales", activeShopId]);
      return sales?.find((s) => s.id === id);
    },
    initialDataUpdatedAt: () => {
      // If single sale cache has complete items and payments, use its updatedAt timestamp
      const singleCache = queryClient.getQueryData<Sale>(["sale", id]);
      if (singleCache && Array.isArray((singleCache as any).items) && Array.isArray((singleCache as any).payments)) {
        return queryClient.getQueryState(["sale", id])?.dataUpdatedAt;
      }

      // If initialData comes from list cache (which lacks items and payments), return 0
      // so React Query IMMEDIATELY triggers background refetch for full details!
      return 0;
    },
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
    onSuccess: (res: any) => {
      if (res?.id) {
        queryClient.setQueryData(["sale", res.id], res);
      }
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
    onSuccess: (res: any) => {
      if (res?.id) {
        queryClient.setQueryData(["sale", res.id], res);
      }
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

export function useCancelSaleMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, reason }: { saleId: string; reason?: string }) =>
      cancelSale(token ?? "", saleId, { reason }),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sale", variables.saleId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock"] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
      }
    },
  });
}
