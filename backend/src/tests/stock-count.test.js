import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import * as stockService from "../services/stock.service.js";
import * as stockCountService from "../services/stock-count.service.js";
import * as approvalService from "../services/approval.service.js";
import { closePushQueue } from "../services/notification.push.queue.js";

const SHOP_CODE = "PHYCOUNT";
const OWNER_MOBILE = "9933330101";
const STAFF_MOBILE = "9933330102";

async function cleanup() {
  const shop = await prisma.shop.findUnique({
    where: { code: SHOP_CODE },
    select: { id: true },
  });

  if (shop) {
    const shopId = shop.id;
    await prisma.notificationPushDelivery.deleteMany({
      where: { notification: { shopId } },
    });
    await prisma.notification.deleteMany({ where: { shopId } });
    await prisma.domainEventOutbox.deleteMany({ where: { shopId } });
    await prisma.idempotencyKey.deleteMany({ where: { shopId } });
    await prisma.approvalRequest.deleteMany({ where: { shopId } });
    await prisma.auditLog.deleteMany({ where: { shopId } });
    await prisma.stockReservation.deleteMany({ where: { shopId } });
    await prisma.orderItem.deleteMany({ where: { order: { shopId } } });
    await prisma.order.deleteMany({ where: { shopId } });
    await prisma.stockLedger.deleteMany({ where: { shopId } });
    await prisma.stockBalance.deleteMany({ where: { shopId } });
    await prisma.itemBundleComponent.deleteMany({
      where: { parentItem: { shopId } },
    });
    await prisma.item.deleteMany({ where: { shopId } });
    await prisma.customer.deleteMany({ where: { shopId } });
    await prisma.staffShopAccess.deleteMany({ where: { shopId } });
    await prisma.shop.delete({ where: { id: shopId } });
  }

  await prisma.userDevice.deleteMany({
    where: { user: { mobile: { in: [OWNER_MOBILE, STAFF_MOBILE] } } },
  });
  await prisma.user.deleteMany({
    where: { mobile: { in: [OWNER_MOBILE, STAFF_MOBILE] } },
  });
}

async function currentPhysical(user, shopId, itemId) {
  const [row] = await stockService.getCurrentStock(user, { shopId, itemId });
  return row;
}

async function assertApiReject(fn, status) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof ApiError);
    assert.strictEqual(error.statusCode || error.status, status);
    return true;
  });
}

