import { create } from "zustand";
import { ApiUser, fetchMe, login } from "../api/client";
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

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isBootstrapping: true,
  async signIn(identifier, password) {
    const result = await login(identifier, password);
    await setToken(TOKEN_KEY, result.token);
    set({ token: result.token, user: result.user });
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
    set({ token: null, user: null, isBootstrapping: false });
  },
}));
