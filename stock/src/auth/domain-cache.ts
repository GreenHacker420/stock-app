import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";
import {
  createDomainCacheController,
  domainReadCacheKey,
  domainReadCacheMetaKey,
  domainReadCacheSecretKey,
  domainReadCacheStorageId,
  type DomainCacheDomain,
} from "./domain-cache-core";

const controller = createDomainCacheController({
  getSecret: (key) => SecureStore.getItemAsync(key),
  setSecret: (key, value) => SecureStore.setItemAsync(key, value),
  deleteSecret: (key) => SecureStore.deleteItemAsync(key),
  createKey: async () => {
    const bytes = await Crypto.getRandomBytesAsync(32);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  },
  createStorage: ({ id, encryptionKey }) => createMMKV({ id, encryptionKey }),
});

export function initializeDomainReadCache(userId: string) {
  return controller.initialize(userId);
}

export function getDomainReadCache() {
  return controller.getActive();
}

export function destroyDomainReadCache() {
  controller.destroy();
}

export function clearDomainReadCacheForUser(userId: string) {
  return controller.clearForUser(userId);
}

export {
  domainReadCacheKey,
  domainReadCacheMetaKey,
  domainReadCacheSecretKey,
  domainReadCacheStorageId,
  type DomainCacheDomain,
};
