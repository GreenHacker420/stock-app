import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

interface ShopState {
  activeShopId: string | null;
  lastUsedShopId: string | null;
  lastUsedShopByUserId: Record<string, string>;
  setActiveShopId: (id: string | null, userId?: string | null) => void;
  getLastUsedShopIdForUser: (userId?: string | null) => string | null;
  clearActiveShop: () => void;
}

export const useShopStore = create<ShopState>()(
  persist(
    (set, get): ShopState => ({
      activeShopId: null,
      lastUsedShopId: null,
      lastUsedShopByUserId: {},
      setActiveShopId: (id, userId) =>
        set((state) => ({
          activeShopId: id,
          lastUsedShopId: id ?? state.lastUsedShopId,
          lastUsedShopByUserId:
            id && userId
              ? { ...state.lastUsedShopByUserId, [userId]: id }
              : state.lastUsedShopByUserId,
        })),
      getLastUsedShopIdForUser: (userId): string | null => {
        const state = get();
        if (userId && state.lastUsedShopByUserId[userId]) {
          return state.lastUsedShopByUserId[userId];
        }
        return state.lastUsedShopId;
      },
      clearActiveShop: () => set({ activeShopId: null }),
    }),
    {
      name: "shop-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
