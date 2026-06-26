import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://shop-api.evergreenclassic.in";

export type RealtimeEvent =
  | "domain:event"
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
  | "wa:message_failed"
  | "wa:integration_health_updated";

export function createRealtimeSocket(token: string, deviceId?: string | null): Socket {
  return io(SOCKET_URL, {
    transports: ["websocket"],
    auth: { token, deviceId },
    autoConnect: false,
  });
}
