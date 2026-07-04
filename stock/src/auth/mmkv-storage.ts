import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";
import { StateStorage } from "zustand/middleware";
import { DATA_HARDENING_MIGRATION_MARKER, getUnsafeLegacyStorageKeys } from "./storage-migration-core";
import { EVENT_SEQUENCE_MIGRATION_MARKER, getLegacyDomainEventCursorKeys } from "../local/read-model/read-model-cache-core";

interface SimpleStorage {
  set: (key: string, value: string) => void;
  getString: (key: string) => string | undefined;
  remove: (key: string) => boolean;
  getAllKeys?: () => string[];
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
    getAllKeys: () => {
      if (typeof window !== "undefined") {
        return Object.keys(window.localStorage);
      }
      return [];
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

export function runDataHardeningStorageMigration() {
  if (storage.getString(DATA_HARDENING_MIGRATION_MARKER) === "done") return;

  const keys = storage.getAllKeys?.() ?? [
    "react-query-cache",
  ];
  for (const key of getUnsafeLegacyStorageKeys(keys)) {
    storage.remove(key);
  }
  storage.set(DATA_HARDENING_MIGRATION_MARKER, "done");
}

export function runEventSequenceCursorMigration() {
  if (storage.getString(EVENT_SEQUENCE_MIGRATION_MARKER) === "done") return;

  const keys = storage.getAllKeys?.() ?? [];
  for (const key of getLegacyDomainEventCursorKeys(keys)) {
    storage.remove(key);
  }
  storage.set(EVENT_SEQUENCE_MIGRATION_MARKER, "done");
}

export { DATA_HARDENING_MIGRATION_MARKER, getUnsafeLegacyStorageKeys };
