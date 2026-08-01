import { io, Socket } from "socket.io-client";
import { env } from "../env";
import { QueryClient } from "@tanstack/react-query";

let socket: Socket | null = null;

export function getSocketInstance(): Socket {
  if (!socket) {
    socket = io(env.NEXT_PUBLIC_SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function disconnectRealtimeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function initRealtimeSocket(queryClient: QueryClient, shopId?: string | null) {
  const instance = getSocketInstance();

  if (!instance.connected) {
    instance.connect();
  }

  if (shopId) {
    instance.emit("join_shop", { shopId });
  }

  instance.off("sale_created");
  instance.off("stock_updated");
  instance.off("payment_recorded");
  instance.off("approval_requested");

  instance.on("sale_created", () => {
    queryClient.invalidateQueries({ queryKey: ["sales"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  });

  instance.on("stock_updated", () => {
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  });

  instance.on("payment_recorded", () => {
    queryClient.invalidateQueries({ queryKey: ["payments"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  });

  instance.on("approval_requested", () => {
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  });

  return () => {
    instance.off("sale_created");
    instance.off("stock_updated");
    instance.off("payment_recorded");
    instance.off("approval_requested");
  };
}
