import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { STAFF_PERMISSIONS, PERMISSIONS } from "../utils/permissions.js";
import * as authService from "../services/auth.service.js";
import * as shopService from "../services/shop.service.js";
import * as expenseService from "../services/expense.service.js";
import * as paymentService from "../services/payment.service.js";
import * as rateChangeService from "../services/rateChange.service.js";
import * as correctionService from "../services/correction.service.js";
import * as summaryService from "../services/dailySummary.service.js";
import { closePushQueue } from "../services/notification.push.queue.js";

const CODES = ["P1S1", "P1S2"];
const MOBILES = ["9911110101", "9911110102", "9911110103", "9911110104"];

async function assertRejectsApi(fn, status) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof ApiError);
    assert.strictEqual(error.statusCode || error.status, status);
    return true;
  });
}

async function cleanup() {
  const shops = await prisma.shop.findMany({ where: { code: { in: CODES } }, select: { id: true } });
  const shopIds = shops.map((shop) => shop.id);
  if (shopIds.length) {
    await prisma.notificationPushDelivery.deleteMany({ where: { notification: { shopId: { in: shopIds } } } });
    await prisma.notification.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.domainEventOutbox.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.approvalRequest.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.expense.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.paymentDetail.deleteMany({ where: { payment: { shopId: { in: shopIds } } } });
    await prisma.payment.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.saleItem.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
    await prisma.sale.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.orderEvent.deleteMany({ where: { order: { shopId: { in: shopIds } } } });
    await prisma.orderItem.deleteMany({ where: { order: { shopId: { in: shopIds } } } });
    await prisma.order.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.stockReservation.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.stockLedger.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.stockBalance.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.itemPriceHistory.deleteMany({ where: { item: { shopId: { in: shopIds } } } });
    await prisma.item.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.itemCategory.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.dailySummary.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.cashSession.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.staffShopAccess.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
  }
  await prisma.userDevice.deleteMany({ where: { user: { mobile: { in: MOBILES } } } });
  await prisma.user.deleteMany({ where: { mobile: { in: MOBILES } } });
}

