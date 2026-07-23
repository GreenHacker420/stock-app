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
import * as correctionService from "../services/correction.service.js";
import * as customerService from "../services/customer.service.js";
import * as saleService from "../services/sale.service.js";
import * as deliveryMemoService from "../services/deliveryMemo.service.js";
import * as stockService from "../services/stock.service.js";
import * as approvalService from "../services/approval.service.js";
import * as itemService from "../services/item.service.js";
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
    await prisma.saleAmendment.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
    await prisma.invoice.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
    await prisma.customerLedgerEntry.deleteMany({ where: { shopId: { in: shopIds } } });
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
    await prisma.itemBundleComponent.deleteMany({ where: { parentItem: { shopId: { in: shopIds } } } });
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

  test("batch product delete deactivates all selected products in one operation", async () => {
    const products = await Promise.all([
      prisma.item.create({
        data: {
          shopId: shop.id,
          name: "Batch Delete One",
          unit: "pcs",
          defaultSellingPrice: 10,
          minimumStock: 0,
        },
      }),
      prisma.item.create({
        data: {
          shopId: shop.id,
          name: "Batch Delete Two",
          unit: "pcs",
          defaultSellingPrice: 20,
          minimumStock: 0,
        },
      }),
    ]);
    const itemIds = products.map((product) => product.id);

    const result = await itemService.batchDeleteItems(owner, { shopId: shop.id, itemIds });

    assert.deepStrictEqual(new Set(result.deletedItemIds), new Set(itemIds));
    const inactiveCount = await prisma.item.count({
      where: { id: { in: itemIds }, status: "INACTIVE" },
    });
    assert.strictEqual(inactiveCount, 2);
    const batchEvent = await prisma.domainEventOutbox.findFirst({
      where: { shopId: shop.id, entity: "item", action: "batch_deleted" },
      orderBy: { createdAt: "desc" },
    });
    assert.deepStrictEqual(new Set(batchEvent.eventJson.patch.deletedItemIds), new Set(itemIds));
  });

  test("product merge preserves stock and media, fills empty fields, and consolidates bundle references", async () => {
    const target = await prisma.item.create({
      data: {
        shopId: shop.id,
        name: "Merge Primary",
        unit: "pcs",
        defaultSellingPrice: 100,
        minimumStock: 0,
        imageUrl: "https://cdn.test/primary.jpg",
      },
    });
    const source = await prisma.item.create({
      data: {
        shopId: shop.id,
        name: "Merge Duplicate",
        sku: "MERGE-SOURCE-SKU",
        unit: "PCS",
        defaultSellingPrice: 120,
        purchasePrice: 60,
        minimumStock: 0,
        imageUrl: "https://cdn.test/duplicate.jpg",
      },
    });
    const bundle = await prisma.item.create({
      data: {
        shopId: shop.id,
        name: "Merge Reference Bundle",
        unit: "set",
        defaultSellingPrice: 300,
        minimumStock: 0,
      },
    });
    await prisma.itemBundleComponent.createMany({
      data: [
        { parentItemId: bundle.id, componentItemId: target.id, quantity: 2 },
        { parentItemId: bundle.id, componentItemId: source.id, quantity: 1 },
      ],
    });
    await prisma.stockLedger.createMany({
      data: [
        { shopId: shop.id, itemId: target.id, movementType: "OPENING_STOCK", quantityIn: 4, quantityOut: 0, createdById: owner.id },
        { shopId: shop.id, itemId: source.id, movementType: "OPENING_STOCK", quantityIn: 6, quantityOut: 1, createdById: owner.id },
      ],
    });

    const result = await itemService.mergeItems(owner, {
      shopId: shop.id,
      sourceItemIds: [source.id],
      targetItemId: target.id,
    });

    assert.deepStrictEqual(result.combinedStock, { physical: 9, reserved: 0, available: 9 });
    assert.strictEqual(result.imagesPreserved, 2);
    const [mergedTarget, inactiveSource, targetBalance, bundleReference] = await Promise.all([
      prisma.item.findUnique({ where: { id: target.id } }),
      prisma.item.findUnique({ where: { id: source.id } }),
      prisma.stockBalance.findUnique({ where: { itemId: target.id } }),
      prisma.itemBundleComponent.findUnique({
        where: {
          parentItemId_componentItemId: {
            parentItemId: bundle.id,
            componentItemId: target.id,
          },
        },
      }),
    ]);
    assert.strictEqual(mergedTarget.sku, "MERGE-SOURCE-SKU");
    assert.strictEqual(mergedTarget.purchasePrice.toString(), "60");
    assert.strictEqual(
      mergedTarget.imageUrl,
      "https://cdn.test/primary.jpg,https://cdn.test/duplicate.jpg",
    );
    assert.strictEqual(inactiveSource.status, "INACTIVE");
    assert.strictEqual(inactiveSource.sku, null);
    assert.strictEqual(Number(targetBalance.physicalStock), 9);
    assert.strictEqual(Number(bundleReference.quantity), 3);
    assert.strictEqual(
      await prisma.stockLedger.count({ where: { itemId: source.id } }),
      0,
    );
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

  test("delivery memo draft posts once and converts without duplicate stock or debt", async () => {
    const customerBefore = await prisma.customer.findUnique({ where: { id: customer.id } });
    const stockBefore = await prisma.stockLedger.aggregate({
      where: { shopId: shop.id, itemId: item.id },
      _sum: { quantityIn: true, quantityOut: true },
    });
    const physicalBefore = Number(stockBefore._sum.quantityIn || 0) - Number(stockBefore._sum.quantityOut || 0);

    const draft = await deliveryMemoService.createDeliveryMemoDraft(staff, {
      shopId: shop.id,
      customerId: customer.id,
      customerName: customer.name,
      documentPurpose: "CREDIT_DELIVERY",
      expectedPaymentDate: new Date("2026-07-20T00:00:00.000Z"),
      items: [{ itemId: item.id, quantity: 2, rate: 100 }],
    });

    assert.strictEqual(draft.lifecycleStatus, "DRAFT");
    assert.match(draft.dmNumber, /^DRAFT-/);
    const draftMovements = await prisma.stockLedger.count({ where: { referenceId: draft.id } });
    assert.strictEqual(draftMovements, 0);
    const customerAfterDraft = await prisma.customer.findUnique({ where: { id: customer.id } });
    assert.strictEqual(Number(customerAfterDraft.outstandingAmount), Number(customerBefore.outstandingAmount));

    const posted = await deliveryMemoService.postDeliveryMemo(staff, draft.id, { version: draft.version });
    assert.strictEqual(posted.lifecycleStatus, "DISPATCHED");
    assert.strictEqual(posted.paymentStatus, "UNPAID");
    assert.strictEqual(posted.status, "CREATED");
    assert.match(posted.dmNumber, /^DM-/);

    const postedAgain = await deliveryMemoService.postDeliveryMemo(staff, draft.id, { version: posted.version });
    assert.strictEqual(postedAgain.id, posted.id);
    const dmMovements = await prisma.stockLedger.findMany({ where: { referenceId: draft.id } });
    assert.strictEqual(dmMovements.length, 1);
    assert.strictEqual(Number(dmMovements[0].quantityOut), 2);
    const ledgerEntries = await prisma.customerLedgerEntry.findMany({ where: { sourceId: draft.id } });
    assert.strictEqual(ledgerEntries.length, 1);
    assert.strictEqual(ledgerEntries[0].entryType, "DM_POSTED");

    const debtAfterPost = await prisma.customer.findUnique({ where: { id: customer.id } });
    const conversion = await deliveryMemoService.convertDeliveryMemoToSale(owner, draft.id, { gstRequired: false });
    assert.strictEqual(conversion.dmId, draft.id);
    const dmMovementsAfterConversion = await prisma.stockLedger.count({ where: { referenceId: draft.id } });
    assert.strictEqual(dmMovementsAfterConversion, 1);
    const saleMovements = await prisma.stockLedger.count({ where: { referenceId: conversion.id } });
    assert.strictEqual(saleMovements, 0);
    const debtAfterConversion = await prisma.customer.findUnique({ where: { id: customer.id } });
    assert.strictEqual(Number(debtAfterConversion.outstandingAmount), Number(debtAfterPost.outstandingAmount));

    const stockAfter = await prisma.stockLedger.aggregate({
      where: { shopId: shop.id, itemId: item.id },
      _sum: { quantityIn: true, quantityOut: true },
    });
    const physicalAfter = Number(stockAfter._sum.quantityIn || 0) - Number(stockAfter._sum.quantityOut || 0);
    assert.strictEqual(physicalAfter, physicalBefore - 2);
  });

  test("delivery memo posting consumes customer advance before creating debt", async () => {
    const advanceCustomer = await prisma.customer.create({
      data: {
        shopId: shop.id,
        name: "P2 Advance Customer",
        type: "REGULAR",
        advanceBalance: 40,
        outstandingAmount: 10,
        createdById: owner.id,
      },
    });
    const draft = await deliveryMemoService.createDeliveryMemoDraft(staff, {
      shopId: shop.id,
      customerId: advanceCustomer.id,
      documentPurpose: "CREDIT_DELIVERY",
      items: [{ itemId: item.id, quantity: 1, rate: 100 }],
    });

    const posted = await deliveryMemoService.postDeliveryMemo(staff, draft.id, { version: draft.version });
    assert.strictEqual(Number(posted.paidAmount), 40);
    assert.strictEqual(Number(posted.balanceAmount), 60);
    assert.strictEqual(posted.paymentStatus, "PARTIALLY_PAID");

    const account = await prisma.customer.findUnique({ where: { id: advanceCustomer.id } });
    assert.strictEqual(Number(account.advanceBalance), 0);
    assert.strictEqual(Number(account.outstandingAmount), 70);

    const entries = await prisma.customerLedgerEntry.findMany({
      where: { sourceType: "DELIVERY_MEMO", sourceId: draft.id },
      orderBy: { createdAt: "asc" },
    });
    assert.deepStrictEqual(entries.map((entry) => [entry.entryType, entry.direction, Number(entry.amount)]), [
      ["DM_POSTED", "DEBIT", 100],
      ["ADVANCE_APPLIED", "CREDIT", 40],
    ]);
  });

  test("staff cannot post a delivery memo beyond the customer credit limit", async () => {
    const limitedCustomer = await prisma.customer.create({
      data: {
        shopId: shop.id,
        name: "P2 Limited Customer",
        type: "REGULAR",
        creditLimit: 50,
        createdById: owner.id,
      },
    });
    const draft = await deliveryMemoService.createDeliveryMemoDraft(staff, {
      shopId: shop.id,
      customerId: limitedCustomer.id,
      documentPurpose: "CREDIT_DELIVERY",
      items: [{ itemId: item.id, quantity: 1, rate: 100 }],
    });

    await assertRejectsApi(
      () => deliveryMemoService.postDeliveryMemo(staff, draft.id, { version: draft.version }),
      409,
    );

    const unchangedDraft = await prisma.deliveryMemo.findUnique({ where: { id: draft.id } });
    assert.strictEqual(unchangedDraft.lifecycleStatus, "DRAFT");
    assert.strictEqual(await prisma.stockLedger.count({ where: { referenceId: draft.id } }), 0);
    assert.strictEqual(await prisma.customerLedgerEntry.count({ where: { sourceId: draft.id } }), 0);
    const account = await prisma.customer.findUnique({ where: { id: limitedCustomer.id } });
    assert.strictEqual(Number(account.outstandingAmount), 0);
  });

  test("unimplemented delivery purposes cannot use the credit-delivery posting workflow", async () => {
    await assertRejectsApi(() => deliveryMemoService.createDeliveryMemoDraft(staff, {
      shopId: shop.id,
      customerId: customer.id,
      documentPurpose: "STOCK_TRANSFER",
      items: [{ itemId: item.id, quantity: 1, rate: 100 }],
    }), 400);
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

  test("virtual bundle sale deducts component stock and keeps kit as sale line", async () => {
    const cartridge = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "071 Cartridge",
      sku: "071-CART",
      unit: "pcs",
      defaultSellingPrice: 300,
      minimumStock: 1,
      initialStock: 5,
    });
    const chip = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "071 Chip",
      sku: "071-CHIP",
      unit: "pcs",
      defaultSellingPrice: 80,
      minimumStock: 1,
      initialStock: 5,
    });
    const kit = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "071 Cartridge with Chip",
      sku: "071-KIT",
      unit: "set",
      defaultSellingPrice: 380,
      minimumStock: 0,
      bundleComponents: [
        { componentItemId: cartridge.id, quantity: 1 },
        { componentItemId: chip.id, quantity: 1 },
      ],
    });

    const sale = await saleService.createSale(owner, {
      shopId: shop.id,
      customerId: customer.id,
      items: [{ itemId: kit.id, quantity: 1, rate: 380 }],
    });

    assert.strictEqual(sale.items.length, 1);
    assert.strictEqual(sale.items[0].itemId, kit.id);

    const ledgerRows = await prisma.stockLedger.findMany({
      where: { shopId: shop.id, referenceType: "Sale", referenceId: sale.id },
      select: { itemId: true, quantityOut: true },
    });
    const quantityOutByItem = new Map(ledgerRows.map((row) => [row.itemId, Number(row.quantityOut)]));
    assert.strictEqual(quantityOutByItem.get(cartridge.id), 1);
    assert.strictEqual(quantityOutByItem.get(chip.id), 1);
    assert.strictEqual(quantityOutByItem.get(kit.id), undefined);

    // Test end-to-end bundle order flow
    const order = await orderService.createOrder(owner, {
      shopId: shop.id,
      customerId: customer.id,
      items: [{ itemId: kit.id, quantityOrdered: 2, rate: 380 }],
    });

    assert.strictEqual(order.items.length, 1);
    const orderItemId = order.items[0].id;

    // Confirm Order (reserves components)
    await orderService.confirmOrder(owner, order.id);

    // Verify component reservations
    const reservations = await prisma.stockReservation.findMany({
      where: { orderId: order.id }
    });
    assert.strictEqual(reservations.length, 2);
    const reservationByItem = new Map(reservations.map((r) => [r.itemId, r]));

    const cartridgeRes = reservationByItem.get(cartridge.id);
    assert.ok(cartridgeRes);
    assert.strictEqual(Number(cartridgeRes.reservedQty), 2);
    assert.strictEqual(Number(cartridgeRes.packedQty), 0);
    assert.strictEqual(cartridgeRes.status, "ACTIVE");

    const chipRes = reservationByItem.get(chip.id);
    assert.ok(chipRes);
    assert.strictEqual(Number(chipRes.reservedQty), 2);
    assert.strictEqual(Number(chipRes.packedQty), 0);
    assert.strictEqual(chipRes.status, "ACTIVE");

    // Pack 1 unit of parent kit (should pack 1 cartridge and 1 chip)
    await orderService.markItemPacked(owner, order.id, {
      orderItemId,
      quantityPacked: 1
    });

    const packedReservations = await prisma.stockReservation.findMany({
      where: { orderId: order.id }
    });
    const packedResByItem = new Map(packedReservations.map((r) => [r.itemId, r]));
    assert.strictEqual(Number(packedResByItem.get(cartridge.id).packedQty), 1);
    assert.strictEqual(Number(packedResByItem.get(chip.id).packedQty), 1);

    // Convert to DM
    const dmFromOrder = await orderService.createDmFromOrder(owner, order.id, {
      items: [{
        orderItemId,
        itemId: kit.id,
        quantity: 1,
        rate: 380
      }]
    });

    // Verify component physical stock out
    const dmStockLedger = await prisma.stockLedger.findMany({
      where: { shopId: shop.id, referenceType: "DeliveryMemo", referenceId: dmFromOrder.id },
      select: { itemId: true, quantityOut: true },
    });
    const dmOutByItem = new Map(dmStockLedger.map((row) => [row.itemId, Number(row.quantityOut)]));
    assert.strictEqual(dmOutByItem.get(cartridge.id), 1);
    assert.strictEqual(dmOutByItem.get(chip.id), 1);
    assert.strictEqual(dmOutByItem.get(kit.id), undefined);

    // Clean up
    await prisma.dispatchItem.deleteMany({ where: { orderItemId } });
    await prisma.dispatch.deleteMany({ where: { orderId: order.id } });
    await prisma.stockReservation.deleteMany({ where: { orderId: order.id } });
    await prisma.packingTask.deleteMany({ where: { orderId: order.id } });
    await prisma.orderEvent.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.deleteMany({ where: { id: order.id } });
    await prisma.deliveryMemoItem.deleteMany({ where: { dmId: dmFromOrder.id } });
    await prisma.deliveryMemo.deleteMany({ where: { id: dmFromOrder.id } });
    await prisma.stockLedger.deleteMany({ where: { referenceId: dmFromOrder.id } });
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

  test("Phase 4B: Cash session and daily summary expected cash logic with pending, approved, and rejected expenses", async () => {
    // Ensure no open session exists
    await prisma.cashSession.deleteMany({ where: { shopId: shop.id } });
    // Open a cash session
    const session = await cashSessionService.openSession(owner, { shopId: shop.id });

    // Create some expenses
    const pendingExpense = await expenseService.createExpense(staff, {
      shopId: shop.id,
      amount: 10,
      category: "TEA",
      note: "pending tea",
    });
    const approvedExpense = await expenseService.createExpense(staff, {
      shopId: shop.id,
      amount: 25,
      category: "PETROL",
      note: "fuel",
    });
    // Approve fuel expense
    await expenseService.verifyExpense(owner, approvedExpense.id, { status: "APPROVED", note: "ok" });

    const rejectedExpense = await expenseService.createExpense(staff, {
      shopId: shop.id,
      amount: 50,
      category: "PORTER",
      note: "porter",
    });
    // Reject porter expense
    await expenseService.verifyExpense(owner, rejectedExpense.id, { status: "REJECTED", note: "not ok" });

    // Get current session status to see expectedCash
    const freshSession = await cashSessionService.getCurrentSession(owner, { shopId: shop.id });
    // expected closing cash should start with opening cash (0) + collections (0) - nonRejectedExpenses (10 pending + 25 approved) - handover (0)
    // So expectedCash should be -35
    assert.strictEqual(Number(freshSession.expectedCash), -35);

    // Now test Daily Summary session expected cash matching
    const today = new Date().toISOString().slice(0, 10);
    const summary = await dailySummaryService.generateSummary(owner, { shopId: shop.id, date: today });
    assert.strictEqual(Number(summary.expectedCash), -35);
    // Approved expense totals remains separate (should be 25)
    assert.strictEqual(Number(summary.payloadJson.totalExpenses), 25);

    // Clean up session & expenses
    await prisma.expense.deleteMany({ where: { shopId: shop.id } });
    await prisma.cashSession.deleteMany({ where: { shopId: shop.id } });
  });

  test("Phase 4B: Customer outstanding reversal on Sale and DM cancellation", async () => {
    const cust = await prisma.customer.create({
      data: { shopId: shop.id, name: "P4B Customer", type: "REGULAR", outstandingAmount: 0, createdById: owner.id },
    });
    const item1 = await prisma.item.create({
      data: { shopId: shop.id, name: "P4B Item", unit: "PCS", defaultSellingPrice: 100 },
    });

    // Put some stock in so we can sell it
    await prisma.stockLedger.create({
      data: { shopId: shop.id, itemId: item1.id, movementType: "OPENING_STOCK", quantityIn: 100, quantityOut: 0, createdById: owner.id },
    });

    // Create a sale of 500
    const sale = await saleService.createSale(owner, {
      shopId: shop.id,
      customerId: cust.id,
      items: [{ itemId: item1.id, quantity: 5, rate: 100, discountAmount: 0, lineTotal: 500 }],
      totalAmount: 500,
    });
    let freshCust = await prisma.customer.findUnique({ where: { id: cust.id } });
    assert.strictEqual(Number(freshCust.outstandingAmount), 500);

    // Request correction (Sale Cancellation)
    const saleReq = await correctionService.createCorrectionRequest(owner, {
      shopId: shop.id,
      entityType: "SALE",
      entityId: sale.id,
      reason: "Oops",
      requestedChangeJson: { action: "CANCEL" },
    });

    // Approve the cancellation
    await correctionService.approveCorrectionRequest(owner, saleReq.id);

    // Verify outstanding is reduced back to 0
    freshCust = await prisma.customer.findUnique({ where: { id: cust.id } });
    assert.strictEqual(Number(freshCust.outstandingAmount), 0);

    // Try approving again (should fail)
    await assertRejectsApi(() => correctionService.approveCorrectionRequest(owner, saleReq.id), 400);

    // Test sale with partial payment cancellation
    // Ensure no open session exists (needed to receive cash payments)
    await prisma.cashSession.deleteMany({ where: { shopId: shop.id } });
    await cashSessionService.openSession(owner, { shopId: shop.id });

    const cust2 = await prisma.customer.create({
      data: { shopId: shop.id, name: "P4B Customer 2", type: "REGULAR", outstandingAmount: 0, createdById: owner.id },
    });

    const saleWithPayment = await saleService.createSale(owner, {
      shopId: shop.id,
      customerId: cust2.id,
      items: [{ itemId: item1.id, quantity: 5, rate: 100, discountAmount: 0, lineTotal: 500 }],
      totalAmount: 500,
      payments: [{ paymentMode: "CASH", amount: 200 }],
    });

    // Verify outstanding is now 300 (500 sale - 200 payment)
    freshCust = await prisma.customer.findUnique({ where: { id: cust2.id } });
    assert.strictEqual(Number(freshCust.outstandingAmount), 300);

    const saleWithPaymentReq = await correctionService.createCorrectionRequest(owner, {
      shopId: shop.id,
      entityType: "SALE",
      entityId: saleWithPayment.id,
      reason: "Oops with payment",
      requestedChangeJson: { action: "CANCEL" },
    });

    await correctionService.approveCorrectionRequest(owner, saleWithPaymentReq.id);

    // Verify outstanding is reduced by balanceAmount (300), so outstanding is 0
    freshCust = await prisma.customer.findUnique({ where: { id: cust2.id } });
    assert.strictEqual(Number(freshCust.outstandingAmount), 0);

    // Now test Delivery Memo cancellation
    const dm = await deliveryMemoService.createDeliveryMemo(owner, {
      shopId: shop.id,
      customerId: cust.id,
      items: [{ itemId: item1.id, quantity: 2, rate: 100, discountAmount: 0, lineTotal: 200 }],
      totalAmount: 200,
    });
    freshCust = await prisma.customer.findUnique({ where: { id: cust.id } });
    assert.strictEqual(Number(freshCust.outstandingAmount), 200);

    const dmReq = await correctionService.createCorrectionRequest(owner, {
      shopId: shop.id,
      entityType: "DM",
      entityId: dm.id,
      reason: "DM Cancel",
      requestedChangeJson: { action: "CANCEL" },
    });

    await correctionService.approveCorrectionRequest(owner, dmReq.id);
    freshCust = await prisma.customer.findUnique({ where: { id: cust.id } });
    assert.strictEqual(Number(freshCust.outstandingAmount), 0);

    // Clean up sale/DM details first to avoid restricting key issues
    await prisma.saleItem.deleteMany({ where: { saleId: { in: [sale.id, saleWithPayment.id] } } });
    await prisma.payment.deleteMany({ where: { saleId: { in: [sale.id, saleWithPayment.id] } } });
    await prisma.sale.deleteMany({ where: { id: { in: [sale.id, saleWithPayment.id] } } });

    await prisma.deliveryMemoItem.deleteMany({ where: { dmId: dm.id } });
    await prisma.payment.deleteMany({ where: { dmId: dm.id } });
    await prisma.dispatch.deleteMany({ where: { dmId: dm.id } });
    await prisma.deliveryMemo.deleteMany({ where: { id: dm.id } });

    await prisma.stockLedger.deleteMany({ where: { itemId: item1.id } });
    await prisma.customerLedgerEntry.deleteMany({ where: { customerId: { in: [cust.id, cust2.id] } } });
    await prisma.item.delete({ where: { id: item1.id } });
    await prisma.customer.delete({ where: { id: cust.id } });
    await prisma.customer.delete({ where: { id: cust2.id } });
    await prisma.cashSession.deleteMany({ where: { shopId: shop.id } });
  });

  test("Phase 4B: Order cancellation and stock reservation release", async () => {
    const cust = await prisma.customer.create({
      data: { shopId: shop.id, name: "P4B Order Customer", type: "REGULAR", outstandingAmount: 0, createdById: owner.id },
    });
    const orderItem = await prisma.item.create({
      data: { shopId: shop.id, name: "P4B Order Item", unit: "PCS", defaultSellingPrice: 50 },
    });

    // Put some stock in so we can reserve it
    await prisma.stockLedger.create({
      data: { shopId: shop.id, itemId: orderItem.id, movementType: "OPENING_STOCK", quantityIn: 10, quantityOut: 0, createdById: owner.id },
    });

    // Create Order
    const order = await orderService.createOrder(owner, {
      shopId: shop.id,
      customerId: cust.id,
      items: [{ itemId: orderItem.id, quantityOrdered: 5, rate: 50 }],
    });

    // Confirm Order (this creates the reservation)
    await orderService.confirmOrder(owner, order.id);

    // Verify stock reservation is active
    let reservation = await prisma.stockReservation.findFirst({ where: { orderId: order.id } });
    assert.ok(reservation);
    assert.strictEqual(reservation.status, "ACTIVE");

    // Staff cannot cancel order
    await assertRejectsApi(() => orderService.cancelOrder(staff, order.id, { reason: "cancel" }), 403);

    // Owner cannot cancel another owner's order
    await assertRejectsApi(() => orderService.cancelOrder(otherOwner, order.id, { reason: "cancel" }), 403);

    // Owner cancels order
    const cancelledOrder = await orderService.cancelOrder(owner, order.id, { reason: "cancel" });
    assert.strictEqual(cancelledOrder.status, "CANCELLED");

    // Verify reservation status is CANCELLED
    reservation = await prisma.stockReservation.findFirst({ where: { orderId: order.id } });
    assert.strictEqual(reservation.status, "CANCELLED");
    assert.strictEqual(reservation.releasedReason, "CANCEL");

    // Duplicate cancels should be idempotent and return order without error
    const reCancelled = await orderService.cancelOrder(owner, order.id, { reason: "cancel" });
    assert.strictEqual(reCancelled.status, "CANCELLED");

    // Clean up in cascade order
    await prisma.stockReservation.deleteMany({ where: { orderId: order.id } });
    await prisma.packingTask.deleteMany({ where: { orderId: order.id } });
    await prisma.orderEvent.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.deleteMany({ where: { id: order.id } });

    await prisma.stockLedger.deleteMany({ where: { itemId: orderItem.id } });
    await prisma.item.delete({ where: { id: orderItem.id } });
    await prisma.customer.delete({ where: { id: cust.id } });
  });

  test("DM create accepts mobile-shaped null optional customer fields", async () => {
    const cust = await prisma.customer.create({
      data: { shopId: shop.id, name: "P2 DM Null Customer", type: "REGULAR", createdById: owner.id },
    });
    const dmItem = await prisma.item.create({
      data: { shopId: shop.id, name: "P2 DM Null Item", unit: "PCS", defaultSellingPrice: 25 },
    });
    await prisma.stockLedger.create({
      data: { shopId: shop.id, itemId: dmItem.id, movementType: "OPENING_STOCK", quantityIn: 5, quantityOut: 0, createdById: owner.id },
    });

    const dm = await deliveryMemoService.createDeliveryMemo(staff, {
      shopId: shop.id,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: null,
      customerAddress: null,
      items: [{ itemId: dmItem.id, quantity: 1, rate: 25 }],
      payments: [],
    });
    assert.ok(dm.id);

    await prisma.dispatch.deleteMany({ where: { dmId: dm.id } });
    await prisma.deliveryMemoItem.deleteMany({ where: { dmId: dm.id } });
    await prisma.deliveryMemo.delete({ where: { id: dm.id } });
    await prisma.stockLedger.deleteMany({ where: { itemId: dmItem.id } });
    await prisma.customerLedgerEntry.deleteMany({ where: { customerId: cust.id } });
    await prisma.item.delete({ where: { id: dmItem.id } });
    await prisma.customer.delete({ where: { id: cust.id } });
  });

  test("direct sale and DM respect active order reservations while order conversion can use its own reservation", async () => {
    const cust = await prisma.customer.create({
      data: { shopId: shop.id, name: "P2 Reserved Customer", type: "REGULAR", outstandingAmount: 0, createdById: owner.id },
    });
    const reservedItem = await prisma.item.create({
      data: { shopId: shop.id, name: "P2 Reserved Item", unit: "PCS", defaultSellingPrice: 100, minimumStock: 1 },
    });
    await prisma.stockLedger.create({
      data: { shopId: shop.id, itemId: reservedItem.id, movementType: "OPENING_STOCK", quantityIn: 10, quantityOut: 0, createdById: owner.id },
    });

    const order = await orderService.createOrder(owner, {
      shopId: shop.id,
      customerId: cust.id,
      items: [{ itemId: reservedItem.id, quantityOrdered: 8, rate: 100 }],
    });
    await orderService.confirmOrder(owner, order.id);

    const stockRows = await stockService.getCurrentStock(owner, { shopId: shop.id, itemId: reservedItem.id });
    assert.strictEqual(stockRows[0].physicalStock, 10);
    assert.strictEqual(stockRows[0].reservedStock, 8);
    assert.strictEqual(stockRows[0].availableStock, 2);

    await assertRejectsApi(() => saleService.createSale(staff, {
      shopId: shop.id,
      customerId: cust.id,
      items: [{ itemId: reservedItem.id, quantity: 3, rate: 100 }],
      payments: [],
    }), 400);

    await assertRejectsApi(() => deliveryMemoService.createDeliveryMemo(staff, {
      shopId: shop.id,
      customerId: cust.id,
      customerName: cust.name,
      items: [{ itemId: reservedItem.id, quantity: 3, rate: 100 }],
      payments: [],
    }), 400);

    const directSale = await saleService.createSale(staff, {
      shopId: shop.id,
      customerId: cust.id,
      items: [{ itemId: reservedItem.id, quantity: 2, rate: 100 }],
      payments: [],
    });
    assert.ok(directSale.id);

    const orderSale = await orderService.convertOrderToSale(owner, order.id, { payments: [] });
    assert.ok(orderSale.id);

    await prisma.dispatchItem.deleteMany({ where: { dispatch: { orderId: order.id } } });
    await prisma.dispatch.deleteMany({ where: { orderId: order.id } });
    await prisma.saleItem.deleteMany({ where: { saleId: { in: [directSale.id, orderSale.id] } } });
    await prisma.sale.deleteMany({ where: { id: { in: [directSale.id, orderSale.id] } } });
    await prisma.stockReservation.deleteMany({ where: { orderId: order.id } });
    await prisma.packingTask.deleteMany({ where: { orderId: order.id } });
    await prisma.orderEvent.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.stockLedger.deleteMany({ where: { itemId: reservedItem.id } });
    await prisma.item.delete({ where: { id: reservedItem.id } });
    await prisma.customer.delete({ where: { id: cust.id } });
  });

  test("generic approval refuses unsupported approval types without marking approved", async () => {
    const cust = await prisma.customer.create({
      data: { shopId: shop.id, name: "P2 Approval Customer", type: "REGULAR", createdById: owner.id },
    });
    const approvalItem = await prisma.item.create({
      data: { shopId: shop.id, name: "P2 Approval Item", unit: "PCS", defaultSellingPrice: 10 },
    });
    await prisma.stockLedger.create({
      data: { shopId: shop.id, itemId: approvalItem.id, movementType: "OPENING_STOCK", quantityIn: 1, quantityOut: 0, createdById: owner.id },
    });
    const sale = await saleService.createSale(staff, {
      shopId: shop.id,
      customerId: cust.id,
      items: [{ itemId: approvalItem.id, quantity: 1, rate: 10 }],
      payments: [],
    });
    const request = await correctionService.createCorrectionRequest(staff, {
      entityType: "SALE",
      entityId: sale.id,
      requestedChangeJson: { action: "CANCEL" },
      reason: "Wrong sale",
    });

    await assertRejectsApi(() => approvalService.respondToRequest(owner, request.id, { status: "APPROVED" }), 400);
    const unchanged = await prisma.approvalRequest.findUnique({ where: { id: request.id } });
    assert.strictEqual(unchanged.status, "PENDING");

    await prisma.approvalRequest.delete({ where: { id: request.id } });
    await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
    await prisma.sale.delete({ where: { id: sale.id } });
    await prisma.stockLedger.deleteMany({ where: { itemId: approvalItem.id } });
    await prisma.item.delete({ where: { id: approvalItem.id } });
    await prisma.customer.delete({ where: { id: cust.id } });
  });
});
