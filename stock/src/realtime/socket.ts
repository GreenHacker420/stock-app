import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://shop-api.evergreenclassic.in";

export type RealtimeEvent =
  | "order:updated"
  | "sale:updated"
  | "delivery-memo:updated"
  | "payment:updated"
  | "cash-session:updated"
  | "stock:updated"
  | "daily-summary:updated"
  | "shop:updated"
  | "notification:created"
  | "wa:message_received"
  | "wa:message_sent"
  | "wa:status_updated"
  | "wa:message_failed";

export function createRealtimeSocket(token: string): Socket {
  return io(SOCKET_URL, {
    transports: ["websocket"],
    auth: { token },
    autoConnect: false,
  });
}
