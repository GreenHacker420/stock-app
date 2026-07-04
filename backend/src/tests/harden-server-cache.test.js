import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import * as customerService from "../services/customer.service.js";
import * as itemService from "../services/item.service.js";
import {
  bestEffortInvalidateForDomainEvent,
  invalidateForDomainEvent,
  readThroughDomainCache,
  resetReadCacheStatsForTests,
} from "../cache/domain-read-cache.js";
import { setReadCacheRedisForTests } from "../cache/redis-read-cache.js";
import {
  dispatchPendingDomainEvents,
  setDomainEventRedisForTests,
} from "../workers/domain-event-dispatcher.worker.js";
import { closePushQueue } from "../services/notification.push.queue.js";
import { allocateShopEventSequence } from "../services/domain-event.service.js";

class FakeRedis {
  constructor({ failGet = false, failSet = false, failIncr = false, onOperation } = {}) {
    this.store = new Map();
    this.expiries = new Map();
    this.failGet = failGet;
    this.failSet = failSet;
    this.failIncr = failIncr;
    this.onOperation = onOperation;
  }

  async get(key) {
    this.onOperation?.("get", key);
    if (this.failGet) throw new Error("redis get failed");
    return this.store.get(key) ?? null;
  }

  async set(key, value, mode, ttl) {
    this.onOperation?.("set", key);
    if (this.failSet) throw new Error("redis set failed");
    this.store.set(key, value);
    if (mode === "EX") {
      this.expiries.set(key, Number(ttl));
    }
    return "OK";
  }

  async incr(key) {
    this.onOperation?.("incr", key);
    if (this.failIncr) throw new Error("redis incr failed");
    const next = Number(this.store.get(key) || 0) + 1;
    this.store.set(key, String(next));
    return next;
  }

  async publish(channel, message) {
    this.onOperation?.("publish", channel, message);
    return 1;
  }

  keys() {
    return [...this.store.keys()];
  }
}

const CODES = ["H2CACHE1", "H2CACHE2"];
const MOBILES = ["9944400011", "9944400012"];

async function cleanup() {
  const shops = await prisma.shop.findMany({ where: { code: { in: CODES } }, select: { id: true } });
  const shopIds = shops.map((shop) => shop.id);
  if (shopIds.length) {
    await prisma.notificationPushDelivery.deleteMany({ where: { notification: { shopId: { in: shopIds } } } });
    await prisma.notification.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.domainEventOutbox.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.auditLog.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.stockLedger.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.itemPriceHistory.deleteMany({ where: { item: { shopId: { in: shopIds } } } });
    await prisma.item.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.itemCategory.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.staffShopAccess.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
  }
  await prisma.user.deleteMany({ where: { mobile: { in: MOBILES } } });
}

async function seed() {
  const owner = await prisma.user.create({
    data: { name: "H2 Owner", mobile: MOBILES[0], passwordHash: "hash", role: "OWNER" },
  });
  const shop = await prisma.shop.create({
    data: { name: "H2 Shop", code: CODES[0], city: "Nagpur", ownerId: owner.id },
  });
  const otherShop = await prisma.shop.create({
    data: { name: "H2 Other", code: CODES[1], city: "Pune", ownerId: owner.id },
  });
  return { owner, shop, otherShop };
}

