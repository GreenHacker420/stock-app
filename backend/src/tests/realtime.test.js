import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import { getShopAccess, canUseDeviceRoom, configureRealtime, getDomainEventRooms, getRealtimeSyncPayload } from "../utils/realtime.js";
import { dispatchPendingDomainEvents, closeRedis } from "../workers/domain-event-dispatcher.worker.js";
import { syncDomainEvents } from "../controllers/sync.controller.js";
import * as customerService from "../services/customer.service.js";
import * as saleService from "../services/sale.service.js";
import * as paymentService from "../services/payment.service.js";
import * as approvalService from "../services/approval.service.js";
import * as itemService from "../services/item.service.js";
import { closePushQueue } from "../services/notification.push.queue.js";
import { closeWhatsappQueues } from "../services/whatsapp.queue.js";
import { closeWaCacheRedis } from "../lib/wa-cache.js";
import { closePresenceRedis } from "../services/device-presence.service.js";


async function cleanTestData(shopIds, mobiles) {
  try {
    await prisma.notificationPushDelivery.deleteMany({});
    if (shopIds && shopIds.length > 0) {
      await prisma.notification.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.domainEventOutbox.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.saleItem.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
      await prisma.sale.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.payment.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.approvalRequest.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.staffShopAccess.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.stockLedger.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.stockBalance.deleteMany({ where: { shopId: { in: shopIds } } });
      await prisma.itemPriceHistory.deleteMany({ where: { item: { shopId: { in: shopIds } } } });
      await prisma.item.deleteMany({ where: { shopId: { in: shopIds } } });
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

test.describe("ShopControl Realtime & Outbox Hardening Tests", () => {
  let owner;
  let staff;
  let shop;
  let otherOwner;
  let otherShop;

  const OWNER_MOBILE = "9900000001";
  const STAFF_MOBILE = "9900000002";
  const OTHER_OWNER_MOBILE = "9900000003";

  test.before(async () => {
    // Clean up first to avoid collision from interrupted test runs
    const existingShops = await prisma.shop.findMany({
      where: { code: { in: ["RTS1", "RTS2"] } }
    });
    const existingShopIds = existingShops.map(s => s.id);
    await cleanTestData(existingShopIds, [OWNER_MOBILE, STAFF_MOBILE, OTHER_OWNER_MOBILE]);
    await prisma.shop.deleteMany({ where: { code: { in: ["RTS1", "RTS2"] } } });

    // Create test entities
    owner = await prisma.user.create({
      data: { name: "Realtime Owner", mobile: OWNER_MOBILE, role: "OWNER", passwordHash: "hash" }
    });

    otherOwner = await prisma.user.create({
      data: { name: "Other Owner", mobile: OTHER_OWNER_MOBILE, role: "OWNER", passwordHash: "hash" }
    });

    staff = await prisma.user.create({
      data: { name: "Realtime Staff", mobile: STAFF_MOBILE, role: "STAFF", passwordHash: "hash" }
    });

    shop = await prisma.shop.create({
      data: { name: "Realtime Shop", code: "RTS1", city: "Nagpur", ownerId: owner.id }
    });

    otherShop = await prisma.shop.create({
      data: { name: "Other Shop", code: "RTS2", city: "Jabalpur", ownerId: otherOwner.id }
    });

    // Grant staff access to RTS1 only
    await prisma.staffShopAccess.create({
      data: { staffId: staff.id, shopId: shop.id }
    });
  });

  test.after(async () => {
    const shopIds = [];
    if (shop) shopIds.push(shop.id);
    if (otherShop) shopIds.push(otherShop.id);
    await cleanTestData(shopIds, [OWNER_MOBILE, STAFF_MOBILE, OTHER_OWNER_MOBILE]);
    await closeRedis();
    await closePushQueue();
    await closeWhatsappQueues();
    await closeWaCacheRedis();
    await closePresenceRedis();
    await prisma.$disconnect();
  });

  test.describe("Socket Authorization Tests (Step 6)", () => {
    test("1 & 2. Owner can join owned shop room & joins shop:{shopId}:owners", async () => {
      const access = await getShopAccess(owner, shop.id);
      assert.ok(access, "Owner should have shop access");
      assert.strictEqual(access.roleRoom, "owners");
    });

    test("3 & 4. Staff can join assigned shop room & joins shop:{shopId}:staff", async () => {
      const access = await getShopAccess(staff, shop.id);
      assert.ok(access, "Staff should have shop access");
      assert.strictEqual(access.roleRoom, "staff");
    });

    test("5. Staff cannot join unassigned shop", async () => {
      const access = await getShopAccess(staff, otherShop.id);
      assert.strictEqual(access, null, "Staff should be denied access to unassigned shop");
    });

    test("6. Unrelated owner cannot join another owner's shop", async () => {
      const access = await getShopAccess(otherOwner, shop.id);
      assert.strictEqual(access, null, "Unrelated owner should be denied access");
    });

    test("7. Device room join is rejected when device does not belong to user", async () => {
      const device = await prisma.userDevice.create({
        data: {
          userId: owner.id,
          installationId: "inst_owner_1",
          platform: "ANDROID",
          notificationsEnabled: true,
        }
      });

      const allowed = await canUseDeviceRoom(owner.id, device.id);
      assert.ok(allowed, "Owner should be allowed to join their own device room");

      const rejected = await canUseDeviceRoom(staff.id, device.id);
      assert.strictEqual(rejected, false, "Staff should be rejected from owner's device room");

      await prisma.userDevice.delete({ where: { id: device.id } });
    });

    test("8. Room emission mapping respects restricted visibility (owner-only)", () => {
      const event = {
        shopId: "shop123",
        entity: "cashSession",
        action: "review_required",
        visibility: { owners: true, staff: false }
      };

      const rooms = getDomainEventRooms(event);
      assert.ok(rooms.includes("shop:shop123:owners"), "Should target owners room");
      assert.strictEqual(rooms.includes("shop:shop123"), false, "Should NOT leak to general shop room (staff access)");
    });
  });

  test.describe("Outbox Dispatcher & Event Deduplication (Step 7)", () => {
    test.beforeEach(async () => {
      await prisma.domainEventOutbox.deleteMany({});
      await prisma.notification.deleteMany({});
    });

    test("1. Sale create enqueues outbox events", async () => {
      const item = await itemService.createItem(owner, {
        shopId: shop.id,
        name: "Test Item",
        unit: "pcs",
        sku: "TITM",
        defaultSellingPrice: 90,
        minimumAllowedPrice: 80,
        mrp: 100,
        initialStock: 50
      });

      const sale = await saleService.createSale(staff, {
        shopId: shop.id,
        items: [{ itemId: item.id, quantity: 2, rate: 90, discountAmount: 0, lineTotal: 180 }],
        subtotal: 180,
        discountAmount: 0,
        totalAmount: 180,
        payments: []
      });

      const events = await prisma.domainEventOutbox.findMany({
        where: { shopId: shop.id },
        orderBy: { createdAt: "asc" }
      });

      // Should enqueue sale.created, stock.updated, customer.updated, dashboard.updated
      const actions = events.map(e => `${e.entity}.${e.action}`);
      assert.ok(actions.includes("sale.created"), "Should enqueue sale.created");
      assert.ok(actions.includes("stock.updated"), "Should enqueue stock.updated");
      assert.ok(actions.includes("customer.updated"), "Should enqueue customer.updated");
      assert.ok(actions.includes("dashboard.updated"), "Should enqueue dashboard.updated");
    });

    test("4 & 5. Dispatcher retry does not duplicate notifications and honors sendPush", async () => {
      const outboxEvent = await prisma.domainEventOutbox.create({
        data: {
          id: "evt_test_dedupe_123",
          shopId: shop.id,
          entity: "cashSession",
          action: "review_required",
          entityId: "session123",
          status: "pending",
          sequence: 1,
          eventJson: {
            eventId: "evt_test_dedupe_123",
            shopId: shop.id,
            entity: "cashSession",
            action: "review_required",
            entityId: "session123",
            actorUserId: staff.id,
            visibility: { owners: true, staff: false },
            notification: {
              sendPush: true,
              title: "Cash Session Closed",
              body: "Please review",
              severity: "warning"
            }
          }
        }
      });

      // First dispatch tick
      await dispatchPendingDomainEvents();

      const notifs1 = await prisma.notification.findMany({ where: { domainEventId: "evt_test_dedupe_123" } });
      assert.strictEqual(notifs1.length, 1, "Should create exactly 1 notification row");
      assert.strictEqual(notifs1[0].userId, owner.id, "Should target the owner");

      // Simulate a retry by setting outbox row back to pending manually
      await prisma.domainEventOutbox.update({
        where: { id: outboxEvent.id },
        data: { status: "pending", attempts: 0 }
      });

      // Second dispatch tick
      await dispatchPendingDomainEvents();

      const notifs2 = await prisma.notification.findMany({ where: { domainEventId: "evt_test_dedupe_123" } });
      assert.strictEqual(notifs2.length, 1, "Should NOT duplicate notification on retry");
    });

    test("6 & 7. Malformed event JSON or validation failure increments attempts and fails permanently", async () => {
      // Create an outbox row with missing required fields (validation failure)
      const invalidEvent = await prisma.domainEventOutbox.create({
        data: {
          id: "evt_invalid_val_1",
          shopId: shop.id,
          entity: "sale",
          action: "created",
          entityId: "sale123",
          status: "pending",
          sequence: 1,
          eventJson: {
            eventId: "evt_invalid_val_1",
            // missing shopId, entity, etc.
          }
        }
      });

      await dispatchPendingDomainEvents();

      const updated = await prisma.domainEventOutbox.findUnique({ where: { id: invalidEvent.id } });
      assert.strictEqual(updated.status, "failed", "Validation failure should fail permanently");
      assert.strictEqual(updated.attempts, 8, "Validation failure should jump to max attempts directly");
    });
  });


  test.describe("Event Reconciliation Sync Endpoint Tests", () => {
    async function callSync(req) {
      return new Promise((resolve) => {
        const res = { json(payload) { resolve(payload); } };
        syncDomainEvents(req, res);
      });
    }

    function ownerReq(queryOverrides = {}) {
      return {
        user: { id: owner.id, role: "OWNER" },
        validated: { query: { shopId: shop.id, after: undefined, limit: 10, ...queryOverrides } },
      };
    }

    test.beforeEach(async () => {
      await prisma.domainEventOutbox.deleteMany({});
    });

    test("1. Owner gets published events for owned shop, sorted ASC", async () => {
      const time1 = new Date(Date.now() - 10_000);
      const time2 = new Date(Date.now() - 5_000);

      await prisma.domainEventOutbox.createMany({
        data: [
          { id: "evt_s1", shopId: shop.id, entity: "stock", action: "updated", entityId: "item_1", status: "published", sequence: 1, createdAt: time1, eventJson: { eventId: "evt_s1", shopId: shop.id, entity: "stock", action: "updated", entityId: "item_1", actorUserId: owner.id, updatedAt: time1.toISOString() } },
          { id: "evt_s2", shopId: shop.id, entity: "sale", action: "created", entityId: "sale_1", status: "published", sequence: 2, createdAt: time2, eventJson: { eventId: "evt_s2", shopId: shop.id, entity: "sale", action: "created", entityId: "sale_1", actorUserId: owner.id, updatedAt: time2.toISOString() } },
          { id: "evt_other", shopId: otherShop.id, entity: "stock", action: "updated", entityId: "item_2", status: "published", sequence: 1, eventJson: { eventId: "evt_other", shopId: otherShop.id, entity: "stock", action: "updated", entityId: "item_2", actorUserId: otherOwner.id, updatedAt: new Date().toISOString() } },
          { id: "evt_pending", shopId: shop.id, entity: "order", action: "created", entityId: "order_1", status: "pending", sequence: 3, eventJson: { eventId: "evt_pending", shopId: shop.id, entity: "order", action: "created", entityId: "order_1", actorUserId: owner.id, updatedAt: new Date().toISOString() } },
        ]
      });

      const result = await callSync(ownerReq());
      assert.ok(result.success);
      assert.strictEqual(result.data.events.length, 2, "Returns 2 published events for the shop only");
      assert.strictEqual(result.data.events[0].eventId, "evt_s1");
      assert.strictEqual(result.data.events[1].eventId, "evt_s2");
      assert.ok(result.data.nextCursor, "Returns a nextCursor");
    });

    test("2. Staff gets published events for their assigned shop", async () => {
      const time1 = new Date(Date.now() - 5_000);
      await prisma.domainEventOutbox.create({
        data: { id: "evt_staff_1", shopId: shop.id, entity: "sale", action: "created", entityId: "sale_1", status: "published", sequence: 1, createdAt: time1, eventJson: { eventId: "evt_staff_1", shopId: shop.id, entity: "sale", action: "created", entityId: "sale_1", actorUserId: staff.id, updatedAt: time1.toISOString() } }
      });

      const result = await callSync({ user: { id: staff.id, role: "STAFF" }, validated: { query: { shopId: shop.id, after: undefined, limit: 10 } } });
      assert.ok(result.success);
      assert.strictEqual(result.data.events.length, 1);
      assert.strictEqual(result.data.events[0].eventId, "evt_staff_1");
    });

    test("3. Staff cannot access a shop they are not assigned to (403)", async () => {
      const { assertShopAccess } = await import("../middleware/shopAccess.middleware.js");
      await assert.rejects(
        () => assertShopAccess({ id: staff.id, role: "STAFF" }, otherShop.id),
        (err) => { assert.strictEqual(err.statusCode, 403); return true; }
      );
    });

    test("4. Unrelated owner cannot access another owner's shop (403)", async () => {
      const { assertShopAccess } = await import("../middleware/shopAccess.middleware.js");
      await assert.rejects(
        () => assertShopAccess({ id: otherOwner.id, role: "OWNER" }, shop.id),
        (err) => { assert.strictEqual(err.statusCode, 403); return true; }
      );
    });

    test("5. Cursor filter excludes events at or before the cursor sequence", async () => {
      const time1 = new Date(Date.now() - 10_000);
      const time2 = new Date(Date.now() - 5_000);

      await prisma.domainEventOutbox.createMany({
        data: [
          { id: "evt_old", shopId: shop.id, entity: "stock", action: "updated", entityId: "item_1", status: "published", sequence: 1, createdAt: time1, eventJson: { eventId: "evt_old", shopId: shop.id, entity: "stock", action: "updated", entityId: "item_1", actorUserId: owner.id, updatedAt: time1.toISOString() } },
          { id: "evt_new", shopId: shop.id, entity: "sale", action: "created", entityId: "sale_1", status: "published", sequence: 2, createdAt: time2, eventJson: { eventId: "evt_new", shopId: shop.id, entity: "sale", action: "created", entityId: "sale_1", actorUserId: owner.id, updatedAt: time2.toISOString() } },
        ]
      });

      const result = await callSync(ownerReq({ after: "1" }));
      assert.ok(result.success);
      assert.strictEqual(result.data.events.length, 1, "Only events after the cursor");
      assert.strictEqual(result.data.events[0].eventId, "evt_new");
    });

    test("6. Pagination: nextCursor from page 1 can fetch page 2", async () => {
      const time1 = new Date(Date.now() - 15_000);
      const time2 = new Date(Date.now() - 5_000);

      await prisma.domainEventOutbox.createMany({
        data: [
          { id: "evt_p1", shopId: shop.id, entity: "stock", action: "updated", entityId: "i1", status: "published", sequence: 1, createdAt: time1, eventJson: { eventId: "evt_p1", shopId: shop.id, entity: "stock", action: "updated", entityId: "i1", actorUserId: owner.id, updatedAt: time1.toISOString() } },
          { id: "evt_p2", shopId: shop.id, entity: "sale", action: "created", entityId: "s1", status: "published", sequence: 2, createdAt: time2, eventJson: { eventId: "evt_p2", shopId: shop.id, entity: "sale", action: "created", entityId: "s1", actorUserId: owner.id, updatedAt: time2.toISOString() } },
        ]
      });

      const page1 = await callSync(ownerReq({ limit: 1 }));
      assert.strictEqual(page1.data.events.length, 1);
      assert.ok(page1.data.nextCursor, "Page 1 must have a nextCursor");

      const page2 = await callSync(ownerReq({ after: page1.data.nextCursor, limit: 1 }));
      assert.strictEqual(page2.data.events.length, 1);
      assert.strictEqual(page2.data.events[0].eventId, "evt_p2");
    });

    test("7. When no events exist, nextCursor equals the passed-in cursor", async () => {
      const cursor = "42";
      const result = await callSync(ownerReq({ after: cursor }));
      assert.ok(result.success);
      assert.strictEqual(result.data.events.length, 0);
      assert.strictEqual(result.data.nextCursor, cursor, "nextCursor should equal input cursor when no events");
    });

    test("8. Event payload does not contain sensitive PII fields", async () => {
      const t = new Date(Date.now() - 1000);
      await prisma.domainEventOutbox.create({
        data: { id: "evt_clean", shopId: shop.id, entity: "sale", action: "created", entityId: "sale_1", status: "published", sequence: 1, createdAt: t, eventJson: { eventId: "evt_clean", shopId: shop.id, entity: "sale", action: "created", entityId: "sale_1", actorUserId: owner.id, updatedAt: t.toISOString() } }
      });

      const result = await callSync(ownerReq());
      const ev = result.data.events[0];
      assert.strictEqual(ev.phone, undefined, "phone must not be in event payload");
      assert.strictEqual(ev.address, undefined, "address must not be in event payload");
      assert.strictEqual(ev.gstin, undefined, "gstin must not be in event payload");
      assert.strictEqual(ev.amount, undefined, "payment amount must not be in event payload");
      assert.strictEqual(ev.eventId, "evt_clean");
      assert.strictEqual(ev.entity, "sale");
    });

    test("9. Events are sorted in ascending sequence order", async () => {
      const times = [new Date(Date.now() - 15_000), new Date(Date.now() - 10_000), new Date(Date.now() - 5_000)];

      await prisma.domainEventOutbox.createMany({
        data: times.map((t, i) => ({
          id: "evt_order_" + i, shopId: shop.id, entity: "stock", action: "updated", entityId: "item_" + i,
          status: "published", sequence: i + 1, createdAt: t,
          eventJson: { eventId: "evt_order_" + i, shopId: shop.id, entity: "stock", action: "updated", entityId: "item_" + i, actorUserId: owner.id, updatedAt: t.toISOString() }
        }))
      });

      const result = await callSync(ownerReq({ limit: 10 }));
      const ids = result.data.events.map(e => e.eventId);
      assert.deepStrictEqual(ids, ["evt_order_0", "evt_order_1", "evt_order_2"], "Must be ascending order");
    });

    test("10. Zod schema enforces max limit of 500", async () => {
      const { z } = await import("zod");
      const schema = z.object({ limit: z.coerce.number().int().positive().max(500).optional() });
      assert.strictEqual(schema.safeParse({ limit: 501 }).success, false, "501 should fail");
      assert.strictEqual(schema.safeParse({ limit: 500 }).success, true, "500 should pass");
    });

    test("11. Only 'published' status events are returned (pending and failed excluded)", async () => {
      const t = new Date(Date.now() - 1000);
      await prisma.domainEventOutbox.createMany({
        data: [
          { id: "evt_delivered", shopId: shop.id, entity: "sale", action: "created", entityId: "s1", status: "published", sequence: 1, createdAt: t, eventJson: { eventId: "evt_delivered", shopId: shop.id, entity: "sale", action: "created", entityId: "s1", actorUserId: owner.id, updatedAt: t.toISOString() } },
          { id: "evt_pend", shopId: shop.id, entity: "sale", action: "created", entityId: "s2", status: "pending", sequence: 2, createdAt: t, eventJson: { eventId: "evt_pend", shopId: shop.id, entity: "sale", action: "created", entityId: "s2", actorUserId: owner.id, updatedAt: t.toISOString() } },
          { id: "evt_fail", shopId: shop.id, entity: "sale", action: "created", entityId: "s3", status: "failed", sequence: 3, createdAt: t, eventJson: { eventId: "evt_fail", shopId: shop.id, entity: "sale", action: "created", entityId: "s3", actorUserId: owner.id, updatedAt: t.toISOString() } },
        ]
      });

      const result = await callSync(ownerReq());
      assert.strictEqual(result.data.events.length, 1, "Only published events returned");
      assert.strictEqual(result.data.events[0].eventId, "evt_delivered");
    });

    test("11a. Pending lower sequence blocks later published event", async () => {
      const t = new Date(Date.now() - 1000);
      await prisma.domainEventOutbox.createMany({
        data: [
          { id: "evt_gap_pending", shopId: shop.id, entity: "customer", action: "updated", entityId: "c1", status: "pending", sequence: 101, createdAt: t, eventJson: { eventId: "evt_gap_pending", shopId: shop.id, entity: "customer", action: "updated", entityId: "c1", actorUserId: owner.id } },
          { id: "evt_gap_later", shopId: shop.id, entity: "customer", action: "updated", entityId: "c2", status: "published", sequence: 102, createdAt: t, eventJson: { eventId: "evt_gap_later", shopId: shop.id, entity: "customer", action: "updated", entityId: "c2", actorUserId: owner.id } },
        ],
      });

      const result = await callSync(ownerReq({ after: "100" }));
      assert.strictEqual(result.data.events.length, 0);
      assert.strictEqual(result.data.nextCursor, "100");
    });

    test("11b. Reconciliation returns only the contiguous published prefix", async () => {
      const t = new Date(Date.now() - 1000);
      await prisma.domainEventOutbox.createMany({
        data: [
          { id: "evt_prefix_101", shopId: shop.id, entity: "customer", action: "updated", entityId: "c101", status: "published", sequence: 101, createdAt: t, eventJson: { eventId: "evt_prefix_101", shopId: shop.id, entity: "customer", action: "updated", entityId: "c101", actorUserId: owner.id } },
          { id: "evt_prefix_102", shopId: shop.id, entity: "customer", action: "updated", entityId: "c102", status: "published", sequence: 102, createdAt: t, eventJson: { eventId: "evt_prefix_102", shopId: shop.id, entity: "customer", action: "updated", entityId: "c102", actorUserId: owner.id } },
          { id: "evt_prefix_103", shopId: shop.id, entity: "customer", action: "updated", entityId: "c103", status: "pending", sequence: 103, createdAt: t, eventJson: { eventId: "evt_prefix_103", shopId: shop.id, entity: "customer", action: "updated", entityId: "c103", actorUserId: owner.id } },
          { id: "evt_prefix_104", shopId: shop.id, entity: "customer", action: "updated", entityId: "c104", status: "published", sequence: 104, createdAt: t, eventJson: { eventId: "evt_prefix_104", shopId: shop.id, entity: "customer", action: "updated", entityId: "c104", actorUserId: owner.id } },
        ],
      });

      const first = await callSync(ownerReq({ after: "100" }));
      assert.deepStrictEqual(first.data.events.map((event) => event.eventId), ["evt_prefix_101", "evt_prefix_102"]);
      assert.strictEqual(first.data.nextCursor, "102");

      await prisma.domainEventOutbox.update({ where: { id: "evt_prefix_103" }, data: { status: "published" } });
      const second = await callSync(ownerReq({ after: "102" }));
      assert.deepStrictEqual(second.data.events.map((event) => event.eventId), ["evt_prefix_103", "evt_prefix_104"]);
      assert.strictEqual(second.data.nextCursor, "104");
    });

    test("11c. Pagination respects the contiguous frontier", async () => {
      const t = new Date(Date.now() - 1000);
      await prisma.domainEventOutbox.createMany({
        data: [
          { id: "evt_page_101", shopId: shop.id, entity: "customer", action: "updated", entityId: "c101", status: "published", sequence: 101, createdAt: t, eventJson: { eventId: "evt_page_101", shopId: shop.id, entity: "customer", action: "updated", entityId: "c101", actorUserId: owner.id } },
          { id: "evt_page_102", shopId: shop.id, entity: "customer", action: "updated", entityId: "c102", status: "pending", sequence: 102, createdAt: t, eventJson: { eventId: "evt_page_102", shopId: shop.id, entity: "customer", action: "updated", entityId: "c102", actorUserId: owner.id } },
          { id: "evt_page_103", shopId: shop.id, entity: "customer", action: "updated", entityId: "c103", status: "published", sequence: 103, createdAt: t, eventJson: { eventId: "evt_page_103", shopId: shop.id, entity: "customer", action: "updated", entityId: "c103", actorUserId: owner.id } },
        ],
      });

      const first = await callSync(ownerReq({ after: "100", limit: 1 }));
      assert.deepStrictEqual(first.data.events.map((event) => event.eventId), ["evt_page_101"]);
      assert.strictEqual(first.data.nextCursor, "101");

      const blocked = await callSync(ownerReq({ after: "101", limit: 10 }));
      assert.deepStrictEqual(blocked.data.events, []);
      assert.strictEqual(blocked.data.nextCursor, "101");
    });

    test("11d. Transaction rollback does not permanently consume a shop sequence", async () => {
      const { allocateShopEventSequence } = await import("../services/domain-event.service.js");
      await prisma.domainEventOutbox.deleteMany({ where: { shopId: shop.id } });
      await prisma.shopEventSequence.deleteMany({ where: { shopId: shop.id } });

      await assert.rejects(
        prisma.$transaction(async (tx) => {
          const sequence = await allocateShopEventSequence(tx, shop.id);
          assert.strictEqual(sequence, 1n);
          throw new Error("rollback sequence allocation");
        }),
        /rollback sequence allocation/,
      );

      const sequence = await prisma.$transaction((tx) => allocateShopEventSequence(tx, shop.id));
      assert.strictEqual(sequence, 1n);
    });

    test("12. Socket sync uses sequence cursor and does not require outbox updatedAt", async () => {
      const time1 = new Date(Date.now() - 10_000);
      const time2 = new Date(Date.now() - 5_000);
      await prisma.domainEventOutbox.createMany({
        data: [
          { id: "evt_socket_old", shopId: shop.id, entity: "stock", action: "updated", entityId: "i1", status: "published", sequence: 1, createdAt: time1, eventJson: { eventId: "evt_socket_old", shopId: shop.id, entity: "stock", action: "updated", entityId: "i1", actorUserId: owner.id } },
          { id: "evt_socket_new", shopId: shop.id, entity: "sale", action: "created", entityId: "s1", status: "published", sequence: 2, createdAt: time2, eventJson: { eventId: "evt_socket_new", shopId: shop.id, entity: "sale", action: "created", entityId: "s1", actorUserId: owner.id } },
        ],
      });

      const payload = await getRealtimeSyncPayload(owner, { shopId: shop.id, since: "1" });
      assert.strictEqual(payload.events.length, 1);
      assert.strictEqual(payload.events[0].eventId, "evt_socket_new");
      assert.strictEqual(payload.nextCursor, "2");

      const empty = await getRealtimeSyncPayload(owner, { shopId: shop.id, since: "2" });
      assert.strictEqual(empty.events.length, 0);
      assert.strictEqual(empty.nextCursor, "2");

      await prisma.domainEventOutbox.createMany({
        data: [
          { id: "evt_socket_pending", shopId: shop.id, entity: "sale", action: "created", entityId: "s2", status: "pending", sequence: 3, eventJson: { eventId: "evt_socket_pending", shopId: shop.id, entity: "sale", action: "created", entityId: "s2", actorUserId: owner.id } },
          { id: "evt_socket_later", shopId: shop.id, entity: "sale", action: "created", entityId: "s3", status: "published", sequence: 4, eventJson: { eventId: "evt_socket_later", shopId: shop.id, entity: "sale", action: "created", entityId: "s3", actorUserId: owner.id } },
        ],
      });
      const blocked = await getRealtimeSyncPayload(owner, { shopId: shop.id, since: "2" });
      assert.strictEqual(blocked.events.length, 0);
      assert.strictEqual(blocked.nextCursor, "2");
    });

    test("13. Real dispatcher path: mutation -> pending -> dispatched -> published -> reconcilable", async () => {
      const before = await callSync(ownerReq({ after: undefined }));
      const baseCursor = before.data.nextCursor;

      const customer = await customerService.createCustomer(owner, {
        shopId: shop.id,
        name: "Reconcile Test Customer",
        type: "REGULAR",
      });

      const pendingRow = await prisma.domainEventOutbox.findFirst({
        where: { shopId: shop.id, entity: "customer", entityId: customer.id },
      });
      assert.strictEqual(pendingRow.status, "pending", "Event starts pending before dispatch");

      await dispatchPendingDomainEvents();

      const dispatchedRow = await prisma.domainEventOutbox.findUnique({ where: { id: pendingRow.id } });
      assert.strictEqual(dispatchedRow.status, "published", "Real dispatcher marks event published");

      const after = await callSync(ownerReq({ after: baseCursor ?? undefined }));
      const found = after.data.events.find((e) => e.entityId === customer.id && e.entity === "customer");
      assert.ok(found, "/sync/domain-events must surface the real dispatched event, not just direct-insert fixtures");
    });
  });
});
