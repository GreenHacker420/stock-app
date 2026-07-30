import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, Notification } from "../api/client";
import { mmkvStorage } from "../auth/mmkv-storage";
import { useOwnerDashboardQuery } from "./useDashboard";
import { usePendingVerificationsQuery, useStaffApprovalsQuery } from "./useVerifications";

type NotificationSnapshot = {
  shopId: string;
  unreadOnly: boolean;
  savedAt: number;
  data: Notification[];
};

function notificationSnapshotKey(shopId: string, unreadOnly: boolean) {
  return `notification_snapshot_${shopId}_${unreadOnly ? "unread" : "all"}`;
}

function readNotificationSnapshot(shopId: string, unreadOnly: boolean) {
  try {
    const raw = mmkvStorage.getItem(notificationSnapshotKey(shopId, unreadOnly));
    if (!raw || typeof raw !== "string") return null;
    const snapshot = JSON.parse(raw) as NotificationSnapshot;
    return snapshot?.shopId === shopId
      && snapshot?.unreadOnly === unreadOnly
      && Array.isArray(snapshot.data)
      ? snapshot
      : null;
  } catch {
    return null;
  }
}

function writeNotificationSnapshot(shopId: string, unreadOnly: boolean, data: Notification[]) {
  try {
    mmkvStorage.setItem(
      notificationSnapshotKey(shopId, unreadOnly),
      JSON.stringify({ shopId, unreadOnly, savedAt: Date.now(), data } satisfies NotificationSnapshot),
    );
  } catch {
    // The server remains authoritative when the fast snapshot cannot be written.
  }
}

export function useNotificationsQuery(options: { unread?: boolean } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const unreadOnly = options.unread === true;
  return useQuery({
    queryKey: queryKeys.notifications({ shopId: activeShopId ?? undefined, unread: options.unread }),
    queryFn: async () => {
      const data = await fetchNotifications(token ?? "", {
        shopId: activeShopId ?? undefined,
        unread: options.unread,
      });
      if (activeShopId) writeNotificationSnapshot(activeShopId, unreadOnly, data);
      return data;
    },
    initialData: () => activeShopId
      ? readNotificationSnapshot(activeShopId, unreadOnly)?.data
      : undefined,
    initialDataUpdatedAt: () => activeShopId
      ? readNotificationSnapshot(activeShopId, unreadOnly)?.savedAt
      : undefined,
    enabled: !!token,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useMarkNotificationReadMutation(queryOptions: { unread?: boolean } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  const queryKey = queryKeys.notifications({ shopId: activeShopId ?? undefined, unread: queryOptions.unread });

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(token ?? "", id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previousNotifications = queryClient.getQueryData<Notification[]>(queryKey);

      if (previousNotifications) {
        queryClient.setQueryData<Notification[]>(
          queryKey,
          previousNotifications.map((notif) =>
            notif.id === id ? { ...notif, isRead: true } : notif
          )
        );
      }

      return { previousNotifications };
    },
    onError: (_err, _id, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData<Notification[]>(queryKey, context.previousNotifications);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}

export function useMarkAllNotificationsReadMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(token ?? "", activeShopId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}

export function useAlertsBadgeCount() {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";

  const dashboardQuery = useOwnerDashboardQuery({ enabled: isOwner && !!activeShopId });
  const pendingVerificationsQuery = usePendingVerificationsQuery();
  const staffApprovalsQuery = useStaffApprovalsQuery();
  const notificationsQuery = useNotificationsQuery();

  return useMemo(() => {
    if (!activeShopId) return 0;

    const unreadNotifsCount = (notificationsQuery.data ?? []).filter((n) => !n.isRead).length;

    if (isOwner) {
      const dashboard = dashboardQuery.data as any;
      const verifications = pendingVerificationsQuery.data?.length ?? dashboard?.pendingVerifications ?? 0;
      const gstPending = dashboard?.gstInvoicesPendingCount ?? 0;
      const paymentsPending = dashboard?.paymentVerificationPending ?? 0;
      const cashMismatch = dashboard?.cashMismatch ?? 0;
      const corrections = dashboard?.correctionRequests ?? 0;

      // Note: Low stock (dashboard?.lowStockAlerts) is explicitly excluded per user request.
      return verifications + gstPending + paymentsPending + cashMismatch + corrections + unreadNotifsCount;
    } else {
      const staffRequestsCount = (staffApprovalsQuery.data ?? []).filter((r: any) => r.status === "PENDING").length;
      return staffRequestsCount + unreadNotifsCount;
    }
  }, [
    activeShopId,
    isOwner,
    dashboardQuery.data,
    pendingVerificationsQuery.data,
    staffApprovalsQuery.data,
    notificationsQuery.data,
  ]);
}
