import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import * as paymentService from "../services/payment.service.js";
import * as cashSessionService from "../services/cashSession.service.js";
import * as orderService from "../services/order.service.js";
import * as expenseService from "../services/expense.service.js";
import * as dailySummaryService from "../services/dailySummary.service.js";
import * as dashboardService from "../services/dashboard.service.js";
import * as chequeService from "../services/cheque.service.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";
import { closePushQueue } from "../services/notification.push.queue.js";

const CODES = ["P2S1", "P2S2", "P2S3"];
const MOBILES = ["9922220101", "9922220102", "9922220103", "9922220104", "9922220105", "9922220106"];

async function assertRejectsApi(fn, status) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof ApiError);
    assert.strictEqual(error.statusCode || error.status, status);
    return true;
  });
}

function idemReq(user, key, body) {
  return {
    user,
    body,
    validated: { body },
    get: (name) => (name.toLowerCase() === "idempotency-key" ? key : null),
  };
}

async function cleanup() {
  const shops = await prisma.shop.findMany({ where: { code: { in: CODES } }, select: { id: true } });
  const shopIds = shops.map((shop) => shop.id);
  if (shopIds.length) {
    await prisma.notificationPushDelivery.deleteMany({ where: { notification: { shopId: { in: shopIds } } } });
    await prisma.notification.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.domainEventOutbox.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.idempotencyKey.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.approvalRequest.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.expense.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.paymentDetail.deleteMany({ where: { payment: { shopId: { in: shopIds } } } });
    await prisma.payment.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.dispatchItem.deleteMany({ where: { dispatch: { shopId: { in: shopIds } } } });
    await prisma.dispatch.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.saleItem.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
    await prisma.deliveryMemoItem.deleteMany({ where: { deliveryMemo: { shopId: { in: shopIds } } } });
    await prisma.sale.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.deliveryMemo.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.orderEvent.deleteMany({ where: { order: { shopId: { in: shopIds } } } });
    await prisma.packingTask.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.stockReservation.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.orderItem.deleteMany({ where: { order: { shopId: { in: shopIds } } } });
    await prisma.order.deleteMany({ where: { shopId: { in: shopIds } } });
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

test.describe("Phase 2 core business correctness", () => {
  let owner;
  let otherOwner;
  let staff;
  let inactiveStaff;
  let unassignedStaff;
  let otherStaff;
  let shop;
  let summaryShop;
  let otherShop;
  let customer;
  let item;

  test.before(async () => {
    await cleanup();
    owner = await prisma.user.create({ data: { name: "P2 Owner", mobile: MOBILES[0], passwordHash: "hash", role: "OWNER" } });
    otherOwner = await prisma.user.create({ data: { name: "P2 Other Owner", mobile: MOBILES[1], passwordHash: "hash", role: "OWNER" } });
    staff = await prisma.user.create({ data: { name: "P2 Staff", mobile: MOBILES[2], passwordHash: "hash", role: "STAFF", staffOwnerId: owner.id } });
    inactiveStaff = await prisma.user.create({ data: { name: "P2 Inactive", mobile: MOBILES[3], passwordHash: "hash", role: "STAFF", status: "INACTIVE", staffOwnerId: owner.id } });
    unassignedStaff = await prisma.user.create({ data: { name: "P2 Unassigned", mobile: MOBILES[4], passwordHash: "hash", role: "STAFF", staffOwnerId: owner.id } });
    otherStaff = await prisma.user.create({ data: { name: "P2 Other Staff", mobile: "9922220106", passwordHash: "hash", role: "STAFF", staffOwnerId: otherOwner.id } });

    shop = await prisma.shop.create({ data: { name: "P2 Shop", code: CODES[0], city: "Nagpur", ownerId: owner.id } });
    summaryShop = await prisma.shop.create({ data: { name: "P2 Summary", code: CODES[1], city: "Mumbai", ownerId: owner.id } });
    otherShop = await prisma.shop.create({ data: { name: "P2 Other", code: CODES[2], city: "Pune", ownerId: otherOwner.id } });
    await prisma.staffShopAccess.create({ data: { staffId: staff.id, shopId: shop.id } });
    await prisma.staffShopAccess.create({ data: { staffId: otherStaff.id, shopId: otherShop.id } });

    customer = await prisma.customer.create({ data: { shopId: shop.id, name: "P2 Customer", type: "REGULAR", createdById: owner.id } });
    item = await prisma.item.create({ data: { shopId: shop.id, name: "P2 Item", unit: "pcs", defaultSellingPrice: 100, minimumStock: 1 } });
    await prisma.stockLedger.create({
      data: { shopId: shop.id, itemId: item.id, movementType: "OPENING_STOCK", quantityIn: 20, quantityOut: 0, createdById: owner.id },
    });
  });

  test.after(async () => {
    await cleanup();
    await closePushQueue();
  });

  test("cash payments require and attach to the active shop cash session", async () => {
    await assertRejectsApi(() => paymentService.addPayment(staff, {
      shopId: shop.id,
      customerId: customer.id,
      paymentMode: "CASH",
      amount: 10,
    }), 400);

    const session = await cashSessionService.openSession(staff, { shopId: shop.id });
    const cashPayment = await paymentService.addPayment(staff, {
      shopId: shop.id,
      customerId: customer.id,
      paymentMode: "CASH",
      amount: 25,
    });
    assert.strictEqual(cashPayment.cashSessionId, session.id);

    const current = await cashSessionService.getCurrentSession(staff, { shopId: shop.id });
    assert.strictEqual(Number(current.expectedCash), 25);

    const upiPayment = await paymentService.addPayment(staff, {
      shopId: shop.id,
      customerId: customer.id,
      paymentMode: "UPI",
      amount: 15,
    });
    assert.strictEqual(upiPayment.cashSessionId, null);
    const afterUpi = await cashSessionService.getCurrentSession(staff, { shopId: shop.id });
    assert.strictEqual(Number(afterUpi.expectedCash), 25);
  });

  test("idempotency replays same user/shop/action and rejects changed payload", async () => {
    const body = { shopId: shop.id, amount: 12, category: "MISC", note: "Tape" };
    const req = idemReq(staff, "p2-expense-key", body);
    const first = await runIdempotentCreate(req, {
      endpoint: "POST /expenses",
      resourceType: "EXPENSE",
      shopId: shop.id,
    }, () => expenseService.createExpense(staff, body));
    const second = await runIdempotentCreate(req, {
      endpoint: "POST /expenses",
      resourceType: "EXPENSE",
      shopId: shop.id,
    }, () => expenseService.createExpense(staff, body));

    assert.strictEqual(first.data.id, second.data.id);
    await assertRejectsApi(() => runIdempotentCreate(idemReq(staff, "p2-expense-key", { ...body, amount: 13 }), {
      endpoint: "POST /expenses",
      resourceType: "EXPENSE",
      shopId: shop.id,
    }, () => expenseService.createExpense(staff, body)), 409);
  });

  test("order initial assignment validates owner scope, active status, and shop assignment", async () => {
    const valid = await orderService.createOrder(owner, {
      shopId: shop.id,
      customerId: customer.id,
      assignedStaffId: staff.id,
      items: [{ itemId: item.id, quantityOrdered: 1, rate: 100 }],
    });
    assert.strictEqual(valid.assignedStaffId, staff.id);

    await assertRejectsApi(() => orderService.createOrder(owner, {
      shopId: shop.id,
      customerId: customer.id,
      assignedStaffId: otherStaff.id,
      items: [{ itemId: item.id, quantityOrdered: 1, rate: 100 }],
    }), 400);
    await assertRejectsApi(() => orderService.createOrder(owner, {
      shopId: shop.id,
      customerId: customer.id,
      assignedStaffId: inactiveStaff.id,
      items: [{ itemId: item.id, quantityOrdered: 1, rate: 100 }],
    }), 400);
    await assertRejectsApi(() => orderService.createOrder(owner, {
      shopId: shop.id,
      customerId: customer.id,
      assignedStaffId: unassignedStaff.id,
      items: [{ itemId: item.id, quantityOrdered: 1, rate: 100 }],
    }), 400);
    await assertRejectsApi(() => orderService.createOrder(staff, {
      shopId: shop.id,
      customerId: customer.id,
      assignedStaffId: staff.id,
      items: [{ itemId: item.id, quantityOrdered: 1, rate: 100 }],
    }), 403);
  });

  test("daily summary calculates credit, payment, and expense totals without cross-shop data", async () => {
    const summaryCustomer = await prisma.customer.create({ data: { shopId: summaryShop.id, name: "P2 Summary Customer", type: "REGULAR", createdById: owner.id } });
    const summaryItem = await prisma.item.create({ data: { shopId: summaryShop.id, name: "P2 Summary Item", unit: "pcs", defaultSellingPrice: 100, minimumStock: 5 } });
    await prisma.sale.create({
      data: {
        saleNumber: "P2-SAL-SUM",
        shopId: summaryShop.id,
        staffId: owner.id,
        customerId: summaryCustomer.id,
        subtotal: 100,
        totalAmount: 100,
        paidAmount: 30,
        balanceAmount: 70,
        saleStatus: "CONFIRMED",
      },
    });
    await prisma.deliveryMemo.create({
      data: {
        dmNumber: "P2-DM-SUM",
        shopId: summaryShop.id,
        staffId: owner.id,
        customerId: summaryCustomer.id,
        estimatedAmount: 50,
        paidAmount: 10,
        balanceAmount: 40,
        status: "PARTIALLY_PAID",
      },
    });
    await prisma.order.create({
      data: {
        orderNumber: "P2-ORD-SUM",
        shopId: summaryShop.id,
        customerId: summaryCustomer.id,
        createdById: owner.id,
        totalAmount: 60,
        paidAmount: 10,
        balanceAmount: 50,
      },
    });
    await prisma.payment.create({
      data: { shopId: summaryShop.id, customerId: summaryCustomer.id, paymentMode: "UPI", amount: 30, receivedById: owner.id, status: "RECORDED" },
    });
    await prisma.expense.create({
      data: { shopId: summaryShop.id, amount: 12, category: "MISC", note: "Approved expense", createdById: owner.id, status: "APPROVED" },
    });

    const date = new Date().toISOString().slice(0, 10);
    const summary = await dailySummaryService.generateSummary(owner, { shopId: summaryShop.id, date });
    assert.strictEqual(Number(summary.totalSales), 100);
    assert.strictEqual(Number(summary.totalUpiCollected), 30);
    assert.strictEqual(Number(summary.totalCreditPending), 160);
    assert.strictEqual(summary.expenseCount, 1);
    assert.strictEqual(summary.payloadJson.totalExpenses, 12);
    assert.strictEqual(summary.payloadJson.totalChequeReceived, 0);

    const crossShopSummary = await dailySummaryService.generateSummary(owner, { shopId: shop.id, date });
    assert.notStrictEqual(Number(crossShopSummary.totalCreditPending), 160);

    await prisma.stockLedger.create({
      data: { shopId: summaryShop.id, itemId: summaryItem.id, movementType: "OPENING_STOCK", quantityIn: 10, quantityOut: 0, createdById: owner.id },
    });
    let dashboard = await dashboardService.getOwnerDashboard(owner, { shopId: summaryShop.id });
    assert.strictEqual(dashboard.lowStockAlerts, 0);
    await prisma.stockLedger.create({
      data: { shopId: summaryShop.id, itemId: summaryItem.id, movementType: "SALE", quantityIn: 0, quantityOut: 7, createdById: owner.id },
    });
    dashboard = await dashboardService.getOwnerDashboard(owner, { shopId: summaryShop.id });
    assert.strictEqual(dashboard.lowStockAlerts, 1);
  });

  test("payment and cheque duplicate final-state transitions do not double-apply outstanding", async () => {
    const rejectCustomer = await prisma.customer.create({
      data: { shopId: shop.id, name: "P2 Reject Customer", type: "REGULAR", outstandingAmount: 100, createdById: owner.id },
    });
    const upiPayment = await paymentService.addPayment(staff, {
      shopId: shop.id,
      customerId: rejectCustomer.id,
      paymentMode: "UPI",
      amount: 20,
    });
    let freshCustomer = await prisma.customer.findUnique({ where: { id: rejectCustomer.id } });
    assert.strictEqual(Number(freshCustomer.outstandingAmount), 80);
    await paymentService.markMismatch(owner, upiPayment.id, { note: "not received" });
    await paymentService.markMismatch(owner, upiPayment.id, { note: "not received" });
    freshCustomer = await prisma.customer.findUnique({ where: { id: rejectCustomer.id } });
    assert.strictEqual(Number(freshCustomer.outstandingAmount), 100);
    await assertRejectsApi(() => paymentService.verifyPayment(owner, upiPayment.id, {}), 400);

    const chequeCustomer = await prisma.customer.create({
      data: { shopId: shop.id, name: "P2 Cheque Customer", type: "REGULAR", outstandingAmount: 100, createdById: owner.id },
    });
    const chequePayment = await paymentService.addPayment(staff, {
      shopId: shop.id,
      customerId: chequeCustomer.id,
      paymentMode: "CHEQUE",
      amount: 40,
      details: { chequeNumber: "123456", chequeStatus: "RECEIVED" },
    });
    freshCustomer = await prisma.customer.findUnique({ where: { id: chequeCustomer.id } });
    assert.strictEqual(Number(freshCustomer.outstandingAmount), 60);
    await chequeService.updateChequeStatus(owner, chequePayment.id, "BOUNCED", { reason: "Insufficient funds" });
    await chequeService.updateChequeStatus(owner, chequePayment.id, "BOUNCED", { reason: "Insufficient funds" });
    freshCustomer = await prisma.customer.findUnique({ where: { id: chequeCustomer.id } });
    assert.strictEqual(Number(freshCustomer.outstandingAmount), 100);
    await assertRejectsApi(() => paymentService.verifyPayment(owner, chequePayment.id, {}), 400);
  });
});
