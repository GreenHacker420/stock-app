import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import {
  fetchDeliveryMemos,
  fetchDeliveryMemo,
  createDeliveryMemo,
  createDeliveryMemoDraft,
  postDeliveryMemo,
  convertDeliveryMemoToSale,
  fetchDeliveryMemoTimeline,
  createCorrectionRequest,
} from "../api/client";
import { newIdempotencyKey } from "../utils/idempotency";
import { requireActiveShopId } from "./useActiveShop";

const DM_PAGE_SIZE = 30;

/** Infinite-scroll version — preferred for the DMs list screen */
export function useInfiniteDeliveryMemosQuery(opts: {
  status?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useInfiniteQuery({
    queryKey: ["delivery-memos-infinite", activeShopId ?? "", opts],
    queryFn: ({ pageParam = 1 }) =>
      fetchDeliveryMemos(token ?? "", activeShopId ?? "", {
        ...opts,
        page: pageParam as number,
        limit: DM_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === DM_PAGE_SIZE ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    enabled: !!token && !!activeShopId,
    staleTime: 2 * 60 * 1000,
  });
}

/** Simple one-shot query — kept for backward compat */
export function useDeliveryMemosQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: ["delivery-memos", activeShopId],
    queryFn: () => fetchDeliveryMemos(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}


export function useDeliveryMemoQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["delivery-memo", id],
    queryFn: () => fetchDeliveryMemo(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useCreateDeliveryMemoMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      createDeliveryMemo(token ?? "", { ...data, shopId: requireActiveShopId(activeShopId) }, { idempotencyKey: newIdempotencyKey("DELIVERY_MEMO") }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-memos", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}

function invalidateDeliveryMemoDomain(queryClient: ReturnType<typeof useQueryClient>, shopId: string | null, id?: string) {
  queryClient.invalidateQueries({ queryKey: ["delivery-memos", shopId] });
  queryClient.invalidateQueries({ queryKey: ["delivery-memos-infinite", shopId ?? ""] });
  if (id) queryClient.invalidateQueries({ queryKey: ["delivery-memo", id] });
  queryClient.invalidateQueries({ queryKey: ["current-stock", shopId] });
  queryClient.invalidateQueries({ queryKey: ["stock-movements", shopId] });
  queryClient.invalidateQueries({ queryKey: ["items"] });
  queryClient.invalidateQueries({ queryKey: ["customers", shopId] });
  queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
}

export function useCreateDeliveryMemoDraftMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => createDeliveryMemoDraft(
      token ?? "",
      { ...data, shopId: requireActiveShopId(activeShopId) },
      { idempotencyKey: newIdempotencyKey("DELIVERY_MEMO_DRAFT") },
    ),
    onSuccess: (draft) => invalidateDeliveryMemoDomain(queryClient, activeShopId, draft.id),
    retry: 0,
  });
}

export function usePostDeliveryMemoMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version?: number }) => postDeliveryMemo(
      token ?? "",
      id,
      { version },
      { idempotencyKey: newIdempotencyKey("DELIVERY_MEMO_POST") },
    ),
    onSuccess: (dm) => invalidateDeliveryMemoDomain(queryClient, activeShopId, dm.id),
    networkMode: "always",
    retry: 0,
  });
}

export function useConvertDeliveryMemoToSaleMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, gstRequired }: { id: string; gstRequired?: boolean }) => convertDeliveryMemoToSale(
      token ?? "",
      id,
      { gstRequired },
      { idempotencyKey: newIdempotencyKey("DELIVERY_MEMO_CONVERSION") },
    ),
    onSuccess: (_, variables) => invalidateDeliveryMemoDomain(queryClient, activeShopId, variables.id),
    networkMode: "always",
    retry: 0,
  });
}

export function useDeliveryMemoTimelineQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["delivery-memo-timeline", id],
    queryFn: () => fetchDeliveryMemoTimeline(token ?? "", id),
    enabled: Boolean(token && id),
  });
}

export function useRequestDeliveryMemoCancellationMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => createCorrectionRequest(token ?? "", {
      entityType: "DM",
      entityId: id,
      requestedChangeJson: { action: "CANCEL" },
      reason,
    }),
    onSuccess: (_, variables) => invalidateDeliveryMemoDomain(queryClient, activeShopId, variables.id),
  });
}
