import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface ShopState {
  activeShopId: string | null;
  setActiveShopId: (id: string | null) => void;
}

export const useShopStore = create<ShopState>()(
  persist(
    (set) => ({
      activeShopId: null,
      setActiveShopId: (id) => set({ activeShopId: id }),
    }),
    {
      name: "shop-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
