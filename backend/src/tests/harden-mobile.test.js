import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  createDomainCacheController,
  domainReadCacheKey,
  domainReadCacheMetaKey,
  domainReadCacheSecretKey,
  domainReadCacheStorageId,
} from "../../../stock/src/auth/domain-cache-core.ts";
import {
  DATA_HARDENING_MIGRATION_MARKER,
  getUnsafeLegacyStorageKeys,
} from "../../../stock/src/auth/storage-migration-core.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const stockSrc = path.join(root, "stock/src");

function readStock(relativePath) {
  return fs.readFileSync(path.join(stockSrc, relativePath), "utf8");
}

function createMockRuntime() {
  const secrets = new Map();
  const createdStorages = [];
  let keyCounter = 0;
  return {
    secrets,
    createdStorages,
    runtime: {
      getSecret: async (key) => secrets.get(key) ?? null,
      setSecret: async (key, value) => {
        secrets.set(key, value);
      },
      deleteSecret: async (key) => {
        secrets.delete(key);
      },
      createKey: async () => `key-${++keyCounter}`,
      createStorage: ({ id, encryptionKey }) => {
        const values = new Map();
        const storage = {
          id,
          encryptionKey,
          getString: (key) => values.get(key),
          set: (key, value) => values.set(key, value),
          remove: (key) => values.delete(key),
          clearAll: () => values.clear(),
        };
        createdStorages.push(storage);
        return storage;
      },
    },
  };
}

test.describe("HARDEN-01 mobile persistence boundary", () => {
  test("legacy migration removes exact unsafe keys and preserves auth/shop/cursor keys", () => {
    const keys = [
      "react-query-cache",
      "billing_cache:customers:shop_a",
      "billing_cache:products:shop_a",
      "billing_cache:meta:shop_a",
      "shop-storage",
      "shopcontrol_token",
      "domain_event_cursor:shop_a",
      DATA_HARDENING_MIGRATION_MARKER,
    ];

    assert.deepStrictEqual(getUnsafeLegacyStorageKeys(keys), [
      "react-query-cache",
      "billing_cache:customers:shop_a",
      "billing_cache:products:shop_a",
      "billing_cache:meta:shop_a",
    ]);
  });

  test("domain cache storage and secret keys are user-scoped", () => {
    assert.notStrictEqual(domainReadCacheStorageId("user_a"), domainReadCacheStorageId("user_b"));
    assert.notStrictEqual(domainReadCacheSecretKey("user_a"), domainReadCacheSecretKey("user_b"));
  });

  test("shop keys are isolated per domain and shop", () => {
    assert.notStrictEqual(domainReadCacheKey("shop_a", "customers"), domainReadCacheKey("shop_b", "customers"));
    assert.notStrictEqual(domainReadCacheKey("shop_a", "items"), domainReadCacheKey("shop_a", "categories"));
    assert.strictEqual(
      domainReadCacheMetaKey("shop_a", "customers"),
      `${domainReadCacheKey("shop_a", "customers")}:meta`,
    );
  });

  test("bootstrap is idempotent for the same user", async () => {
    const { runtime, createdStorages } = createMockRuntime();
    const controller = createDomainCacheController(runtime);

    const first = await controller.initialize("user_a");
    const second = await controller.initialize("user_a");

    assert.strictEqual(first, second);
    assert.strictEqual(createdStorages.length, 1);
  });

  test("concurrent bootstrap for same user creates one encrypted instance", async () => {
    const { runtime, createdStorages } = createMockRuntime();
    const controller = createDomainCacheController(runtime);

    const [first, second, third] = await Promise.all([
      controller.initialize("user_a"),
      controller.initialize("user_a"),
      controller.initialize("user_a"),
    ]);

    assert.strictEqual(first, second);
    assert.strictEqual(second, third);
    assert.strictEqual(createdStorages.length, 1);
  });

  test("logout teardown clears active instance and prevents previous-user reuse", async () => {
    const { runtime } = createMockRuntime();
    const controller = createDomainCacheController(runtime);

    const userA = await controller.initialize("user_a");
    await controller.clearForUser("user_a");
    assert.throws(() => controller.getActive(), /not initialized/);

    const userB = await controller.initialize("user_b");
    assert.notStrictEqual(userA.storageId, userB.storageId);
  });
});

test.describe("HARDEN-01 WhatsApp mobile unmounting", () => {
  test("mounted navigation does not import or register WhatsApp screens", () => {
    const navigation = readStock("navigation/index.tsx");
    assert.ok(!navigation.includes("../modules/whatsapp"));
    assert.ok(!navigation.includes("WhatsAppSetup"));
    assert.ok(!navigation.includes("ChatDetailScreen"));
    assert.ok(!navigation.includes("TemplateLibraryScreen"));
    assert.ok(!navigation.includes("FlowEditorScreen"));
  });

  test("mounted app realtime provider does not initialize WhatsApp event forwarding", () => {
    const realtime = readStock("realtime/RealtimeProvider.tsx");
    assert.ok(!realtime.includes("DeviceEventEmitter"));
    assert.ok(!realtime.includes("wa:"));
    assert.ok(!realtime.includes("wa-messages"));
  });
});

test.describe("HARDEN-01 partial write protection", () => {
  test("customer and item query hooks do not write persistent full snapshots", () => {
    const customers = readStock("hooks/useCustomers.ts");
    const items = readStock("hooks/useItems.ts");
    assert.ok(!customers.includes("setCachedCustomers"));
    assert.ok(!customers.includes("warmOfflineCache"));
    assert.ok(!items.includes("setCachedProducts"));
    assert.ok(!items.includes("warmOfflineCache"));
  });

  test("mounted app no longer uses blanket QueryClient persistence", () => {
    const app = readStock("App.tsx");
    assert.ok(!app.includes("PersistQueryClientProvider"));
    assert.ok(app.includes("QueryClientProvider"));
  });
});
