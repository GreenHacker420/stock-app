import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppState, DeviceEventEmitter } from "react-native";
import type { Socket } from "socket.io-client";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { createRealtimeSocket, type RealtimeEvent } from "./socket";
import { NotificationToast } from "../components/ui/NotificationToast";
import { getDeviceInstallationId } from "../notifications/device-identity";
import { handleDomainEvent, type DomainEvent } from "./domainEvents";

const realtimeEvents: RealtimeEvent[] = [
  "order:updated",
  "sale:updated",
  "delivery-memo:updated",
  "payment:updated",
  "cash-session:updated",
  "stock:updated",
  "daily-summary:updated",
  "shop:updated",
  "notification:created",
  "wa:message_received",
  "wa:message_sent",
  "wa:status_updated",
  "wa:message_failed",
  "wa:integration_health_updated",
];

export function RealtimeProvider({ children }: PropsWithChildren) {
  const token = useAuthStore((state) => state.token);
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
      "wa:message_received": [["wa-messages"], ["wa-conversations"]],
      "wa:message_sent": [["wa-messages"], ["wa-conversations"]],
      "wa:status_updated": [["wa-messages"]],
      "wa:message_failed": [["wa-messages"]],
      "wa:integration_health_updated": [["wa-integration-health", activeShopId]],
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

    const isWhatsApp = event?.startsWith("wa:") || (payload?.conversationId && (payload?.messageId || payload?.message));

    if (isWhatsApp) {
      if (payload.status === "FAILED" || payload.error) {
        cleanTitle = "WHATSAPP ERROR";
        cleanMessage = payload.error || "Failed to send message.";
        type = "danger";
      } else if (payload.message && payload.message.direction === "INBOUND") {
        cleanTitle = "NEW WHATSAPP MESSAGE";
        const msgContent = payload.message.content;
        if (typeof msgContent === "string") {
          cleanMessage = msgContent;
        } else if (msgContent && typeof msgContent === "object") {
          cleanMessage = msgContent.text || "Received a new message.";
        } else {
          cleanMessage = "Received a new message.";
        }
        type = "info";
      } else {
        return; // Don't show toast for sent/status updates
      }
    } else {
      if (typeof payload?.message === "string") {
        cleanMessage = payload.message;
      } else if (payload?.message && typeof payload.message === "object") {
        cleanMessage = payload.message.text || payload.message.message || "New activity detected.";
      }

      const ev = (payload?.triggerEvent || event || "").toLowerCase();
      if (ev.includes("sale") || ev.includes("payment")) {
        type = "success";
      } else if (ev.includes("rate") || ev.includes("price") || ev.includes("stock") || ev.includes("inventory")) {
        type = "warning";
      } else if (ev.includes("correction") || ev.includes("mismatch") || ev.includes("bounce") || ev.includes("danger") || ev.includes("shortage")) {
        type = "danger";
      }
    }

    if (typeof cleanMessage !== "string") {
      cleanMessage = String(cleanMessage || "New activity detected.");
    }

    setToast({
      visible: true,
      title: cleanTitle,
      message: cleanMessage,
      type,
    });
  };

  useEffect(() => {
    if (!token || !activeShopId) return;

    let cancelled = false;
    let socket: Socket | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const emitPresence = (state = AppState.currentState) => {
      if (!socket?.connected) return;
      socket.emit("presence:heartbeat", {
        shopId: activeShopId,
        state: state === "active" ? "FOREGROUND" : "BACKGROUND",
        available: true,
      });
    };

    const appStateSubscription = AppState.addEventListener("change", emitPresence);

    void getDeviceInstallationId().then((deviceId) => {
      if (cancelled) return;
      socket = createRealtimeSocket(token, deviceId);
      socketRef.current = socket;

      let lastReconnectTime = 0;
      socket.on("connect", () => {
        socket?.emit("shop:join", { shopId: activeShopId });
        emitPresence();

        const now = Date.now();
        if (now - lastReconnectTime > 10_000) {
          lastReconnectTime = now;
          queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
          queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
          queryClient.invalidateQueries({ queryKey: ["current-stock", activeShopId] });
          queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
          queryClient.invalidateQueries({ queryKey: ["delivery-memos", activeShopId] });
          queryClient.invalidateQueries({ queryKey: ["current-cash-session", activeShopId] });
          queryClient.invalidateQueries({ queryKey: ["owner-dashboard", { shopId: activeShopId }] });
          queryClient.invalidateQueries({ queryKey: ["notifications", { shopId: activeShopId }] });
        }
      });

      socket.on("domain:event", (event: DomainEvent) => {
        const handled = handleDomainEvent(queryClient, event, deviceId);
        if (handled && event.notification) {
          setToast({
            visible: true,
            title: event.notification.title || "New activity",
            message: event.notification.body || "Updates are available.",
            type: event.notification.severity === "critical" ? "danger" : event.notification.severity || "info",
          });
        }
      });

      for (const event of realtimeEvents) {
        socket.on(event, (payload?: any) => {
          for (const queryKey of invalidationMap[event] || []) {
            if (payload?.conversationId && queryKey[0] === "wa-messages") {
              queryClient.invalidateQueries({ queryKey: ["wa-messages", payload.conversationId] });
            } else {
              queryClient.invalidateQueries({ queryKey });
            }
          }
          if ((event === "notification:created" || event === "wa:message_received" || event === "wa:message_failed") && payload) {
            showToast(payload, event);
          }
          if (event.startsWith("wa:")) {
            DeviceEventEmitter.emit(event, payload);
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
      for (const event of realtimeEvents) {
        socket?.off(event);
      }
      socket?.off("domain:event");
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [activeShopId, invalidationMap, queryClient, token]);

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
