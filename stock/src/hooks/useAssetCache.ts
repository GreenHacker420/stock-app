import { Platform } from "react-native";
import type { StorageObjectsResponse } from "../api/client";

let _mmkv: {
  set: (key: string, value: string | number) => void;
  getString: (key: string) => string | undefined;
  getNumber: (key: string) => number | undefined;
  delete: (key: string) => void;
} | null = null;

function getStorage() {
  if (_mmkv) return _mmkv;
  if (Platform.OS === "web") {
    _mmkv = {
      set: (key, value) => { if (typeof window !== "undefined") window.localStorage.setItem(key, String(value)); },
      getString: (key) => { if (typeof window !== "undefined") return window.localStorage.getItem(key) ?? undefined; return undefined; },
      getNumber: (key) => { if (typeof window !== "undefined") { const v = window.localStorage.getItem(key); return v !== null ? Number(v) : undefined; } return undefined; },
      delete: (key) => { if (typeof window !== "undefined") window.localStorage.removeItem(key); },
    };
  } else {
    const { createMMKV } = require("react-native-mmkv");
    const storage = createMMKV({ id: "asset-manager-cache-v2" });
    _mmkv = {
      set: (key, value) => storage.set(key, value),
      getString: (key) => storage.getString(key),
      getNumber: (key) => storage.getNumber(key),
      delete: (key) => storage.delete(key),
    };
  }
  return _mmkv!;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(shopId: string, filter: string) {
  return `assets_v2_${shopId}_${filter}`;
}

export function readAssetCache(
  shopId: string,
  filter: "ALL" | "ORPHANED" = "ALL"
): StorageObjectsResponse | null {
  try {
    const s = getStorage();
    const key = cacheKey(shopId, filter);
    const raw = s.getString(key);
    const ts = s.getNumber(key + "_ts");
    if (!raw || !ts || Date.now() - ts > CACHE_TTL_MS) return null;
    return JSON.parse(raw) as StorageObjectsResponse;
  } catch {
    return null;
  }
}

export function writeAssetCache(
  shopId: string,
  filter: "ALL" | "ORPHANED" = "ALL",
  data: StorageObjectsResponse
): void {
  try {
    const s = getStorage();
    const key = cacheKey(shopId, filter);
    s.set(key, JSON.stringify(data));
    s.set(key + "_ts", Date.now());
  } catch {
    // non-fatal
  }
}

export function invalidateAssetCache(shopId: string): void {
  try {
    const s = getStorage();
    for (const f of ["ALL", "ORPHANED"]) {
      const key = cacheKey(shopId, f);
      s.delete(key);
      s.delete(key + "_ts");
    }
  } catch {
    // silent
  }
}
