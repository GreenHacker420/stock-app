import { PropsWithChildren, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { createRealtimeSocket, type RealtimeEvent } from "./socket";

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

  useEffect(() => {
    if (!token || !activeShopId) return;

    const socket = createRealtimeSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("shop:join", { shopId: activeShopId });
    });

    for (const event of realtimeEvents) {
      socket.on(event, () => {
        for (const queryKey of invalidationMap[event]) {
          queryClient.invalidateQueries({ queryKey });
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

  return <>{children}</>;
}
