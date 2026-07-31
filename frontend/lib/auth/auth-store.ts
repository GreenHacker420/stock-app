import { create } from "zustand";
import { ApiUser, Shop } from "../api/client";

interface AuthState {
  user: ApiUser | null;
  token: string | null;
  activeShopId: string | null;
  shops: Shop[];
  isAuthenticated: boolean;
  setAuth: (user: ApiUser, token: string) => void;
  setShops: (shops: Shop[]) => void;
  setActiveShopId: (shopId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  activeShopId: null,
  shops: [],
  isAuthenticated: false,
  setAuth: (user, token) => set({ user, token, isAuthenticated: true }),
  setShops: (shops) =>
    set((state) => ({
      shops,
      activeShopId: state.activeShopId || (shops.length > 0 ? shops[0].id : null),
    })),
  setActiveShopId: (activeShopId) => set({ activeShopId }),
  logout: () => set({ user: null, token: null, activeShopId: null, shops: [], isAuthenticated: false }),
}));
