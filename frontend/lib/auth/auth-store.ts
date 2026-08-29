import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ApiUser, Shop } from "../api/client";

const getTodayString = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const serverStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

interface AuthState {
  user: ApiUser | null;
  token: string | null;
  activeShopId: string | null;
  shops: Shop[];
  isAuthenticated: boolean;
  startDate: string;
  endDate: string;
  setAuth: (user: ApiUser, token: string) => void;
  setShops: (shops: Shop[]) => void;
  setActiveShopId: (shopId: string) => void;
  setPeriod: (startDate: string, endDate: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      activeShopId: null,
      shops: [],
      isAuthenticated: false,
      startDate: getTodayString(),
      endDate: getTodayString(),
      setAuth: (user, token) => set({ user, token, isAuthenticated: true }),
      setShops: (shops) => set((state) => ({ shops, activeShopId: state.activeShopId || (shops.length > 0 ? shops[0].id : null) })),
      setActiveShopId: (activeShopId) => set({ activeShopId }),
      setPeriod: (startDate, endDate) => set({ startDate, endDate }),
      logout: () => set({ user: null, token: null, activeShopId: null, shops: [], isAuthenticated: false, startDate: getTodayString(), endDate: getTodayString() }),
    }),
    { name: "shop-control-auth", storage: createJSONStorage(() => typeof window !== "undefined" ? localStorage : serverStorage) },
  ),
);
