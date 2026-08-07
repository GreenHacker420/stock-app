import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useShopStore } from "../auth/shop-store";
import { processLedgerMutationQueue } from "../offline/ledgerMutationProcessor";
import { queryClient } from "../query/queryClient";


export function LedgerOfflineSync() {
  const shopId = useShopStore((s) => s.activeShopId);

  useEffect(() => {
    if (!shopId) return;

    const run = async () => {
      try {
        const result = await processLedgerMutationQueue(shopId);
        if (result.confirmed > 0) {
          queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
          queryClient.invalidateQueries({ queryKey: ["customer-ledger-summary"] });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        }
      } catch (err) {
        console.warn("[LedgerOfflineSync] queue processing failed", err);
      }
    };

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      if (online) void run();
    });

    void NetInfo.fetch().then((state) => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      if (online) void run();
    });

    return () => unsubscribe();
  }, [shopId]);

  return null;
}
