import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DeviceEventEmitter } from "react-native";
import type { Socket } from "socket.io-client";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { createRealtimeSocket, type RealtimeEvent } from "./socket";
import { NotificationToast } from "../components/ui/NotificationToast";

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

  const invalidationMap = useMemo<Record<RealtimeEvent, Array<unknown[]>>>(
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
    }),
    [activeShopId],
  );

  const showToast = (payload: any) => {
    let cleanTitle = payload?.triggerEvent ? payload.triggerEvent.replace(/_/g, " ").replace(/:/g, " ").toUpperCase() : "NOTIFICATION";
    let cleanMessage = payload?.message || "New activity detected.";
    let type = "info";

    if (payload?.messageId && payload?.conversationId) { // WhatsApp events
      if (payload.status === "FAILED" || payload.error) {
        cleanTitle = "WHATSAPP ERROR";
        cleanMessage = payload.error || "Failed to send message.";
        type = "danger";
      } else if (payload.message && payload.message.direction === "INBOUND") {
        cleanTitle = "NEW WHATSAPP MESSAGE";
        cleanMessage = payload.message.content?.text || "Received a new message.";
        type = "info";
      } else {
        return; // Don't show toast for sent/status updates
      }
    } else {
      const ev = payload?.triggerEvent?.toLowerCase() || "";
      if (ev.includes("sale") || ev.includes("payment")) {
        type = "success";
      } else if (ev.includes("rate") || ev.includes("price") || ev.includes("stock") || ev.includes("inventory")) {
        type = "warning";
      } else if (ev.includes("correction") || ev.includes("mismatch") || ev.includes("bounce") || ev.includes("danger") || ev.includes("shortage")) {
        type = "danger";
      }
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

    const socket = createRealtimeSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("shop:join", { shopId: activeShopId });
    });

    for (const event of realtimeEvents) {
      socket.on(event, (payload?: any) => {
        for (const queryKey of invalidationMap[event]) {
          // If payload contains conversationId, invalidate specific message cache
          if (payload?.conversationId && queryKey[0] === "wa-messages") {
            queryClient.invalidateQueries({ queryKey: ["wa-messages", payload.conversationId] });
          } else {
            queryClient.invalidateQueries({ queryKey });
          }
        }
        if ((event === "notification:created" || event === "wa:message_received" || event === "wa:message_failed") && payload) {
          showToast(payload);
        }
        if (event.startsWith("wa:")) {
          DeviceEventEmitter.emit(event, payload);
        }
      });
    }


    socket.connect();

    return () => {
      socket.emit("shop:leave", { shopId: activeShopId });
      for (const event of realtimeEvents) {
        socket.off(event);
      }
      socket.disconnect();
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
