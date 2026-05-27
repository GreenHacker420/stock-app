import { create, type StoreApi, type UseBoundStore } from "zustand";
import { ApiUser, fetchMe, login } from "../api/client";
import { useShopStore } from "./shop-store";
import { deleteToken, getToken, setToken } from "./token-storage";

const TOKEN_KEY = "shopcontrol_token";

type AuthState = {
  token: string | null;
  user: ApiUser | null;
  isBootstrapping: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

type AuthStore = UseBoundStore<StoreApi<AuthState>>;

const globalAuthStore = globalThis as typeof globalThis & {
  __shopControlAuthStore?: AuthStore;
};

function createAuthStore() {
  return create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isBootstrapping: true,
  async signIn(identifier, password) {
    const result = await login(identifier, password);
    await setToken(TOKEN_KEY, result.token);
    set({ token: result.token, user: result.user, isBootstrapping: false });
  },
  async restoreSession() {
    try {
      const token = await getToken(TOKEN_KEY);
      if (!token) {
        set({ token: null, user: null, isBootstrapping: false });
        return;
      }

      const user = await fetchMe(token);
      set({ token, user, isBootstrapping: false });
    } catch {
      await get().signOut();
      set({ isBootstrapping: false });
    }
  },
  async signOut() {
    await deleteToken(TOKEN_KEY);
    useShopStore.getState().setActiveShopId(null);
    set({ token: null, user: null, isBootstrapping: false });
  },
}));
}

export const useAuthStore = globalAuthStore.__shopControlAuthStore ?? createAuthStore();

globalAuthStore.__shopControlAuthStore = useAuthStore;
