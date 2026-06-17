import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
    }),
    [activeShopId],
  );

  const showToast = (payload: any) => {
    const triggerEvent = payload?.triggerEvent || "notification";
    const cleanTitle = triggerEvent.replace(/_/g, " ").replace(/:/g, " ").toUpperCase();
    const cleanMessage = payload?.message || "New activity detected.";
    
    let type = "info";
    const ev = triggerEvent.toLowerCase();
    if (ev.includes("sale") || ev.includes("payment")) {
      type = "success";
    } else if (ev.includes("rate") || ev.includes("price") || ev.includes("stock") || ev.includes("inventory")) {
      type = "warning";
    } else if (ev.includes("correction") || ev.includes("mismatch") || ev.includes("bounce") || ev.includes("danger") || ev.includes("shortage")) {
      type = "danger";
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
          queryClient.invalidateQueries({ queryKey });
        }
        if (event === "notification:created" && payload) {
          showToast(payload);
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
