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
import { invalidateForDomainEvent } from "../../../stock/src/realtime/domainEvents.ts";
import {
  buildMergedItemPatch,
  getItemMergeCompatibilityIssue,
  mergeItemImageUrls,
} from "../services/item-merge.js";

const root = path.resolve(import.meta.dirname, "../../..");
const stockSrc = path.join(root, "stock/src");
const backendSrc = path.join(root, "backend/src");

function readStock(relativePath) {
  return fs.readFileSync(path.join(stockSrc, relativePath), "utf8");
}

function readBackend(relativePath) {
  return fs.readFileSync(path.join(backendSrc, relativePath), "utf8");
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

test.describe("HARDEN-01 WhatsApp mobile capability boundary", () => {
  test("navigation registers WhatsApp screens only through the runtime capability gate", () => {
    const navigation = readStock("navigation/index.tsx");
    const gate = readStock("modules/whatsapp/WhatsAppFeatureGate.tsx");
    assert.ok(navigation.includes("whatsappCapabilityScreen(ChatListScreen)"));
    assert.ok(navigation.includes("whatsappCapabilityScreen(ChatDetailScreen)"));
    assert.ok(navigation.includes('path: "shops/:shopId/whatsapp/:integrationId/conversations/:conversationId"'));
    assert.ok(gate.includes("fetchWhatsAppCapability"));
    assert.ok(gate.includes("requestedIntegrationId === capability.data?.integrationId"));
    assert.ok(gate.includes("const routeScopeValid"));
    assert.ok(gate.includes("<WhatsAppScopeProvider"));
    assert.ok(gate.indexOf("fetchWhatsAppCapability") < gate.indexOf("setActiveShopId(requestedShopId"));
  });

  test("gated registration does not initialize screen-local WhatsApp realtime hooks", () => {
    const navigation = readStock("navigation/index.tsx");
    const realtime = readStock("realtime/RealtimeProvider.tsx");
    assert.ok(!navigation.includes("useWhatsAppRealtime("));
    assert.ok(!realtime.includes("DeviceEventEmitter"));
    assert.ok(!realtime.includes("wa:"));
    assert.ok(!realtime.includes("wa-messages"));
  });

  test("background lifecycle cancels heartbeat and reconnect work before grace disconnect", () => {
    const realtime = readStock("realtime/RealtimeProvider.tsx");
    assert.ok(realtime.includes("stopHeartbeat();"));
    assert.ok(realtime.includes("reconnection?.(false)"));
    assert.ok(realtime.includes("getWhatsAppSocketGraceMs()"));
    assert.ok(realtime.includes("cancelBackgroundDisconnect();"));
    assert.ok(realtime.includes('if (currentAppState === "active") socket.connect();'));
  });

  test("notification taps produce identifier-only links that are re-authorized by the gate", () => {
    const linking = readStock("notifications/whatsappNotificationLinking.ts");
    const gate = readStock("modules/whatsapp/WhatsAppFeatureGate.tsx");
    assert.ok(linking.includes('data.type !== "WHATSAPP_MESSAGE"'));
    assert.ok(linking.includes("shopId"));
    assert.ok(linking.includes("integrationId"));
    assert.ok(linking.includes("conversationId"));
    assert.ok(!linking.includes("setActiveShopId"));
    assert.ok(gate.includes("requestedConversationId"));
    assert.ok(gate.includes("fetchWhatsAppCapability"));
  });

  test("alerts move to the home header when WhatsApp occupies the bottom tab", () => {
    const header = readStock("components/ui/AppHeader.tsx");
    const home = readStock("navigation/screens/Home.tsx");
    assert.ok(header.includes('navigation?.navigate("NotificationHistory")'));
    assert.ok(header.includes('source="bell-outline"'));
    assert.ok(home.includes("showAlerts"));
  });

  test("WhatsApp message and contact surfaces reuse current mobile primitives", () => {
    const messageSheet = readStock("modules/whatsapp/components/MessageActionSheet.tsx");
    const contacts = readStock("modules/whatsapp/screens/ContactBookScreen.tsx");
    assert.match(messageSheet, /AppBottomSheetModal/);
    assert.doesNotMatch(messageSheet, /<Modal\b/);
    assert.doesNotMatch(messageSheet, /KeyboardAvoidingView/);
    assert.match(contacts, /from "expo-contacts"/);
    assert.doesNotMatch(contacts, /expo-contacts\/legacy/);
    assert.doesNotMatch(contacts, /estimatedItemSize/);
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

  test("repair writes can preserve previous base cursor until durable cursor advances", () => {
    const storage = createStorage();
    writeLocalReadModelEnvelope(storage, bootstrap("shop_a"));
    const repaired = writeLocalReadModelEnvelope(storage, { ...bootstrap("shop_a"), baseCursor: "99" }, { baseCursor: "42" });

    assert.strictEqual(repaired.baseCursor, "42");
    assert.strictEqual(readLocalReadModelEnvelope(storage, "shop_a")?.baseCursor, "42");
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
        id: "c2",
        shopId: "shop_a",
        name: "भारत Stationery",
        type: "REGULAR",
        phone: "8888812345",
        address: null,
        city: "Mumbai",
        gstin: "27ABCDE1234F1Z5",
        contactPerson: "Meera",
        creditLimit: "1000",
        outstandingAmount: "0",
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
    const before = JSON.stringify(customers);

    assert.deepStrictEqual(selectCustomers(customers, { search: "asha" }).map((c) => c.id), ["c1"]);
    assert.deepStrictEqual(selectCustomers(customers, { search: "  MEERA  " }).map((c) => c.id), ["c2"]);
    assert.deepStrictEqual(selectCustomers(customers, { search: "12345" }).map((c) => c.id), ["c2"]);
    assert.deepStrictEqual(selectCustomers(customers, { search: "abcde" }).map((c) => c.id), ["c2"]);
    assert.deepStrictEqual(selectCustomers(customers, { search: "भारत" }).map((c) => c.id), ["c2"]);
    assert.deepStrictEqual(selectCustomers(customers, { search: "no-match" }), []);
    assert.deepStrictEqual(selectCustomers(customers).map((c) => c.id), ["c1", "c2"]);
    assert.deepStrictEqual(selectCustomers(customers, { includeWalkin: true }).map((c) => c.id), ["c1", "c2", "walkin"]);
    assert.deepStrictEqual(selectCustomers(customers, { limit: 1 }).map((c) => c.id), ["c1"]);
    assert.strictEqual(JSON.stringify(customers), before, "selector must not mutate the shared bootstrap array");
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

test.describe("DATA-03 realtime read-model coherence contracts", () => {
  test("WhatsApp created events enter only the newest infinite-query page", () => {
    let data = {
      pageParams: [undefined, "older"],
      pages: [
        { items: [{ id: "newest", entityVersion: 1 }] },
        { items: [{ id: "older", entityVersion: 1 }] },
      ],
    };
    const queryClient = {
      setQueriesData: (_filters, updater) => {
        data = updater(data);
      },
    };
    invalidateForDomainEvent(queryClient, {
      eventId: "event-1",
      shopId: "shop-1",
      integrationId: "integration-1",
      conversationId: "conversation-1",
      entity: "waMessage",
      entityId: "message-1",
      entityVersion: 1,
      actorUserId: "user-1",
      action: "created",
      patch: { id: "message-1", entityVersion: 1 },
    });
    assert.deepEqual(data.pages[0].items.map((item) => item.id), ["newest", "message-1"]);
    assert.deepEqual(data.pages[1].items.map((item) => item.id), ["older"]);
  });

  test("live socket events request reconciliation instead of direct cursor advancement or MMKV patching", () => {
    const provider = readStock("realtime/RealtimeProvider.tsx");
    const liveHandler = provider.slice(provider.indexOf('socket.on("domain:event"'));

    assert.ok(liveHandler.includes("reconcile();"));
    assert.ok(!liveHandler.includes("setDomainEventCursor("));
    assert.ok(!liveHandler.includes("handleReadModelLiveEvent"));
    assert.ok(!liveHandler.includes(".storage.set("));
  });

  test("reconciliation refreshes read models before advancing the durable cursor", () => {
    const source = readStock("realtime/domainEventReconciliation.ts");
    const refreshIndex = source.indexOf("refreshReadModelDomains({ userId, shopId, token, queryClient, reason: \"reconciliation\", writeCursor: false }, domains)");
    const cursorIndex = source.indexOf("await setDomainEventCursor(userId, shopId, nextCursor)");

    assert.ok(refreshIndex > -1, "reconciliation must repair affected read-model domains without writing bootstrap cursor");
    assert.ok(cursorIndex > -1, "reconciliation must still advance cursor after successful processing");
    assert.ok(refreshIndex < cursorIndex, "read-model persistence must happen before cursor advancement");
  });

  test("same-device customer and catalog mutation refreshes do not advance the sequence cursor", () => {
    const customers = readStock("hooks/useCustomers.ts");
    const items = readStock("hooks/useItems.ts");

    assert.ok(customers.includes("refreshCustomerReadModelAfterMutation"));
    assert.ok(customers.includes("writeCursor: false"));
    assert.ok(items.includes("refreshCatalogReadModelAfterMutation"));
    assert.ok(items.includes("writeCursor: false"));
  });
});

test.describe("RELEASE-01 functional blocker closure contracts", () => {
  test("OrderDetail uses the real order-to-sale mutation and no fake conversion success path", () => {
    const source = readStock("navigation/screens/OrderDetail.tsx");

    assert.ok(source.includes("useConvertOrderToSaleMutation"));
    assert.ok(source.includes("convertSaleMutation.mutate"));
    assert.ok(!source.includes("Promise.resolve({})"));
    assert.ok(!source.includes("Conversion to Sale logic here"));
  });

  test("DailySummary export calls the real PDF generator before showing success", () => {
    const source = readStock("navigation/screens/DailySummary.tsx");
    const helper = readStock("utils/pdf.ts");

    assert.ok(source.includes("shareDailySummaryPdf"));
    assert.ok(source.indexOf("await shareDailySummaryPdf") < source.indexOf('setSuccessTitle("PDF Exported")'));
    assert.ok(!source.includes('setSuccessMessage("Daily Summary PDF has been exported successfully!")'));
    assert.ok(helper.includes("export async function shareDailySummaryPdf"));
    assert.ok(helper.includes("Print.printToFileAsync"));
    assert.ok(helper.includes("Sharing.shareAsync"));
  });
});

test.describe("Shop access realtime refresh contracts", () => {
  test("shop access events invalidate shops and active unassign clears current shop", () => {
    const domainEvents = readStock("realtime/domainEvents.ts");
    const provider = readStock("realtime/RealtimeProvider.tsx");

    assert.ok(domainEvents.includes('event.entity === "shop"'));
    assert.ok(domainEvents.includes('queryClient.invalidateQueries({ queryKey: ["shops"] })'));
    assert.ok(provider.includes('event.action === "staff_unassigned"'));
    assert.ok(provider.includes("clearActiveShop();"));
    assert.ok(provider.includes("event.visibility?.targetUserIds?.includes(userId)"));
  });

  test("staff assignment screens update cached shop access without app restart", () => {
    const hooks = readStock("hooks/useShops.ts");
    const assignStaff = readStock("navigation/screens/AssignStaff.tsx");

    assert.ok(hooks.includes("addStaffAccessToShopsCache"));
    assert.ok(hooks.includes("removeStaffAccessFromShopsCache"));
    assert.ok(assignStaff.includes("fetchShops"));
    assert.ok(assignStaff.includes("currentShop"));
    assert.ok(assignStaff.includes("queryClient.setQueryData<Shop[] | undefined>"));
  });
});

test.describe("Domain event mutation coverage contracts", () => {
  test("staff removal emits targeted events and mobile signs out the removed staff device", () => {
    const authService = readBackend("services/auth.service.js");
    const provider = readStock("realtime/RealtimeProvider.tsx");
    const hooks = readStock("hooks/useAuth.ts");

    assert.ok(authService.includes("export async function deleteStaff"));
    assert.ok(authService.includes('entity: "staff"'));
    assert.ok(authService.includes('action: "deleted"'));
    assert.ok(authService.includes("targetUserIds: [staffId]"));
    assert.ok(authService.includes("tx.userDevice.updateMany"));
    assert.ok(provider.includes("wasCurrentStaffDeleted"));
    assert.ok(provider.includes("void signOut();"));
    assert.ok(hooks.includes("useDeleteStaffMutation"));
  });

  test("active mutation domains emit realtime events for cache coherence", () => {
    const attendance = readBackend("services/attendance.service.js");
    const expense = readBackend("services/expense.service.js");
    const dailySummary = readBackend("services/dailySummary.service.js");
    const order = readBackend("services/order.service.js");
    const approval = readBackend("services/approval.service.js");
    const rateChange = readBackend("services/rateChange.service.js");
    const correction = readBackend("services/correction.service.js");
    const domainEvents = readStock("realtime/domainEvents.ts");

    assert.ok(attendance.includes('entity: "attendance"'));
    assert.ok(expense.includes('entity: "expense"'));
    assert.ok(dailySummary.includes('entity: "dailySummary"'));
    assert.ok(order.includes('action: "reservation_updated"'));
    assert.ok(approval.includes('entity: "stock"'));
    assert.ok(rateChange.includes('entity: "order"'));
    assert.ok(correction.includes('entity: "sale"'));
    assert.ok(correction.includes('entity: "deliveryMemo"'));
    assert.ok(domainEvents.includes('event.entity === "expense"'));
    assert.ok(domainEvents.includes('event.entity === "attendance"'));
    assert.ok(domainEvents.includes('event.entity === "dailySummary"'));
  });

  test("customer and product soft delete endpoints emit read-model events", () => {
    const customerService = readBackend("services/customer.service.js");
    const itemService = readBackend("services/item.service.js");
    const client = readStock("api/client.ts");

    assert.ok(customerService.includes("export async function deleteCustomer"));
    assert.ok(customerService.includes('action: "deleted"'));
    assert.ok(customerService.includes('entity: "customer"'));
    assert.ok(itemService.includes("export async function deleteItem"));
    assert.ok(itemService.includes('entity: "item"'));
    assert.ok(client.includes("export async function deleteCustomer"));
    assert.ok(client.includes("export async function deleteItem"));
  });
});

test.describe("Product image upload contracts", () => {
  test("product merge preserves primary and source photos without duplicates", () => {
    const items = [
      { id: "source-a", imageUrl: "https://cdn.test/source-a.jpg, https://cdn.test/shared.jpg" },
      { id: "target", imageUrl: "https://cdn.test/target.jpg,https://cdn.test/shared.jpg" },
      { id: "source-b", imageUrl: "https://cdn.test/source-b.jpg" },
    ];

    assert.strictEqual(
      mergeItemImageUrls(items, "target", ["source-a", "source-b"]),
      [
        "https://cdn.test/target.jpg",
        "https://cdn.test/shared.jpg",
        "https://cdn.test/source-a.jpg",
        "https://cdn.test/source-b.jpg",
      ].join(","),
    );
  });

  test("product merge adopts every source photo when the primary has none", () => {
    const sourceUrls = Array.from(
      { length: 7 },
      (_, index) => `https://cdn.test/source-${index}.jpg`,
    );

    assert.strictEqual(
      mergeItemImageUrls(
        [
          { id: "target", imageUrl: null },
          { id: "source", imageUrl: sourceUrls.join(",") },
        ],
        "target",
        ["source"],
      ),
      sourceUrls.join(","),
    );
  });

  test("product merge keeps populated primary fields and fills only empty optional fields", () => {
    const items = [
      {
        id: "target",
        status: "ACTIVE",
        unit: "PCS",
        requiresSerialNumber: false,
        sku: null,
        categoryId: "primary-category",
        brandId: null,
        mrp: 100,
        purchasePrice: null,
        minimumAllowedPrice: 80,
        imageUrl: "https://cdn.test/target.jpg",
      },
      {
        id: "source",
        status: "ACTIVE",
        unit: "pcs",
        requiresSerialNumber: false,
        sku: "SOURCE-SKU",
        categoryId: "source-category",
        brandId: "source-brand",
        mrp: 120,
        purchasePrice: 60,
        minimumAllowedPrice: 70,
        imageUrl: "https://cdn.test/source.jpg",
      },
    ];

    assert.strictEqual(getItemMergeCompatibilityIssue(items, "target", ["source"]), null);
    assert.deepStrictEqual(buildMergedItemPatch(items, "target", ["source"]), {
      sku: "SOURCE-SKU",
      categoryId: "primary-category",
      brandId: "source-brand",
      purchasePrice: 60,
      mrp: 100,
      minimumAllowedPrice: 80,
      imageUrl: "https://cdn.test/target.jpg,https://cdn.test/source.jpg",
    });
  });

  test("product merge rejects incompatible units, tracking settings, and inactive records", () => {
    const target = {
      id: "target",
      status: "ACTIVE",
      unit: "pcs",
      requiresSerialNumber: false,
    };
    assert.match(
      getItemMergeCompatibilityIssue(
        [target, { id: "source", status: "ACTIVE", unit: "kg", requiresSerialNumber: false }],
        "target",
        ["source"],
      ),
      /different units/i,
    );
    assert.match(
      getItemMergeCompatibilityIssue(
        [target, { id: "source", status: "ACTIVE", unit: "pcs", requiresSerialNumber: true }],
        "target",
        ["source"],
      ),
      /serial-number tracking/i,
    );
    assert.match(
      getItemMergeCompatibilityIssue(
        [target, { id: "source", status: "INACTIVE", unit: "pcs", requiresSerialNumber: false }],
        "target",
        ["source"],
      ),
      /only active/i,
    );
  });

  test("item images use the generic S3 upload service and tracked internal assets", () => {
    const itemService = readBackend("services/item.service.js");
    const uploadService = readBackend("services/upload.service.js");
    const s3Storage = readBackend("lib/s3-storage.js");
    const client = readStock("api/client.ts");

    assert.ok(itemService.includes("uploadProductImageAsset"));
    assert.ok(!itemService.includes("../lib/wa-media.js"));
    assert.ok(uploadService.includes('source: "INTERNAL"'));
    assert.ok(uploadService.includes('kind: "IMAGE"'));
    assert.ok(uploadService.includes('status: "READY"'));
    assert.ok(uploadService.includes('"shops"'));
    assert.ok(uploadService.includes('"categories"'));
    assert.ok(uploadService.includes('"items"'));
    assert.ok(s3Storage.includes("export async function uploadBufferToS3"));
    assert.ok(client.includes('request.open("POST", `${API_BASE_URL}/items/image`)'));
  });
});
