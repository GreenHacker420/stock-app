import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

interface ShopState {
  activeShopId: string | null;
  lastUsedShopId: string | null;
  setActiveShopId: (id: string | null) => void;
}

export const useShopStore = create<ShopState>()(
  persist(
    (set) => ({
      activeShopId: null,
      lastUsedShopId: null,
      setActiveShopId: (id) => set((state) => ({ activeShopId: id, lastUsedShopId: id ?? state.lastUsedShopId })),
    }),
    {
      name: "shop-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
