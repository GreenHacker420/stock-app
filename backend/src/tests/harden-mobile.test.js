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
import {
  EVENT_SEQUENCE_MIGRATION_MARKER,
  getLegacyDomainEventCursorKeys,
  getStoredSequenceCursor,
  readLocalReadModelEnvelope,
  readModelBootstrapKey,
  readModelSequenceCursorKey,
  setStoredSequenceCursor,
  validateBootstrapResponse,
  writeLocalReadModelEnvelope,
} from "../../../stock/src/local/read-model/read-model-cache-core.ts";
import { getReadModelImpact } from "../../../stock/src/local/read-model/read-model-event-policy.ts";
import { selectCategories, selectCustomers, selectItemCatalog } from "../../../stock/src/local/read-model/read-model-search-core.ts";

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
    assert.match(domainReadCacheSecretKey("user:with/slash"), /^[A-Za-z0-9._-]+$/);
    assert.notStrictEqual(
      domainReadCacheSecretKey("user:a"),
      domainReadCacheSecretKey("user/a"),
      "distinct user IDs must not collapse to the same SecureStore key",
    );
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

test.describe("DATA-01B mobile read-model cache boundary", () => {
  function createStorage() {
    const values = new Map();
    return {
      values,
      getString: (key) => values.get(key),
      set: (key, value) => values.set(key, value),
      remove: (key) => values.delete(key),
      clearAll: () => values.clear(),
    };
  }

  function bootstrap(shopId = "shop_a") {
    return {
      schemaVersion: 1,
      shopId,
      generatedAt: "2026-07-04T10:00:00.000Z",
      baseCursor: "42",
      complete: true,
      customers: [
        {
          id: "customer_1",
          shopId,
          name: "Customer",
          type: "REGULAR",
          phone: "9999999999",
          address: null,
          city: null,
          gstin: null,
          contactPerson: null,
          creditLimit: "0",
          outstandingAmount: "100",
          updatedAt: "2026-07-04T09:00:00.000Z",
        },
      ],
      items: [
        {
          id: "item_1",
          shopId,
          name: "Item",
          sku: "SKU",
          imageUrl: null,
          unit: "pcs",
          defaultSellingPrice: "100",
          minimumAllowedPrice: "90",
          mrp: "120",
          minimumStock: "5",
          categoryId: "cat_1",
          categoryName: "Category",
          updatedAt: "2026-07-04T09:00:00.000Z",
        },
      ],
      categories: [{ id: "cat_1", name: "Category", updatedAt: "2026-07-04T09:00:00.000Z" }],
    };
  }

  test("bootstrap envelope write/read is shop-scoped and preserves one cursor", () => {
    const storage = createStorage();
    const envelope = writeLocalReadModelEnvelope(storage, bootstrap("shop_a"));

    assert.strictEqual(storage.values.has(readModelBootstrapKey("shop_a")), true);
    assert.strictEqual(envelope.baseCursor, "42");
    assert.strictEqual(readLocalReadModelEnvelope(storage, "shop_a")?.customers.length, 1);
    assert.strictEqual(readLocalReadModelEnvelope(storage, "shop_b"), null);
  });

  test("corrupt, wrong-schema, and wrong-shop envelopes are rejected safely", () => {
    const storage = createStorage();
    storage.set(readModelBootstrapKey("shop_a"), "{bad json");
    assert.strictEqual(readLocalReadModelEnvelope(storage, "shop_a"), null);
    assert.strictEqual(storage.values.has(readModelBootstrapKey("shop_a")), false);

    storage.set(readModelBootstrapKey("shop_a"), JSON.stringify({ ...bootstrap("shop_a"), schemaVersion: 2 }));
    assert.strictEqual(readLocalReadModelEnvelope(storage, "shop_a"), null);

    writeLocalReadModelEnvelope(storage, bootstrap("shop_b"));
    assert.strictEqual(readLocalReadModelEnvelope(storage, "shop_a"), null);
  });

  test("item catalog bootstrap excludes stock-authority fields", () => {
    const result = bootstrap("shop_a");
    assert.strictEqual(validateBootstrapResponse(result, "shop_a"), true);
    const item = result.items[0];
    assert.strictEqual("physicalStock" in item, false);
    assert.strictEqual("reservedStock" in item, false);
    assert.strictEqual("availableStock" in item, false);
    assert.strictEqual("purchasePrice" in item, false);
  });

  test("new sequence cursor is user and shop isolated and decimal-only", () => {
    const storage = createStorage();
    assert.notStrictEqual(
      readModelSequenceCursorKey("user_a", "shop_a"),
      readModelSequenceCursorKey("user_b", "shop_a"),
    );
    assert.notStrictEqual(
      readModelSequenceCursorKey("user_a", "shop_a"),
      readModelSequenceCursorKey("user_a", "shop_b"),
    );

    setStoredSequenceCursor(storage, "user_a", "shop_a", "1042");
    assert.strictEqual(getStoredSequenceCursor(storage, "user_a", "shop_a"), "1042");
    assert.throws(() => setStoredSequenceCursor(storage, "user_a", "shop_a", "2026-07-04T10:00:00.000Z"));
    storage.set(readModelSequenceCursorKey("user_a", "shop_a"), "not-a-number");
    assert.strictEqual(getStoredSequenceCursor(storage, "user_a", "shop_a"), null);
  });

  test("old timestamp cursor migration targets only legacy cursor keys", () => {
    const keys = [
      "domain_event_cursor:shop_a",
      "domain_event_cursor:shop_b",
      readModelSequenceCursorKey("user_a", "shop_a"),
      "shop-storage",
      EVENT_SEQUENCE_MIGRATION_MARKER,
    ];
    assert.deepStrictEqual(getLegacyDomainEventCursorKeys(keys), [
      "domain_event_cursor:shop_a",
      "domain_event_cursor:shop_b",
    ]);
  });

  test("early cursor access is guarded when encrypted domain cache is unavailable", () => {
    const source = readStock("realtime/domainEventCursor.ts");
    assert.match(source, /catch\s*\{\s*return null;\s*\}/s);
    assert.match(source, /catch\s*\{[\s\S]*next bootstrap\/reconciliation pass will recover/s);
    assert.ok(
      !source.includes("mmkvStorage.setItem"),
      "early cursor failure must not write to unencrypted legacy storage",
    );
  });

  test("event relevance policy covers read-model dependencies conservatively", () => {
    assert.deepStrictEqual(getReadModelImpact({ entity: "customer", action: "updated" }), {
      customers: true,
      items: false,
      categories: false,
    });
    assert.deepStrictEqual(getReadModelImpact({ entity: "payment", action: "created" }), {
      customers: true,
      items: false,
      categories: false,
    });
    assert.deepStrictEqual(getReadModelImpact({ entity: "category", action: "updated" }), {
      customers: false,
      items: true,
      categories: true,
    });
    assert.deepStrictEqual(getReadModelImpact({ entity: "stock", action: "updated" }), {
      customers: false,
      items: false,
      categories: false,
    });
  });

  test("customer selector searches complete local projection without walk-in leakage by default", () => {
    const customers = [
      {
        id: "c1",
        shopId: "shop_a",
        name: "Asha Traders",
        type: "REGULAR",
        phone: "99999",
        address: null,
        city: "Pune",
        gstin: "GST123",
        contactPerson: "Asha",
        creditLimit: "1000",
        outstandingAmount: "50",
        updatedAt: "2026-07-04T10:00:00.000Z",
      },
      {
        id: "walkin",
        shopId: "shop_a",
        name: "Walk In Customer",
        type: "WALK_IN",
        phone: null,
        address: null,
        city: null,
        gstin: null,
        contactPerson: null,
        creditLimit: null,
        outstandingAmount: "0",
        updatedAt: "2026-07-04T10:00:00.000Z",
      },
    ];

    assert.deepStrictEqual(selectCustomers(customers, { search: "asha" }).map((c) => c.id), ["c1"]);
    assert.deepStrictEqual(selectCustomers(customers).map((c) => c.id), ["c1"]);
    assert.deepStrictEqual(selectCustomers(customers, { includeWalkin: true }).map((c) => c.id), ["c1", "walkin"]);
  });

  test("category and item selectors stay discovery-only", () => {
    assert.deepStrictEqual(
      selectCategories([{ id: "cat_1", name: "Toner", updatedAt: "2026-07-04T10:00:00.000Z" }]),
      [{ id: "cat_1", name: "Toner" }],
    );

    const items = [
      {
        id: "item_1",
        shopId: "shop_a",
        name: "Evergreen Cartridge",
        sku: "12A",
        imageUrl: null,
        unit: "pcs",
        defaultSellingPrice: "400",
        minimumAllowedPrice: "350",
        mrp: "1999",
        minimumStock: "15",
        categoryId: "cat_1",
        categoryName: "Toner",
        updatedAt: "2026-07-04T10:00:00.000Z",
      },
    ];

    const result = selectItemCatalog(items, { search: "12a", categoryId: "cat_1" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual("availableStock" in result[0], false);
    assert.strictEqual("physicalStock" in result[0], false);
  });
});
