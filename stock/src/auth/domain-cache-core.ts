export type DomainCacheDomain = "customers" | "items" | "categories";

export type DomainCacheStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => boolean;
  clearAll?: () => void;
};

export type DomainCacheRuntime = {
  getSecret: (key: string) => Promise<string | null>;
  setSecret: (key: string, value: string) => Promise<void>;
  deleteSecret: (key: string) => Promise<void>;
  createStorage: (options: { id: string; encryptionKey: string }) => DomainCacheStorage;
  createKey: () => Promise<string>;
};

export type DomainCacheInstance = {
  userId: string;
  storageId: string;
  storage: DomainCacheStorage;
};

const CACHE_VERSION = 1;
const SECURE_KEY_PREFIX = "domain-read-cache:key:v1:user:";
const STORAGE_ID_PREFIX = "domain-read-cache:v1:user:";

function encodePart(value: string) {
  return encodeURIComponent(value.trim());
}

export function domainReadCacheStorageId(userId: string) {
  if (!userId.trim()) throw new Error("Domain read cache requires userId");
  return `${STORAGE_ID_PREFIX}${encodePart(userId)}`;
}

export function domainReadCacheSecretKey(userId: string) {
  if (!userId.trim()) throw new Error("Domain read cache requires userId");
  return `${SECURE_KEY_PREFIX}${encodePart(userId)}`;
}

export function domainReadCacheKey(shopId: string, domain: DomainCacheDomain) {
  if (!shopId.trim()) throw new Error("Domain read cache key requires shopId");
  return `cache:v${CACHE_VERSION}:shop:${encodePart(shopId)}:${domain}`;
}

export function domainReadCacheMetaKey(shopId: string, domain: DomainCacheDomain) {
  return `${domainReadCacheKey(shopId, domain)}:meta`;
}

export function createDomainCacheController(runtime: DomainCacheRuntime) {
  let activeInstance: DomainCacheInstance | null = null;
  let initPromise: Promise<DomainCacheInstance> | null = null;
  let initUserId: string | null = null;

  async function getOrCreateEncryptionKey(userId: string) {
    const secretKey = domainReadCacheSecretKey(userId);
    const existing = await runtime.getSecret(secretKey);
    if (existing) return existing;

    const created = await runtime.createKey();
    await runtime.setSecret(secretKey, created);
    return created;
  }

  return {
    async initialize(userId: string): Promise<DomainCacheInstance> {
      if (activeInstance?.userId === userId) return activeInstance;
      if (initPromise && initUserId === userId) return initPromise;

      activeInstance = null;
      initUserId = userId;
      initPromise = (async () => {
        const encryptionKey = await getOrCreateEncryptionKey(userId);
        const storageId = domainReadCacheStorageId(userId);
        const storage = runtime.createStorage({ id: storageId, encryptionKey });
        activeInstance = { userId, storageId, storage };
        return activeInstance;
      })().finally(() => {
        initPromise = null;
        initUserId = null;
      });

      return initPromise;
    },

    getActive(): DomainCacheInstance {
      if (!activeInstance) throw new Error("Domain read cache is not initialized");
      return activeInstance;
    },

    destroy() {
      activeInstance = null;
      initPromise = null;
      initUserId = null;
    },

    async clearForUser(userId: string) {
      if (activeInstance?.userId === userId) {
        activeInstance.storage.clearAll?.();
        this.destroy();
      }
      await runtime.deleteSecret(domainReadCacheSecretKey(userId));
    },
  };
}
