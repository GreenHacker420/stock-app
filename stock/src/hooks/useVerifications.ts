import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { apiRequest } from "../api/client";
import { refreshReadModelDomains } from "../local/read-model/read-model-coordinator";

export const GENERIC_APPROVAL_SUPPORTED_TYPES = new Set([
  "ITEM_CREATION",
  "STOCK_ENTRY",
  "STOCK_ADJUSTMENT",
  "STOCK_REQUEST",
  "DAMAGE_ENTRY",
  "RATE_CHANGE",
  "PRICE_APPROVAL",
  "CANCEL_SALE",
  "CANCEL_DM",
  "SALE_CORRECTION",
  "SALE_CANCELLATION",
  "DM_CANCELLATION",
  "PAYMENT_CORRECTION",
]);

import { mmkvStorage } from "../auth/mmkv-storage";

function verificationsSnapshotKey(shopId: string, role: string) {
  return `verifications_snapshot_${shopId}_${role}`;
}

function readVerificationsSnapshot(shopId: string, role: string) {
  try {
    const raw = mmkvStorage.getItem(verificationsSnapshotKey(shopId, role));
    if (!raw || typeof raw !== "string") return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.data) ? parsed : null;
  } catch {
    return null;
  }
}

function writeVerificationsSnapshot(shopId: string, role: string, data: any[]) {
  try {
    mmkvStorage.setItem(
      verificationsSnapshotKey(shopId, role),
      JSON.stringify({ shopId, role, savedAt: Date.now(), data }),
    );
  } catch {
    // Graceful fallback
  }
}

export function usePendingVerificationsQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const isOwner = useAuthStore((state) => state.user?.role === "OWNER");
  return useQuery({
    queryKey: ["verifications", activeShopId],
    queryFn: async () => {
      const data = await apiRequest<any[]>(`/approvals?status=PENDING&shopId=${activeShopId}`, { token });
      if (activeShopId) writeVerificationsSnapshot(activeShopId, "OWNER", data);
      return data;
    },
    initialData: () => activeShopId ? readVerificationsSnapshot(activeShopId, "OWNER")?.data : undefined,
    initialDataUpdatedAt: () => activeShopId ? readVerificationsSnapshot(activeShopId, "OWNER")?.savedAt : undefined,
    enabled: !!token && !!activeShopId && isOwner,
  });
}

export function useProcessVerificationMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: "APPROVED" | "REJECTED"; notes?: string; type?: string }) => {
      return apiRequest(`/approvals/${id}/respond`, {
        method: "POST",
        token,
        body: JSON.stringify({ status, rejectedReason: notes }),
      });
    },
    onMutate: async ({ id }) => {
      // Optimistic cache update: cancel outgoing queries and remove item immediately for snappy UX
      await queryClient.cancelQueries({ queryKey: ["verifications", activeShopId] });
      const previousVerifications = queryClient.getQueryData<any[]>(["verifications", activeShopId]);

      if (previousVerifications && activeShopId) {
        const updated = previousVerifications.filter((item) => item.id !== id);
        queryClient.setQueryData(["verifications", activeShopId], updated);
        writeVerificationsSnapshot(activeShopId, "OWNER", updated);
      }

      return { previousVerifications };
    },
    onError: (_err, _variables, context) => {
      // Rollback cache on error
      if (context?.previousVerifications && activeShopId) {
        queryClient.setQueryData(["verifications", activeShopId], context.previousVerifications);
        writeVerificationsSnapshot(activeShopId, "OWNER", context.previousVerifications);
      }
    },
    onSettled: () => {
      const userId = useAuthStore.getState().user?.id;
      if (userId && activeShopId && token) {
        void refreshReadModelDomains(
          {
            userId,
            shopId: activeShopId,
            token,
            queryClient,
            reason: "realtime",
          },
          ["items"]
        );
      }
      queryClient.invalidateQueries({ queryKey: ["verifications", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["staff-verifications", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}

export function useBulkProcessVerificationsMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ids,
      status,
      notes,
    }: {
      ids: string[];
      status: "APPROVED" | "REJECTED";
      notes?: string;
    }) => {
      return apiRequest<{
        total: number;
        successCount: number;
        failureCount: number;
        results: Array<{ id: string; success: boolean; error?: string }>;
      }>(`/approvals/bulk-respond`, {
        method: "POST",
        token,
        body: JSON.stringify({ ids, status, rejectedReason: notes }),
      });
    },
    onMutate: async ({ ids }) => {
      // Optimistic cache update for batch approvals
      await queryClient.cancelQueries({ queryKey: ["verifications", activeShopId] });
      const previousVerifications = queryClient.getQueryData<any[]>(["verifications", activeShopId]);

      if (previousVerifications && activeShopId) {
        const idSet = new Set(ids);
        const updated = previousVerifications.filter((item) => !idSet.has(item.id));
        queryClient.setQueryData(["verifications", activeShopId], updated);
        writeVerificationsSnapshot(activeShopId, "OWNER", updated);
      }

      return { previousVerifications };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousVerifications && activeShopId) {
        queryClient.setQueryData(["verifications", activeShopId], context.previousVerifications);
        writeVerificationsSnapshot(activeShopId, "OWNER", context.previousVerifications);
      }
    },
    onSettled: () => {
      const userId = useAuthStore.getState().user?.id;
      if (userId && activeShopId && token) {
        void refreshReadModelDomains(
          {
            userId,
            shopId: activeShopId,
            token,
            queryClient,
            reason: "realtime",
          },
          ["items"]
        );
      }
      queryClient.invalidateQueries({ queryKey: ["verifications", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["staff-verifications", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}

export function useStaffApprovalsQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";

  return useQuery({
    queryKey: ["staff-verifications", activeShopId, user?.id],
    queryFn: async () => {
      if (!token || !activeShopId) return [];

      // 1. If OWNER, query /approvals
      if (isOwner) {
        try {
          return await apiRequest<any[]>(`/approvals?status=PENDING&shopId=${activeShopId}`, { token });
        } catch {
          return [];
        }
      }

      // 2. Staff can read only their own approval requests.
      try {
        const requests = await apiRequest<any[]>(`/approvals?shopId=${activeShopId}`, { token });

        if (activeShopId) writeVerificationsSnapshot(activeShopId, user?.role || "STAFF", requests);
        return requests;
      } catch (e) {
        if (__DEV__) console.warn("[useStaffApprovalsQuery] Error fetching staff notifications", e);
        return [];
      }
    },
    initialData: () => activeShopId ? readVerificationsSnapshot(activeShopId, user?.role || "STAFF")?.data : undefined,
    initialDataUpdatedAt: () => activeShopId ? readVerificationsSnapshot(activeShopId, user?.role || "STAFF")?.savedAt : undefined,
    enabled: !!token && !!activeShopId,
    staleTime: 0,
  });
}
