import { create, type StoreApi, type UseBoundStore } from "zustand";
import * as Crypto from "expo-crypto";
import { ApiUser, fetchMe, login } from "../api/client";
import { useShopStore } from "./shop-store";
import { deleteToken, getToken, setToken } from "./token-storage";

const TOKEN_KEY = "shopcontrol_token";
const QUICK_TOKEN_KEY = "shopcontrol_quick_token";
const LAST_IDENTIFIER_KEY = "shopcontrol_last_identifier";
const QUICK_PIN_HASH_KEY = "shopcontrol_quick_pin_hash";

type AuthState = {
  token: string | null;
  user: ApiUser | null;
  isBootstrapping: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signInWithSavedToken: (pin?: string) => Promise<void>;
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
    await setToken(QUICK_TOKEN_KEY, result.token);
    await setToken(LAST_IDENTIFIER_KEY, identifier);
    await setToken(QUICK_PIN_HASH_KEY, await hashQuickPin(identifier, password));
    set({ token: result.token, user: result.user, isBootstrapping: false });
  },
  async signInWithSavedToken(pin) {
    const token = await getToken(QUICK_TOKEN_KEY);
    if (!token) {
      throw new Error("No saved login found. Sign in once with mobile and PIN first.");
    }
    if (pin) {
      const identifier = await getToken(LAST_IDENTIFIER_KEY);
      const savedHash = await getToken(QUICK_PIN_HASH_KEY);
      if (!identifier || !savedHash || savedHash !== (await hashQuickPin(identifier, pin))) {
        throw new Error("Invalid quick login PIN.");
      }
    }
    const user = await fetchMe(token);
    await setToken(TOKEN_KEY, token);
    set({ token, user, isBootstrapping: false });
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

async function hashQuickPin(identifier: string, pin: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${identifier.trim()}:${pin}`);
}

export const useAuthStore = globalAuthStore.__shopControlAuthStore ?? createAuthStore();

globalAuthStore.__shopControlAuthStore = useAuthStore;