test.describe("Physical stock reconciliation", () => {
  let owner;
  let staff;
  let shop;
  let item;
  let customer;

  test.before(async () => {
    await cleanup();

    owner = await prisma.user.create({
      data: {
        name: "Physical Count Owner",
        mobile: OWNER_MOBILE,
        passwordHash: "hash",
        role: "OWNER",
      },
    });
    staff = await prisma.user.create({
      data: {
        name: "Physical Count Staff",
        mobile: STAFF_MOBILE,
        passwordHash: "hash",
        role: "STAFF",
        staffOwnerId: owner.id,
      },
    });
    shop = await prisma.shop.create({
      data: {
        name: "Physical Count Shop",
        code: SHOP_CODE,
        city: "Nagpur",
        ownerId: owner.id,
      },
    });
    await prisma.staffShopAccess.create({
      data: { staffId: staff.id, shopId: shop.id },
    });
    customer = await prisma.customer.create({
      data: {
        shopId: shop.id,
        name: "Physical Count Customer",
        type: "REGULAR",
        createdById: owner.id,
      },
    });
    item = await prisma.item.create({
      data: {
        shopId: shop.id,
        name: "Physical Count Item",
        sku: "PHY-COUNT-ITEM",
        unit: "pcs",
        defaultSellingPrice: 100,
        minimumStock: 0,
      },
    });
    await prisma.stockLedger.create({
      data: {
        shopId: shop.id,
        itemId: item.id,
        movementType: "OPENING_STOCK",
        quantityIn: 20,
        quantityOut: 0,
        createdById: owner.id,
      },
    });
  });

  test.after(async () => {
    await cleanup();
    await closePushQueue();
  });

  test("owner count posts only the positive variance", async () => {
    const result = await stockCountService.reconcilePhysicalStock(owner, {
      shopId: shop.id,
      itemId: item.id,
      countedPhysical: 23,
      reason: "Cycle count",
    });

    assert.strictEqual(result.isRequest, false);
    assert.strictEqual(result.currentPhysical, 20);
    assert.strictEqual(result.physicalStock, 23);
    assert.strictEqual(result.variance, 3);
    assert.strictEqual(Number(result.movement.quantityIn), 3);
    assert.strictEqual(Number(result.movement.quantityOut), 0);
    assert.strictEqual(result.movement.movementType, "MANUAL_ADJUSTMENT");
  });

  test("owner count posts a positive quantityOut for negative variance", async () => {
    const result = await stockCountService.reconcilePhysicalStock(owner, {
      shopId: shop.id,
      itemId: item.id,
      countedPhysical: 18,
      reason: "Cycle count recount",
    });

    assert.strictEqual(result.variance, -5);
    assert.strictEqual(Number(result.movement.quantityIn), 0);
    assert.strictEqual(Number(result.movement.quantityOut), 5);
    assert.strictEqual((await currentPhysical(owner, shop.id, item.id)).physicalStock, 18);
  });

  test("matching physical count is an audited no-op without a ledger row", async () => {
    const before = await prisma.stockLedger.count({
      where: { shopId: shop.id, itemId: item.id },
    });
    const result = await stockCountService.reconcilePhysicalStock(owner, {
      shopId: shop.id,
      itemId: item.id,
      countedPhysical: 18,
      reason: "Count matched",
    });
    const after = await prisma.stockLedger.count({
      where: { shopId: shop.id, itemId: item.id },
    });

    assert.strictEqual(result.variance, 0);
    assert.strictEqual(result.movement, null);
    assert.strictEqual(after, before);
  });

  test("physical truth is accepted below reservations and available stock clamps to zero", async () => {
    const order = await prisma.order.create({
      data: {
        orderNumber: "PHY-ORDER-1",
        shopId: shop.id,
        customerId: customer.id,
        createdById: owner.id,
      },
    });
    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        itemId: item.id,
        quantityOrdered: 8,
        quantityPending: 8,
        rate: 100,
        lineTotal: 800,
      },
    });
    await prisma.stockReservation.create({
      data: {
        shopId: shop.id,
        orderId: order.id,
        orderItemId: orderItem.id,
        itemId: item.id,
        reservedQty: 8,
      },
    });

    const result = await stockCountService.reconcilePhysicalStock(owner, {
      shopId: shop.id,
      itemId: item.id,
      countedPhysical: 5,
      reason: "Shelf count",
    });

    assert.strictEqual(result.physicalStock, 5);
    assert.strictEqual(result.reservedStock, 8);
    assert.strictEqual(result.availableStock, 0);
    assert.strictEqual(result.reservationShortage, 3);

    const stock = await currentPhysical(owner, shop.id, item.id);
    assert.strictEqual(stock.physicalStock, 5);
    assert.strictEqual(stock.reservedStock, 8);
    assert.strictEqual(stock.availableStock, 0);
  });

  test("staff physical count creates STOCK_ADJUSTMENT approval and applies after owner approval", async () => {
    const before = await prisma.stockLedger.count({
      where: { shopId: shop.id, itemId: item.id },
    });
    const result = await stockCountService.reconcilePhysicalStock(staff, {
      shopId: shop.id,
      itemId: item.id,
      countedPhysical: 7,
      reason: "Staff cycle count",
    });

    assert.strictEqual(result.isRequest, true);
    assert.strictEqual(result.status, "PENDING");
    assert.strictEqual(result.currentPhysical, 5);
    assert.strictEqual(result.variance, 2);
    assert.strictEqual(
      await prisma.stockLedger.count({ where: { shopId: shop.id, itemId: item.id } }),
      before,
    );

    const request = await prisma.approvalRequest.findUnique({
      where: { id: result.requestId },
    });
    assert.strictEqual(request.type, "STOCK_ADJUSTMENT");
    assert.strictEqual(Number(request.payloadJson.expectedPhysical), 5);
    assert.strictEqual(Number(request.payloadJson.countedPhysical), 7);

    await approvalService.respondToRequest(owner, request.id, { status: "APPROVED" });
    const stock = await currentPhysical(owner, shop.id, item.id);
    assert.strictEqual(stock.physicalStock, 7);
    assert.strictEqual(stock.reservedStock, 8);
    assert.strictEqual(stock.availableStock, 0);
  });

  test("staff physical count cannot apply a stale stock snapshot", async () => {
    const result = await stockCountService.reconcilePhysicalStock(staff, {
      shopId: shop.id,
      itemId: item.id,
      countedPhysical: 9,
      reason: "Count awaiting approval",
    });

    await stockService.bulkStockEntry(owner, {
      shopId: shop.id,
      entries: [{ itemId: item.id, quantity: 1 }],
      notes: "Stock arrived before approval",
    });

    await assertApiReject(
      () =>
        approvalService.respondToRequest(owner, result.requestId, {
          status: "APPROVED",
        }),
      409,
    );

    const request = await prisma.approvalRequest.findUnique({
      where: { id: result.requestId },
    });
    assert.strictEqual(request.status, "PENDING");
    assert.strictEqual((await currentPhysical(owner, shop.id, item.id)).physicalStock, 8);
  });

  test("approved negative staff stock entry never writes a negative quantityIn", async () => {
    const requestResult = await stockService.bulkStockEntry(staff, {
      shopId: shop.id,
      entries: [{ itemId: item.id, quantity: -2 }],
      notes: "Damaged units",
    });

    await approvalService.respondToRequest(owner, requestResult.requestId, {
      status: "APPROVED",
    });

    const movement = await prisma.stockLedger.findFirst({
      where: {
        shopId: shop.id,
        itemId: item.id,
        reason: "Damaged units",
      },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(movement);
    assert.strictEqual(movement.movementType, "MANUAL_ADJUSTMENT");
    assert.strictEqual(Number(movement.quantityIn), 0);
    assert.strictEqual(Number(movement.quantityOut), 2);
    assert.strictEqual((await currentPhysical(owner, shop.id, item.id)).physicalStock, 6);
  });
});
