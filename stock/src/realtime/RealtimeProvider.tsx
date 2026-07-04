import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppState, AppStateStatus } from "react-native";
import type { Socket } from "socket.io-client";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { createRealtimeSocket, type RealtimeEvent } from "./socket";
import { NotificationToast } from "../components/ui/NotificationToast";
import { getDeviceInstallationId } from "../notifications/device-identity";
import { handleDomainEvent, type DomainEvent } from "./domainEvents";
import { getDomainEventCursor } from "./domainEventCursor";
import { reconcileDomainEventsForShop } from "./domainEventReconciliation";
import {
  activateReadModelContext,
  deactivateReadModelContext,
  hydrateReadModelForShop,
} from "../local/read-model/read-model-coordinator";

/**
 * Legacy Socket.IO events for non-migrated core paths.
 * All primary domain state changes travel via the `domain:event` channel.
 */
const legacyEvents: RealtimeEvent[] = [
  "order:updated",
  "sale:updated",
  "delivery-memo:updated",
  "payment:updated",
  "cash-session:updated",
  "stock:updated",
  "daily-summary:updated",
  "shop:updated",
  "notification:created",
];

export function RealtimeProvider({ children }: PropsWithChildren) {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const [toast, setToast] = useState<{ visible: boolean; title: string; message: string; type: string }>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const invalidationMap = useMemo<Partial<Record<RealtimeEvent, Array<unknown[]>>>>(
    () => ({
      "order:updated": [["orders", activeShopId]],
      "sale:updated": [["sales", activeShopId], ["daily-summary", activeShopId]],
      "delivery-memo:updated": [["delivery-memos", activeShopId], ["daily-summary", activeShopId]],
      "payment:updated": [["payments", activeShopId], ["daily-summary", activeShopId]],
      "cash-session:updated": [["cash-session", activeShopId], ["cash-sessions", activeShopId], ["daily-summary", activeShopId]],
      "stock:updated": [["items", activeShopId], ["stock", activeShopId], ["stock-movements", activeShopId]],
      "daily-summary:updated": [["daily-summary", activeShopId]],
      "shop:updated": [["shops"]],
      "notification:created": [["notifications", activeShopId], ["rate-change-requests", activeShopId], ["correction-requests", activeShopId]],
    }),
    [activeShopId],
  );

  const showToast = (payload: any, event?: string) => {
    let cleanTitle = "NOTIFICATION";
    if (payload?.triggerEvent) {
      cleanTitle = payload.triggerEvent.replace(/_/g, " ").replace(/:/g, " ").toUpperCase();
    } else if (event) {
      cleanTitle = event.replace(/_/g, " ").replace(/:/g, " ").toUpperCase();
    }

    let cleanMessage = "New activity detected.";
    let type = "info";

    if (typeof payload?.message === "string") {
      cleanMessage = payload.message;
    } else if (payload?.message && typeof payload.message === "object") {
      cleanMessage = (payload.message as Record<string, string>).text || (payload.message as Record<string, string>).message || "New activity detected.";
    }

    const ev = (payload?.triggerEvent || event || "").toLowerCase();
    if (ev.includes("sale") || ev.includes("payment")) {
      type = "success";
    } else if (ev.includes("rate") || ev.includes("price") || ev.includes("stock") || ev.includes("inventory")) {
      type = "warning";
    } else if (ev.includes("correction") || ev.includes("mismatch") || ev.includes("bounce") || ev.includes("danger") || ev.includes("shortage")) {
      type = "danger";
    }

    if (typeof cleanMessage !== "string") {
      cleanMessage = String(cleanMessage || "New activity detected.");
    }

    setToast({ visible: true, title: cleanTitle, message: cleanMessage, type });
  };

  useEffect(() => {
    if (!token || !userId || !activeShopId) return;

    let cancelled = false;
    let socket: Socket | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let deviceIdResolved = "";

    activateReadModelContext(userId, activeShopId);
    void hydrateReadModelForShop({ userId, shopId: activeShopId, token, queryClient, reason: "bootstrap" }).catch((error) => {
      if (__DEV__) console.warn("[read-model] bootstrap failed", error);
    });

    const reconcile = () => {
      if (!token || !activeShopId || !deviceIdResolved) return;
      void reconcileDomainEventsForShop(userId, activeShopId, token, queryClient, deviceIdResolved);
    };

    const requestSocketSync = async () => {
      if (!socket?.connected) return;
      const since = await getDomainEventCursor(userId, activeShopId) ?? undefined;
      socket.emit("sync:request", { shopId: activeShopId, since });
    };

    const emitPresence = (state: AppStateStatus = AppState.currentState) => {
      if (!socket?.connected) return;
      socket.emit("presence:heartbeat", {
        shopId: activeShopId,
        state: state === "active" ? "FOREGROUND" : "BACKGROUND",
        available: true,
      });
    };

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      emitPresence(nextAppState);
      if (nextAppState === "active") {
        // App returned to foreground — request missed events from both paths
        void requestSocketSync();
        reconcile();
      }
    };

    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

    void getDeviceInstallationId().then((deviceId: string) => {
      if (cancelled) return;
      deviceIdResolved = deviceId;
      socket = createRealtimeSocket(token, deviceId);
      socketRef.current = socket;

      socket.on("connect", () => {
        socket?.emit("shop:join", { shopId: activeShopId });
        emitPresence();
        void requestSocketSync();
        reconcile();
      });

      socket.on("shop:joined", ({ shopId }: { shopId: string }) => {
        if (shopId === activeShopId) {
          reconcile();
        }
      });

      socket.on("domain:event", (event: DomainEvent) => {
	        const handled = handleDomainEvent(queryClient, event, deviceId);
	        if (event?.shopId === activeShopId) {
	          reconcile();
	        }
	        if (handled) {
          if (event.notification) {
            setToast({
              visible: true,
              title: event.notification.title || "New activity",
              message: event.notification.body || "Updates are available.",
              type: event.notification.severity === "critical" ? "danger" : (event.notification.severity ?? "info"),
            });
          }
        }
      });

      socket.on("sync:complete", () => {});

      // Legacy events for non-migrated core paths
      for (const event of legacyEvents) {
        socket.on(event, (payload?: any) => {
          for (const queryKey of invalidationMap[event] || []) {
            queryClient.invalidateQueries({ queryKey });
          }
          if (event === "notification:created" && payload) {
            showToast(payload, event);
          }
        });
      }

      heartbeatTimer = setInterval(() => emitPresence(), 25_000);
      socket.connect();
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      socket?.emit("shop:leave", { shopId: activeShopId });
      socket?.off("domain:event");
      socket?.off("sync:complete");
      socket?.off("shop:joined");
      for (const event of legacyEvents) {
        socket?.off(event);
      }
      socket?.disconnect();
      socketRef.current = null;
      deactivateReadModelContext(userId, activeShopId);
    };
  }, [activeShopId, invalidationMap, queryClient, token, userId]);

  return (
    <>
      {children}
      <NotificationToast
        visible={toast.visible}
        title={toast.title}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </>
  );
}
