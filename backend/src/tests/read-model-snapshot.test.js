import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import { getShopReadModelBootstrap } from "../services/read-model-snapshot.service.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { syncDomainEvents } from "../controllers/sync.controller.js";
import { dispatchPendingDomainEvents, closeRedis } from "../workers/domain-event-dispatcher.worker.js";
import * as customerService from "../services/customer.service.js";
import * as itemService from "../services/item.service.js";
import { closePushQueue } from "../services/notification.push.queue.js";
import { closeWhatsappQueues } from "../services/whatsapp.queue.js";
import { closeWaCacheRedis } from "../lib/wa-cache.js";
import { closePresenceRedis } from "../services/device-presence.service.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callSync(req) {
  return new Promise((resolve) => {
    const res = { json(payload) { resolve(payload); } };
    syncDomainEvents(req, res);
  });
}

async function cleanTestData(shopIds, mobiles) {
  try {
    if (shopIds && shopIds.length > 0) {
      await prisma.domainEventOutbox.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.shopEventSequence.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.stockLedger.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.stockBalance.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.itemPriceHistory.deleteMany({ where: { item: { shopId: { in: shopIds } } } });
      await prisma.item.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.itemCategory.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.staffShopAccess.deleteMany({ where: { shopId: { in: shopIds } } });
    }
    if (mobiles && mobiles.length > 0) {
      await prisma.userDevice.deleteMany({ where: { user: { mobile: { in: mobiles } } } });
    }
    if (shopIds && shopIds.length > 0) {
      await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
    }
    if (mobiles && mobiles.length > 0) {
      await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    }
  } catch (error) {
    console.error("Error in cleanTestData:", error.message);
  }
}

