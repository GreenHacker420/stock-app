import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { apiRequest, fetchNotifications, Notification } from "../api/client";
import { refreshReadModelDomains } from "../local/read-model/read-model-coordinator";

export const GENERIC_APPROVAL_SUPPORTED_TYPES = new Set([
  "STOCK_ENTRY",
  "STOCK_ADJUSTMENT",
  "STOCK_REQUEST",
  "DAMAGE_ENTRY",
  "RATE_CHANGE",
  "PRICE_APPROVAL",
  "CANCEL_SALE",
  "CANCEL_DM",
]);

export function usePendingVerificationsQuery() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const isOwner = useAuthStore((state) => state.user?.role === "OWNER");
  return useQuery({
    queryKey: ["verifications", activeShopId],
    queryFn: () => apiRequest<any[]>(`/approvals?status=PENDING&shopId=${activeShopId}`, { token }),
    enabled: !!token && !!activeShopId && isOwner,
  });
}

export function useProcessVerificationMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes, type }: { id: string; status: "APPROVED" | "REJECTED"; notes?: string; type?: string }) => {
      if (type && !GENERIC_APPROVAL_SUPPORTED_TYPES.has(type)) {
        throw new Error("Open the specific verification screen for this approval type.");
      }
      return apiRequest(`/approvals/${id}/respond`, {
        method: "POST",
        token,
        body: JSON.stringify({ status, rejectedReason: notes }),
      });
    },
    onSuccess: () => {
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
      queryClient.invalidateQueries({ queryKey: ["expenses", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["item-stock"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["read-models"] });
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

      // 2. If STAFF, query /notifications (since /approvals is 403 for Staff)
      try {
        const notifs = await fetchNotifications(token, { shopId: activeShopId });
        const requests = (notifs || []).filter((n: Notification) => {
          const ev = (n.triggerEvent || "").toUpperCase();
          const msg = (n.message || "").toLowerCase();
          const ent = (n.entityType || "").toUpperCase();

          return (
            ev.includes("STOCK") ||
            ev.includes("REQUEST") ||
            ev.includes("APPROVAL") ||
            ev.includes("CORRECTION") ||
            ev.includes("RATE") ||
            ent.includes("STOCK") ||
            ent.includes("APPROVAL") ||
            msg.includes("stock") ||
            msg.includes("request") ||
            msg.includes("approval") ||
            msg.includes("restock") ||
            msg.includes("bulk")
          );
        }).map((n: Notification) => {
          const msgLower = (n.message || "").toLowerCase();
          const isApproved = msgLower.includes("approved") || n.triggerEvent === "APPROVAL_RESOLVED";
          const isRejected = msgLower.includes("rejected");
          const status = isApproved ? "APPROVED" : isRejected ? "REJECTED" : "PENDING";

          // Extract request type from message brackets e.g. "(STOCK_ENTRY)" -> "STOCK_ENTRY"
          let requestType = "STOCK_ENTRY";
          const bracketMatch = n.message.match(/\(([A-Z_]+)\)/);
          if (bracketMatch && bracketMatch[1]) {
            requestType = bracketMatch[1];
          } else if (n.triggerEvent && n.triggerEvent !== "APPROVAL_REQUESTED" && n.triggerEvent !== "APPROVAL_RESOLVED") {
            requestType = n.triggerEvent;
          }

          return {
            id: n.id,
            type: requestType,
            action: requestType,
            status,
            createdAt: n.createdAt,
            reason: n.message,
            payloadJson: (n as any).metadata || (n as any).payloadJson || (n as any).requestedChangeJson || {},
            requestedBy: { name: user?.name || "Staff" },
          };
        });

        return requests;
      } catch (e) {
        if (__DEV__) console.warn("[useStaffApprovalsQuery] Error fetching staff notifications", e);
        return [];
      }
    },
    enabled: !!token && !!activeShopId,
    staleTime: 0,
  });
}