test.describe("Phase 1 security and permission fixes", () => {
  let owner;
  let otherOwner;
  let staff;
  let otherStaff;
  let shop;
  let otherShop;
  let customer;
  let item;
  let order;
  let orderItem;
  let sale;

  test.before(async () => {
    await cleanup();
    owner = await prisma.user.create({
      data: { name: "Phase Owner", mobile: MOBILES[0], passwordHash: "hash", role: "OWNER" },
    });
    otherOwner = await prisma.user.create({
      data: { name: "Phase Other Owner", mobile: MOBILES[1], passwordHash: "hash", role: "OWNER" },
    });
    staff = await prisma.user.create({
      data: { name: "Phase Staff", mobile: MOBILES[2], passwordHash: "hash", role: "STAFF", staffOwnerId: owner.id },
    });
    otherStaff = await prisma.user.create({
      data: { name: "Phase Other Staff", mobile: MOBILES[3], passwordHash: "hash", role: "STAFF", staffOwnerId: otherOwner.id },
    });
    shop = await prisma.shop.create({
      data: { name: "Phase Shop", code: CODES[0], city: "Nagpur", ownerId: owner.id },
    });
    otherShop = await prisma.shop.create({
      data: { name: "Phase Other Shop", code: CODES[1], city: "Pune", ownerId: otherOwner.id },
    });
    await prisma.staffShopAccess.create({ data: { staffId: staff.id, shopId: shop.id } });
    await prisma.staffShopAccess.create({ data: { staffId: otherStaff.id, shopId: otherShop.id } });
    await prisma.cashSession.create({ data: { shop: { connect: { id: shop.id } }, openingCash: 100, status: "OPEN" } });
    await prisma.cashSession.create({ data: { shop: { connect: { id: otherShop.id } }, openingCash: 100, status: "OPEN" } });
    customer = await prisma.customer.create({
      data: { shopId: shop.id, name: "Phase Customer", type: "REGULAR", createdById: owner.id },
    });
    item = await prisma.item.create({
      data: { shopId: shop.id, name: "Phase Item", unit: "pcs", defaultSellingPrice: 100, minimumStock: 1 },
    });
    order = await prisma.order.create({
      data: {
        orderNumber: "P1-ORD-1",
        shopId: shop.id,
        customerId: customer.id,
        createdById: owner.id,
        subtotal: 100,
        totalAmount: 100,
        balanceAmount: 100,
      },
    });
    orderItem = await prisma.orderItem.create({
      data: { orderId: order.id, itemId: item.id, quantityOrdered: 1, quantityPending: 1, rate: 100, lineTotal: 100 },
    });
    sale = await prisma.sale.create({
      data: {
        saleNumber: "P1-SAL-1",
        shopId: shop.id,
        staffId: staff.id,
        customerId: customer.id,
        subtotal: 100,
        totalAmount: 100,
        balanceAmount: 100,
      },
    });
  });

  test.after(async () => {
    await cleanup();
    await closePushQueue();
  });

  test("owner staff list/update/assign is scoped to owned staff", async () => {
    const staffRows = await authService.listStaff(owner);
    assert.deepStrictEqual(staffRows.map((row) => row.id), [staff.id]);

    await assertRejectsApi(() => authService.updateStaff(owner, otherStaff.id, { status: "INACTIVE" }), 404);
    await assertRejectsApi(() => shopService.assignStaff(owner, shop.id, otherStaff.id), 400);

    const access = await shopService.assignStaff(owner, shop.id, staff.id);
    assert.strictEqual(access.staffId, staff.id);
  });

  test("staff shop access remains assignment-scoped", async () => {
    await assert.doesNotReject(() => assertShopAccess(staff, shop.id));
    await assertRejectsApi(() => assertShopAccess(staff, otherShop.id), 403);
  });

  test("rate-change requests cannot cross shop or owner boundaries", async () => {
    const request = await rateChangeService.createRateChangeRequest(staff, {
      orderItemId: orderItem.id,
      suggestedRate: 90,
      reason: "Customer approved rate",
    });
    assert.strictEqual(request.status, "PENDING");

    await assertRejectsApi(() => rateChangeService.createRateChangeRequest(otherStaff, {
      orderItemId: orderItem.id,
      suggestedRate: 80,
      reason: "Wrong shop",
    }), 403);
    await assertRejectsApi(() => rateChangeService.approveRateChangeRequest(otherOwner, request.id), 403);
  });

  test("correction requests cannot cross shop or owner boundaries", async () => {
    const request = await correctionService.createCorrectionRequest(staff, {
      entityType: "SALE",
      entityId: sale.id,
      requestedChangeJson: { action: "CANCEL" },
      reason: "Wrong sale",
    });
    assert.strictEqual(request.status, "PENDING");

    await assertRejectsApi(() => correctionService.createCorrectionRequest(otherStaff, {
      entityType: "SALE",
      entityId: sale.id,
      requestedChangeJson: { action: "CANCEL" },
      reason: "Wrong shop",
    }), 403);
    await assertRejectsApi(() => correctionService.approveCorrectionRequest(otherOwner, request.id), 403);
  });

  test("expense create and verify permissions are scoped", async () => {
    const expense = await expenseService.createExpense(staff, {
      shopId: shop.id,
      amount: 50,
      category: "MISC",
      note: "Courier",
    });
    assert.strictEqual(expense.status, "PENDING");

    await assertRejectsApi(() => expenseService.createExpense(staff, {
      shopId: otherShop.id,
      amount: 10,
      category: "MISC",
    }), 403);
    await assertRejectsApi(() => expenseService.verifyExpense(staff, expense.id, { status: "APPROVED" }), 403);
    await assertRejectsApi(() => expenseService.verifyExpense(otherOwner, expense.id, { status: "APPROVED" }), 403);

    const verified = await expenseService.verifyExpense(owner, expense.id, { status: "APPROVED", note: "ok" });
    assert.strictEqual(verified.status, "APPROVED");
    assert.strictEqual(verified.verifiedById, owner.id);
  });

  test("payment verification uses status contract and owner-only verification", async () => {
    const payment = await prisma.payment.create({
      data: {
        shopId: shop.id,
        customerId: customer.id,
        paymentMode: "UPI",
        amount: 25,
        receivedById: staff.id,
        status: "RECORDED",
      },
    });
    const rejectedPayment = await prisma.payment.create({
      data: {
        shopId: shop.id,
        customerId: customer.id,
        paymentMode: "UPI",
        amount: 30,
        receivedById: staff.id,
        status: "RECORDED",
      },
    });

    const pending = await paymentService.listPayments(owner, { shopId: shop.id, status: "RECORDED" });
    assert.ok(pending.some((row) => row.id === payment.id));

    await assertRejectsApi(() => paymentService.verifyPayment(staff, payment.id, {}), 403);
    const verified = await paymentService.verifyPayment(owner, payment.id, { note: "received" });
    assert.strictEqual(verified.status, "VERIFIED");
    const rejected = await paymentService.markMismatch(owner, rejectedPayment.id, { note: "not received" });
    assert.strictEqual(rejected.status, "REJECTED");
  });

  test("daily summary permissions are explicit and owner scoped", async () => {
    assert.ok(PERMISSIONS.DAILY_SUMMARY_VIEW);
    assert.ok(PERMISSIONS.DAILY_SUMMARY_LOCK);
    assert.ok(PERMISSIONS.DAILY_SUMMARY_EXPORT);
    assert.strictEqual(STAFF_PERMISSIONS.includes(PERMISSIONS.DAILY_SUMMARY_VIEW), false);

    const summary = await summaryService.getSummary(owner, { shopId: shop.id, date: "2026-06-29" });
    assert.strictEqual(summary.shopId, shop.id);
    await assertRejectsApi(() => summaryService.getSummary(otherOwner, { shopId: shop.id, date: "2026-06-29" }), 403);
  });
});
