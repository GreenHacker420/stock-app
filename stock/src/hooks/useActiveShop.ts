import { useCallback, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { Shop } from "../api/client";
import { useShopsQuery } from "./useShops";
import { resetReconcileThrottle } from "../realtime/domainEventReconciliation";

export function requireActiveShopId(shopId?: string | null): string {
  if (!shopId) {
    throw new Error("Select a shop before continuing.");
  }
  return shopId;
}

export function useSwitchActiveShop() {
  const user = useAuthStore((state) => state.user);
  const setActiveShopId = useShopStore((state) => state.setActiveShopId);
  const queryClient = useQueryClient();

  return useCallback(
    (shopId: string | null) => {
      const previousShopId = useShopStore.getState().activeShopId;
      if (previousShopId === shopId) return;

      setActiveShopId(shopId, user?.id);
      if (shopId) {
        resetReconcileThrottle(shopId);
      }
      queryClient.invalidateQueries();
    },
    [queryClient, setActiveShopId, user?.id],
  );
}

export function pickAccessibleShop(
  shops: Shop[],
  activeShopId: string | null,
  lastUsedShopId: string | null,
): string | null {
  if (shops.length === 0) return null;
  if (activeShopId && shops.some((shop) => shop.id === activeShopId)) return activeShopId;
  if (lastUsedShopId && shops.some((shop) => shop.id === lastUsedShopId)) return lastUsedShopId;
  return shops[0]?.id ?? null;
}

export function useEnsureActiveShop() {
  const user = useAuthStore((state) => state.user);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const getLastUsedShopIdForUser = useShopStore((state) => state.getLastUsedShopIdForUser);
  const switchActiveShop = useSwitchActiveShop();
  const shopsQuery = useShopsQuery();

  const selectedShop = useMemo(
    () => shopsQuery.data?.find((shop) => shop.id === activeShopId) ?? null,
    [activeShopId, shopsQuery.data],
  );

  useEffect(() => {
    if (!user || !shopsQuery.data) return;
    const lastUsedShopId = getLastUsedShopIdForUser(user.id);
    const nextShopId = pickAccessibleShop(shopsQuery.data, activeShopId, lastUsedShopId);

    if (nextShopId !== activeShopId) {
      switchActiveShop(nextShopId);
    }
  }, [activeShopId, getLastUsedShopIdForUser, shopsQuery.data, switchActiveShop, user]);

  return {
    activeShopId,
    selectedShop,
    shops: shopsQuery.data ?? [],
    shopsQuery,
    switchActiveShop,
  };
}
