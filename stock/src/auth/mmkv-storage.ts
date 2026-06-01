import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";
import { StateStorage } from "zustand/middleware";
import { Persister } from "@tanstack/react-query-persist-client";

interface SimpleStorage {
  set: (key: string, value: string) => void;
  getString: (key: string) => string | undefined;
  remove: (key: string) => boolean;
}

let storage: SimpleStorage;

if (Platform.OS === "web") {
  storage = {
    set: (key: string, value: string) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, value);
      }
    },
    getString: (key: string) => {
      if (typeof window !== "undefined") {
        return window.localStorage.getItem(key) ?? undefined;
      }
      return undefined;
    },
    remove: (key: string) => {
      if (typeof window !== "undefined") {
        const existed = window.localStorage.getItem(key) !== null;
        window.localStorage.removeItem(key);
        return existed;
      }
      return false;
    },
  };
} else {
  storage = createMMKV({
    id: "stock-app-storage",
  });
}

export const mmkvStorage: StateStorage = {
  setItem: (key: string, value: string): void => {
    storage.set(key, value);
  },
  getItem: (key: string): string | null => {
    return storage.getString(key) ?? null;
  },
  removeItem: (key: string): void => {
    storage.remove(key);
  },
};

export const clientPersister: Persister = {
  persistClient: async (client) => {
    storage.set("react-query-cache", JSON.stringify(client));
  },
  restoreClient: async () => {
    const cache = storage.getString("react-query-cache");
    if (!cache) return undefined;
    try {
      return JSON.parse(cache);
    } catch {
      return undefined;
    }
  },
  removeClient: async () => {
    storage.remove("react-query-cache");
  },
};