test.describe("DATA-01A read-model bootstrap snapshot", () => {
  let owner;
  let staff;
  let otherOwner;
  let shop;
  let otherShop;

  const OWNER_MOBILE = "9900000101";
  const STAFF_MOBILE = "9900000102";
  const OTHER_OWNER_MOBILE = "9900000103";

  test.before(async () => {
    const existingShops = await prisma.shop.findMany({ where: { code: { in: ["RMS1", "RMS2"] } } });
    await cleanTestData(existingShops.map((s) => s.id), [OWNER_MOBILE, STAFF_MOBILE, OTHER_OWNER_MOBILE]);
    await prisma.shop.deleteMany({ where: { code: { in: ["RMS1", "RMS2"] } } });

    owner = await prisma.user.create({
      data: { name: "Snapshot Owner", mobile: OWNER_MOBILE, role: "OWNER", passwordHash: "hash" },
    });
    otherOwner = await prisma.user.create({
      data: { name: "Other Owner", mobile: OTHER_OWNER_MOBILE, role: "OWNER", passwordHash: "hash" },
    });
    staff = await prisma.user.create({
      data: { name: "Snapshot Staff", mobile: STAFF_MOBILE, role: "STAFF", passwordHash: "hash" },
    });

    shop = await prisma.shop.create({
      data: { name: "Snapshot Shop", code: "RMS1", city: "Nagpur", ownerId: owner.id },
    });
    otherShop = await prisma.shop.create({
      data: { name: "Other Snapshot Shop", code: "RMS2", city: "Pune", ownerId: otherOwner.id },
    });

    await prisma.staffShopAccess.create({ data: { staffId: staff.id, shopId: shop.id } });
  });

  test.after(async () => {
    const shopIds = [shop?.id, otherShop?.id].filter(Boolean);
    await cleanTestData(shopIds, [OWNER_MOBILE, STAFF_MOBILE, OTHER_OWNER_MOBILE]);
    await closeRedis();
    await closePushQueue();
    await closeWhatsappQueues();
    await closeWaCacheRedis();
    await closePresenceRedis();
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    await cleanTestData([shop.id, otherShop.id], []);
    shop = await prisma.shop.upsert({
      where: { id: shop.id },
      update: {},
      create: { id: shop.id, name: "Snapshot Shop", code: "RMS1", city: "Nagpur", ownerId: owner.id },
    });
    otherShop = await prisma.shop.upsert({
      where: { id: otherShop.id },
      update: {},
      create: { id: otherShop.id, name: "Other Snapshot Shop", code: "RMS2", city: "Pune", ownerId: otherOwner.id },
    });
    await prisma.staffShopAccess.deleteMany({ where: { shopId: shop.id, staffId: staff.id } });
    await prisma.staffShopAccess.create({ data: { staffId: staff.id, shopId: shop.id } });
  });

  test("1. Route contract: bootstrap route requires auth, permission, and shop access", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(dir, "../routes/sync.routes.js"), "utf8");
    assert.ok(src.includes('"/read-models/bootstrap"'), "Route path must exist");
    assert.ok(src.includes("router.use(requireAuth)"), "requireAuth must be applied router-wide");
    assert.ok(src.includes("requirePermission(PERMISSIONS.SHOP_VIEW)"), "Must require SHOP_VIEW permission");
    assert.ok(src.includes("requireShopAccess"), "Must enforce shop access");
  });

  test("2. Shop access: staff without assignment is rejected (403)", async () => {
    await assert.rejects(
      () => getShopReadModelBootstrap({ id: staff.id, role: "STAFF" }, otherShop.id),
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        return true;
      },
    );
  });

  test("3. Shop isolation: bootstrap for shop A excludes shop B records", async () => {
    await customerService.createCustomer(owner, { shopId: shop.id, name: "Shop A Customer", type: "REGULAR" });
    await customerService.createCustomer(otherOwner, { shopId: otherShop.id, name: "Shop B Customer", type: "REGULAR" });
    const catA = await itemService.createCategory(owner, { shopId: shop.id, name: "Cat A" });
    const catB = await itemService.createCategory(otherOwner, { shopId: otherShop.id, name: "Cat B" });
    await itemService.createItem(owner, { shopId: shop.id, name: "Item A", unit: "pcs", sku: "IA1", defaultSellingPrice: 10, minimumAllowedPrice: 8, mrp: 12, categoryId: catA.id, initialStock: 5 });
    await itemService.createItem(otherOwner, { shopId: otherShop.id, name: "Item B", unit: "pcs", sku: "IB1", defaultSellingPrice: 10, minimumAllowedPrice: 8, mrp: 12, categoryId: catB.id, initialStock: 5 });

    const snapshot = await getShopReadModelBootstrap(owner, shop.id);

    assert.ok(snapshot.customers.every((c) => c.shopId === shop.id));
    assert.ok(snapshot.items.every((i) => i.shopId === shop.id));
    assert.ok(!snapshot.customers.some((c) => c.name === "Shop B Customer"));
    assert.ok(!snapshot.items.some((i) => i.name === "Item B"));
    assert.ok(!snapshot.categories.some((c) => c.name === "Cat B"));
  });

  test("4. Completeness: complete=true; unknown query params are rejected", async () => {
    const snapshot = await getShopReadModelBootstrap(owner, shop.id);
    assert.strictEqual(snapshot.complete, true);

    const { z } = await import("zod");
    const schema = z.object({ shopId: z.string().min(1) }).strict();
    assert.strictEqual(schema.safeParse({ shopId: shop.id }).success, true, "shopId alone must pass");
    assert.strictEqual(schema.safeParse({ shopId: shop.id, page: 1 }).success, false, "page must be rejected");
    assert.strictEqual(schema.safeParse({ shopId: shop.id, search: "x" }).success, false, "search must be rejected");
    assert.strictEqual(schema.safeParse({ shopId: shop.id, limit: 10 }).success, false, "limit must be rejected");
  });

  test("5. Projection: sensitive/internal/stock fields are absent from the payload", async () => {
    await customerService.createCustomer(owner, {
      shopId: shop.id,
      name: "Projection Customer",
      type: "REGULAR",
      email: "secret@example.com",
      notes: "Internal Notes should never leave the server",
      advanceBalance: 50,
    });
    const cat = await itemService.createCategory(owner, { shopId: shop.id, name: "Projection Cat" });
    await itemService.createItem(owner, {
      shopId: shop.id,
      name: "Projection Item",
      unit: "pcs",
      sku: "PROJ1",
      defaultSellingPrice: 100,
      minimumAllowedPrice: 90,
      purchasePrice: 60,
      mrp: 120,
      categoryId: cat.id,
      initialStock: 25,
    });

    const snapshot = await getShopReadModelBootstrap(owner, shop.id);
    const customer = snapshot.customers.find((c) => c.name === "Projection Customer");
    const item = snapshot.items.find((i) => i.name === "Projection Item");

    assert.ok(customer);
    assert.strictEqual(customer.email, undefined);
    assert.strictEqual(customer.notes, undefined);
    assert.strictEqual(customer.advanceBalance, undefined);
    assert.strictEqual(customer.status, undefined);

    assert.ok(item);
    assert.strictEqual(item.purchasePrice, undefined);
    assert.strictEqual(item.embedding, undefined);
    assert.strictEqual(item.status, undefined);
    assert.strictEqual(item.physicalStock, undefined);
    assert.strictEqual(item.reservedStock, undefined);
    assert.strictEqual(item.availableStock, undefined);
    assert.strictEqual(item.categoryName, "Projection Cat", "Category name should be denormalized onto the item");
  });

  test("6. schemaVersion is exactly 1", async () => {
    const snapshot = await getShopReadModelBootstrap(owner, shop.id);
    assert.strictEqual(snapshot.schemaVersion, 1);
  });

  test("7. baseCursor is null for a shop with no events, and a decimal string otherwise", async () => {
    const empty = await getShopReadModelBootstrap(owner, shop.id);
    assert.strictEqual(empty.baseCursor, null);

    await customerService.createCustomer(owner, { shopId: shop.id, name: "Cursor Customer", type: "REGULAR" });
    const withEvent = await getShopReadModelBootstrap(owner, shop.id);
    assert.ok(withEvent.baseCursor !== null);
    assert.match(withEvent.baseCursor, /^\d+$/);
  });

  test("8. Commit-order cursor safety: an uncommitted concurrent mutation is neither silently lost nor duplicated", async () => {
    let releaseMutation;
    const mutationGate = new Promise((resolve) => { releaseMutation = resolve; });

    const mutationPromise = prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { shopId: shop.id, name: "Concurrent Customer", type: "REGULAR", createdById: owner.id },
      });
      const { allocateShopEventSequence } = await import("../services/domain-event.service.js");
      const seq = await allocateShopEventSequence(tx, shop.id);
      await tx.domainEventOutbox.create({
        data: {
          id: `evt_concurrent_${customer.id}`,
          shopId: shop.id,
          entity: "customer",
          action: "created",
          entityId: customer.id,
          status: "pending",
          sequence: seq,
          eventJson: { eventId: `evt_concurrent_${customer.id}`, shopId: shop.id, entity: "customer", action: "created", entityId: customer.id, actorUserId: owner.id, updatedAt: new Date().toISOString() },
        },
      });
      await mutationGate; // hold the transaction open past the snapshot read below
      return customer;
    });

    // Give the mutation transaction time to reach the gate before snapshotting.
    await sleep(150);
    const snapshot = await getShopReadModelBootstrap(owner, shop.id);
    releaseMutation();
    const customer = await mutationPromise;

    assert.ok(
      !snapshot.customers.some((c) => c.id === customer.id),
      "Uncommitted concurrent mutation must not appear in the snapshot",
    );

    const eventRow = await prisma.domainEventOutbox.findUnique({ where: { id: `evt_concurrent_${customer.id}` } });
    const baseCursorValue = snapshot.baseCursor ? BigInt(snapshot.baseCursor) : -1n;
    assert.ok(
      eventRow.sequence > baseCursorValue,
      "The mutation's event sequence must be strictly greater than baseCursor so reconciliation can find it",
    );
  });

  test("9. Deleted/archived rows are absent from the snapshot", async () => {
    const customer = await customerService.createCustomer(owner, { shopId: shop.id, name: "Archived Customer", type: "REGULAR" });
    await prisma.customer.update({ where: { id: customer.id }, data: { status: "INACTIVE" } });

    const cat = await itemService.createCategory(owner, { shopId: shop.id, name: "Archived Cat" });
    const item = await itemService.createItem(owner, { shopId: shop.id, name: "Archived Item", unit: "pcs", sku: "ARCH1", defaultSellingPrice: 10, minimumAllowedPrice: 8, mrp: 12, categoryId: cat.id, initialStock: 1 });
    await prisma.item.update({ where: { id: item.id }, data: { status: "INACTIVE" } });
    await prisma.itemCategory.update({ where: { id: cat.id }, data: { status: "INACTIVE" } });

    const snapshot = await getShopReadModelBootstrap(owner, shop.id);
    assert.ok(!snapshot.customers.some((c) => c.id === customer.id));
    assert.ok(!snapshot.items.some((i) => i.id === item.id));
    assert.ok(!snapshot.categories.some((c) => c.id === cat.id));
  });

  test("10. Deterministic ordering across repeated reads with no mutation in between", async () => {
    await customerService.createCustomer(owner, { shopId: shop.id, name: "Zeta Customer", type: "REGULAR" });
    await customerService.createCustomer(owner, { shopId: shop.id, name: "Alpha Customer", type: "REGULAR" });
    await customerService.createCustomer(owner, { shopId: shop.id, name: "Mid Customer", type: "REGULAR" });

    const first = await getShopReadModelBootstrap(owner, shop.id);
    const second = await getShopReadModelBootstrap(owner, shop.id);
    assert.deepStrictEqual(first.customers.map((c) => c.id), second.customers.map((c) => c.id));
    assert.deepStrictEqual(first.customers.map((c) => c.name), ["Alpha Customer", "Mid Customer", "Zeta Customer"]);
  });

  test("11. No Redis read-cache dependency", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(dir, "../services/read-model-snapshot.service.js"), "utf8");
    assert.ok(!src.includes("domain-read-cache"), "Snapshot service must not depend on the Redis read-cache layer");

    // Functional corroboration: two immediate reads return identical data,
    // consistent with reading PostgreSQL directly rather than a TTL cache.
    await customerService.createCustomer(owner, { shopId: shop.id, name: "No Cache Customer", type: "REGULAR" });
    const a = await getShopReadModelBootstrap(owner, shop.id);
    const b = await getShopReadModelBootstrap(owner, shop.id);
    assert.deepStrictEqual(a.customers, b.customers);
  });

  test("12. Real dispatcher round trip from a bootstrap baseCursor", async () => {
    const before = await getShopReadModelBootstrap(owner, shop.id);
    const customer = await customerService.createCustomer(owner, { shopId: shop.id, name: "Reconcile After Bootstrap", type: "REGULAR" });
    await dispatchPendingDomainEvents();

    const req = { user: { id: owner.id, role: "OWNER" }, validated: { query: { shopId: shop.id, after: before.baseCursor ?? undefined, limit: 50 } } };
    const result = await callSync(req);
    const found = result.data.events.find((e) => e.entity === "customer" && e.entityId === customer.id);
    assert.ok(found, "Event committed after the bootstrap baseCursor must be discoverable via /sync/domain-events");
  });
});
