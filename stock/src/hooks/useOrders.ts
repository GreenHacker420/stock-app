import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/auth/auth-store";
import { useShopStore } from "@/auth/shop-store";
import { queryKeys } from "@/hooks/query-keys";
import {
  fetchOrders,
  fetchOrder,
  createOrder,
  assignStaffToOrder,
  startOrderPacking,
  markOrderItemPacked,
  reportOrderShortage,
  createDmFromOrder,
  convertOrderToSale,
  confirmOrder,
  cancelOrder,
  type Order,
} from "@/api/client";
import { newIdempotencyKey } from "@/utils/idempotency";
import { requireActiveShopId } from "@/hooks/useActiveShop";

const ORDERS_PAGE_SIZE = 30;

/** Infinite-scroll version — preferred for the orders list screen */
export function useInfiniteOrdersQuery(opts: {
  status?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useInfiniteQuery({
    queryKey: [...queryKeys.orders(activeShopId ?? ""), "infinite", opts],
    queryFn: ({ pageParam = 1 }) =>
      fetchOrders(token ?? "", activeShopId ?? "", {
        ...opts,
        page: pageParam as number,
        limit: ORDERS_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === ORDERS_PAGE_SIZE ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    enabled: !!token && !!activeShopId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOrdersQuery(options: { search?: string; status?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: [...queryKeys.orders(activeShopId ?? ""), options.search, options.status],
    queryFn: () => fetchOrders(token ?? "", activeShopId ?? "", { status: options.status, limit: 200 }),
    enabled: !!token && !!activeShopId,
    staleTime: 10 * 60 * 1000, // 10 mins
  });
}


export function useOrderDetailQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();

  return useQuery<Order, Error>({
    queryKey: queryKeys.order(id),
    queryFn: () => fetchOrder(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 10 * 60 * 1000, // 10 mins
    initialData: () => {
      if (!activeShopId) return undefined;

      // 1. Try to find the order in the infinite query cache
      const infiniteQueries = queryClient.getQueriesData<any>({
        queryKey: ["orders", activeShopId, "infinite"],
      });
      for (const [_, queryData] of infiniteQueries) {
        if (queryData?.pages) {
          for (const page of queryData.pages) {
            if (Array.isArray(page)) {
              const found = page.find((o: any) => o.id === id);
              if (found) return found;
            }
          }
        }
      }

      // 2. Try to find the order in the simple list query cache
      const queries = queryClient.getQueriesData<any>({
        queryKey: ["orders", activeShopId],
      });
      for (const [_, queryData] of queries) {
        if (Array.isArray(queryData)) {
          const found = queryData.find((o: any) => o.id === id);
          if (found) return found;
        }
      }
      return undefined;
    },
    initialDataUpdatedAt: () => {
      if (!activeShopId) return undefined;

      // 1. Try the infinite query
      const infiniteQueries = queryClient.getQueriesData<any>({
        queryKey: ["orders", activeShopId, "infinite"],
      });
      for (const [queryKey, _] of infiniteQueries) {
        const state = queryClient.getQueryState(queryKey);
        if (state?.dataUpdatedAt) {
          return state.dataUpdatedAt;
        }
      }

      // 2. Try the simple list queries
      const queries = queryClient.getQueriesData<any>({
        queryKey: ["orders", activeShopId],
      });
      for (const [queryKey, _] of queries) {
        const state = queryClient.getQueryState(queryKey);
        if (state?.dataUpdatedAt) {
          return state.dataUpdatedAt;
        }
      }
      return undefined;
    },
  });
}

export function useOrderQuery(id: string) {
  return useOrderDetailQuery(id);
}

export function useUpdateOrderStatusMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status, assignedStaffId, shortage }: { orderId: string; status?: string; assignedStaffId?: string; shortage?: { itemId: string; quantity: number } }) => {
       if (status === 'PACKING') return startOrderPacking(token ?? "", orderId);
       if (assignedStaffId) return assignStaffToOrder(token ?? "", orderId, assignedStaffId);
       if (shortage) return reportOrderShortage(token ?? "", orderId, shortage);
       // Add other status updates if needed
       return Promise.resolve();
    },
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["order", variables.orderId] });
    },
  });
}

export function useCreateOrderMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      createOrder(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }, { idempotencyKey: newIdempotencyKey("ORDER") }),
    onSuccess: () => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
      }
    },
  });
}

export function useAssignStaffToOrderMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, staffId }: { orderId: string; staffId: string }) =>
      assignStaffToOrder(token ?? "", orderId, staffId),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["order", variables.orderId] });
    },
  });
}

export function useStartOrderPackingMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => startOrderPacking(token ?? "", orderId),
    onSuccess: (_, orderId) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });
}

export function useMarkOrderItemPackedMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, data }: { orderId: string; data: any }) =>
      markOrderItemPacked(token ?? "", orderId, data),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["order", variables.orderId] });
    },
  });
}

export function useReportOrderShortageMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, data }: { orderId: string; data: any }) =>
      reportOrderShortage(token ?? "", orderId, data),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
      }
      queryClient.invalidateQueries({ queryKey: ["order", variables.orderId] });
    },
  });
}

export function useCreateDmFromOrderMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, data }: { orderId: string; data: any }) =>
      createDmFromOrder(token ?? "", orderId, data, { idempotencyKey: newIdempotencyKey("ORDER_DM") }),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["order", variables.orderId] });
    },
  });
}

export function useConvertOrderToSaleMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, data }: { orderId: string; data: any }) =>
      convertOrderToSale(token ?? "", orderId, data, { idempotencyKey: newIdempotencyKey("ORDER_SALE") }),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["cash-sessions", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["current-cash-session", activeShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["order", variables.orderId] });
    },
  });
}

export function useConfirmOrderMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => confirmOrder(token ?? "", orderId),
    onSuccess: (_, orderId) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
      }
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });
}

export function useCancelOrderMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      cancelOrder(token ?? "", orderId, reason, { idempotencyKey: newIdempotencyKey("ORDER_CANCEL") }),
    onSuccess: (_, variables) => {
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["item-stock"] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
      }
      queryClient.invalidateQueries({ queryKey: ["order", variables.orderId] });
    },
  });
}