test.describe("HARDEN-02 server read cache and domain event coherence", () => {
  test.beforeEach(async () => {
    await cleanup();
    resetReadCacheStatsForTests();
    setReadCacheRedisForTests(new FakeRedis());
    setDomainEventRedisForTests(new FakeRedis());
  });

  test.afterEach(async () => {
    await cleanup();
    setReadCacheRedisForTests(null);
    setDomainEventRedisForTests(null);
  });

  test.after(async () => {
    await closePushQueue();
  });

  test("cache miss loads PostgreSQL result, fills Redis with TTL, and cache hit avoids loader", async () => {
    const redis = new FakeRedis();
    setReadCacheRedisForTests(redis);
    let loaderCalls = 0;

    const first = await readThroughDomainCache({
      shopId: "shop_a",
      domain: "customers",
      query: { page: 1, limit: 20, search: null },
      loader: async () => {
        loaderCalls += 1;
        return [{ id: "customer_1", name: "Cached Customer" }];
      },
    });
    const second = await readThroughDomainCache({
      shopId: "shop_a",
      domain: "customers",
      query: { limit: 20, search: null, page: 1 },
      loader: async () => {
        loaderCalls += 1;
        return [];
      },
    });

    assert.deepStrictEqual(first, [{ id: "customer_1", name: "Cached Customer" }]);
    assert.deepStrictEqual(second, first);
    assert.strictEqual(loaderCalls, 1);
    const cachedKeys = redis.keys().filter((key) => key.includes(":customers:g:"));
    assert.strictEqual(cachedKeys.length, 1);
    assert.strictEqual(redis.expiries.get(cachedKeys[0]), 120);
  });

  test("Redis GET and SET failures fall back to PostgreSQL result", async () => {
    setReadCacheRedisForTests(new FakeRedis({ failGet: true }));
    const fromGetFailure = await readThroughDomainCache({
      shopId: "shop_a",
      domain: "items",
      query: { page: 1 },
      loader: async () => ({ items: [{ id: "item_1" }] }),
    });
    assert.deepStrictEqual(fromGetFailure, { items: [{ id: "item_1" }] });

    setReadCacheRedisForTests(new FakeRedis({ failSet: true }));
    const fromSetFailure = await readThroughDomainCache({
      shopId: "shop_a",
      domain: "items",
      query: { page: 1 },
      loader: async () => ({ items: [{ id: "item_2" }] }),
    });
    assert.deepStrictEqual(fromSetFailure, { items: [{ id: "item_2" }] });
  });

  test("shop and query variants use isolated keys without raw search text", async () => {
    const redis = new FakeRedis();
    setReadCacheRedisForTests(redis);

    await readThroughDomainCache({ shopId: "shop_a", domain: "customers", query: { search: "Amit", page: 1 }, loader: async () => ["a"] });
    await readThroughDomainCache({ shopId: "shop_a", domain: "customers", query: { search: "Neha", page: 1 }, loader: async () => ["b"] });
    await readThroughDomainCache({ shopId: "shop_b", domain: "customers", query: { search: "Amit", page: 1 }, loader: async () => ["c"] });

    const queryKeys = redis.keys().filter((key) => key.includes(":q:"));
    assert.strictEqual(queryKeys.length, 3);
    assert.ok(queryKeys.some((key) => key.includes("shop:shop_a:customers")));
    assert.ok(queryKeys.some((key) => key.includes("shop:shop_b:customers")));
    assert.ok(queryKeys.every((key) => !key.includes("Amit") && !key.includes("Neha")));
  });

  test("customer read cache invalidates after update and outbox event is atomic with mutation", async () => {
    const redis = new FakeRedis();
    setReadCacheRedisForTests(redis);
    const { owner, shop } = await seed();
    const customer = await prisma.customer.create({
      data: { shopId: shop.id, name: "Before Cache", type: "REGULAR", createdById: owner.id },
    });

    const first = await customerService.listCustomers(owner, { shopId: shop.id, includeWalkin: true });
    assert.strictEqual(first[0].name, "Before Cache");

    await prisma.customer.update({ where: { id: customer.id }, data: { name: "Stale If Cached" } });
    const cached = await customerService.listCustomers(owner, { shopId: shop.id, includeWalkin: true });
    assert.strictEqual(cached[0].name, "Before Cache");

    await customerService.updateCustomer(owner, customer.id, { name: "Fresh After Invalidate" });
    const fresh = await customerService.listCustomers(owner, { shopId: shop.id, includeWalkin: true });
    assert.strictEqual(fresh[0].name, "Fresh After Invalidate");

    const event = await prisma.domainEventOutbox.findFirst({
      where: { shopId: shop.id, entity: "customer", action: "updated", entityId: customer.id },
    });
    assert.ok(event, "customer update must enqueue a domain event");
  });

  test("item and category mutations enqueue events and invalidate affected read domains", async () => {
    const redis = new FakeRedis();
    setReadCacheRedisForTests(redis);
    const { owner, shop } = await seed();

    const category = await itemService.createCategory(owner, { shopId: shop.id, name: "Ink" });
    await itemService.listCategories(owner, { shopId: shop.id });
    const renamed = await itemService.updateCategory(owner, category.id, { name: "Ink Updated" });
    assert.strictEqual(renamed.name, "Ink Updated");

    const item = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "Cartridge",
      sku: "H2-CART",
      categoryId: renamed.id,
      unit: "pcs",
      defaultSellingPrice: 100,
      initialStock: 2,
    });
    const updatedItem = await itemService.updateItem(owner, item.id, { name: "Cartridge Updated" });
    assert.strictEqual(updatedItem.name, "Cartridge Updated");

    const actions = await prisma.domainEventOutbox.findMany({
      where: { shopId: shop.id, entity: { in: ["item", "category"] } },
      orderBy: { createdAt: "asc" },
      select: { entity: true, action: true },
    });
    assert.ok(actions.some((event) => event.entity === "category" && event.action === "created"));
    assert.ok(actions.some((event) => event.entity === "category" && event.action === "updated"));
    assert.ok(actions.some((event) => event.entity === "item" && event.action === "created"));
    assert.ok(actions.some((event) => event.entity === "item" && event.action === "updated"));
    assert.ok(redis.keys().some((key) => key.includes(":items:generation")), "items generation should be invalidated");
    assert.ok(redis.keys().some((key) => key.includes(":categories:generation")), "categories generation should be invalidated");
  });

  test("dispatcher invalidates cache before live publish and retry leaves event pending on invalidation failure", async () => {
    const order = [];
    const redis = new FakeRedis({ onOperation: (operation) => order.push(operation) });
    const publisher = new FakeRedis({ onOperation: (operation) => order.push(operation) });
    setReadCacheRedisForTests(redis);
    setDomainEventRedisForTests(publisher);
    const { owner, shop } = await seed();

    await prisma.$transaction(async (tx) => {
      const sequence = await allocateShopEventSequence(tx, shop.id);
      await tx.domainEventOutbox.create({
        data: {
          id: "evt_h2_ordering",
          shopId: shop.id,
          entity: "customer",
          action: "updated",
          entityId: "customer_1",
          status: "pending",
          sequence,
          eventJson: {
            eventId: "evt_h2_ordering",
            shopId: shop.id,
            entity: "customer",
            action: "updated",
            entityId: "customer_1",
            actorUserId: owner.id,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    });

    await dispatchPendingDomainEvents();
    assert.ok(order.indexOf("incr") > -1);
    assert.ok(order.indexOf("publish") > -1);
    assert.ok(order.indexOf("incr") < order.indexOf("publish"));

    const published = await prisma.domainEventOutbox.findUnique({ where: { id: "evt_h2_ordering" } });
    assert.strictEqual(published.status, "published");

    setReadCacheRedisForTests(new FakeRedis({ failIncr: true }));
    await prisma.$transaction(async (tx) => {
      const sequence = await allocateShopEventSequence(tx, shop.id);
      await tx.domainEventOutbox.create({
        data: {
          id: "evt_h2_retry",
          shopId: shop.id,
          entity: "item",
          action: "updated",
          entityId: "item_1",
          status: "pending",
          sequence,
          eventJson: {
            eventId: "evt_h2_retry",
            shopId: shop.id,
            entity: "item",
            action: "updated",
            entityId: "item_1",
            actorUserId: owner.id,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    });

    await dispatchPendingDomainEvents();
    const retry = await prisma.domainEventOutbox.findUnique({ where: { id: "evt_h2_retry" } });
    assert.strictEqual(retry.status, "pending");
    assert.strictEqual(retry.attempts, 1);
  });

  test("duplicate invalidation is safe", async () => {
    const redis = new FakeRedis();
    setReadCacheRedisForTests(redis);
    const event = { shopId: "shop_a", entity: "category", action: "updated" };

    await invalidateForDomainEvent(event);
    await invalidateForDomainEvent(event);
    const result = await bestEffortInvalidateForDomainEvent(event);

    assert.strictEqual(result.invalidated, 2);
    assert.strictEqual(redis.store.get("srv-cache:v1:shop:shop_a:categories:generation"), "3");
    assert.strictEqual(redis.store.get("srv-cache:v1:shop:shop_a:items:generation"), "3");
  });
});
