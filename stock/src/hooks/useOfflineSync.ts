import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { runOfflineSyncOnce } from "../local/syncWorker";
import { useNetworkStatus } from "./useNetworkStatus";

export function useOfflineSync() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const wasOnline = useRef<boolean | null>(null);

  const runSync = async () => {
    if (!token || !activeShopId || !isOnline) return;
    const result = await runOfflineSyncOnce({ shopId: activeShopId, token });
    if (!result.skipped && result.processed > 0) {
      queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["current-cash-session", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["cash-sessions", activeShopId] });
    }
  };

  useEffect(() => {
    const becameOnline = wasOnline.current === false && isOnline;
    const firstOnline = wasOnline.current === null && isOnline;
    wasOnline.current = isOnline;
    if (becameOnline || firstOnline) {
      runSync().catch((error) => {
        if (__DEV__) console.warn("[offline-sync] failed", error);
      });
    }
  }, [activeShopId, isOnline, token]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runSync().catch((error) => {
          if (__DEV__) console.warn("[offline-sync] foreground sync failed", error);
        });
      }
    });
    return () => subscription.remove();
  }, [activeShopId, isOnline, token]);

  return { runSync };
}
