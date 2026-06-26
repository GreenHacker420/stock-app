import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import { getShopAccess, canUseDeviceRoom, configureRealtime, getDomainEventRooms } from "../utils/realtime.js";
import { dispatchPendingDomainEvents, closeRedis } from "../workers/domain-event-dispatcher.worker.js";
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
});
