import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useShopStore } from "../auth/shop-store";
import { processLedgerMutationQueue } from "../offline/ledgerMutationProcessor";
import { queryClient } from "../query/queryClient";
import { invalidateAssetCache } from "../hooks/useAssetCache";


export function LedgerOfflineSync() {
  const shopId = useShopStore((s) => s.activeShopId);

  useEffect(() => {
    if (!shopId) return;

    const run = async () => {
      try {
        const result = await processLedgerMutationQueue(shopId);
        if (result.confirmed > 0) {
          invalidateAssetCache(shopId);
          queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
          queryClient.invalidateQueries({ queryKey: ["customer-ledger-summary"] });
          queryClient.invalidateQueries({ queryKey: ["customer"] });
          queryClient.invalidateQueries({ queryKey: ["customer-outstanding"] });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
          queryClient.invalidateQueries({ queryKey: ["storage-objects"] });
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
