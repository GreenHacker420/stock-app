import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, Notification } from "../api/client";

export function useNotificationsQuery(options: { unread?: boolean } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.notifications({ shopId: activeShopId ?? undefined, unread: options.unread }),
    queryFn: () => fetchNotifications(token ?? "", { shopId: activeShopId ?? undefined, unread: options.unread }),
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
