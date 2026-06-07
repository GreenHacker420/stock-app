import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import { z } from "zod";
import * as customerService from "../services/customer.service.js";
import * as saleService from "../services/sale.service.js";
import * as dmService from "../services/deliveryMemo.service.js";
import * as paymentService from "../services/payment.service.js";
import * as chequeService from "../services/cheque.service.js";
import * as returnService from "../services/return.service.js";
import * as orderService from "../services/order.service.js";
import * as stockService from "../services/stock.service.js";
import * as itemService from "../services/item.service.js";
import * as approvalService from "../services/approval.service.js";
import * as rateChangeService from "../services/rateChange.service.js";
import * as correctionService from "../services/correction.service.js";

async function cleanDatabase(shopId) {
  if (!shopId) return;

  await prisma.inventoryReturnItem.deleteMany({ where: { return: { shopId } } });
  await prisma.inventoryReturn.deleteMany({ where: { shopId } });
  await prisma.stockReservation.deleteMany({ where: { shopId } });
  await prisma.paymentDetail.deleteMany({ where: { payment: { shopId } } });
  await prisma.payment.deleteMany({ where: { shopId } });
  await prisma.saleItem.deleteMany({ where: { sale: { shopId } } });
  await prisma.sale.deleteMany({ where: { shopId } });
  await prisma.deliveryMemoItem.deleteMany({ where: { deliveryMemo: { shopId } } });
  await prisma.deliveryMemo.deleteMany({ where: { shopId } });
  await prisma.dispatchItem.deleteMany({ where: { dispatch: { shopId } } });
  await prisma.dispatch.deleteMany({ where: { shopId } });
  await prisma.packingTask.deleteMany({ where: { shopId } });
  await prisma.orderEvent.deleteMany({ where: { order: { shopId } } });
  await prisma.orderItem.deleteMany({ where: { order: { shopId } } });
  await prisma.order.deleteMany({ where: { shopId } });
  await prisma.stockLedger.deleteMany({ where: { shopId } });
  await prisma.stockBalance.deleteMany({ where: { shopId } });
  await prisma.itemPriceHistory.deleteMany({ where: { item: { shopId } } });
  await prisma.item.deleteMany({ where: { shopId } });
  await prisma.itemCategory.deleteMany({ where: { shopId } });
  await prisma.expense.deleteMany({ where: { shopId } });
  await prisma.approvalRequest.deleteMany({ where: { shopId } });
  await prisma.attendance.deleteMany({ where: { shopId } });
  await prisma.leaveRequest.deleteMany({ where: { staff: { mobile: "7777777777" } } });
  await prisma.cashSession.deleteMany({ where: { shopId } });
  await prisma.customer.deleteMany({ where: { shopId } });

  // Clean up staff shop access and user last
  await prisma.staffShopAccess.deleteMany({ where: { staff: { mobile: "7777777777" } } });
  await prisma.user.deleteMany({ where: { mobile: "7777777777" } });
}

async function getOrCreateTestEntities() {
  let owner = await prisma.user.findUnique({ where: { mobile: "8888888888" } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        name: "Test Owner",
        mobile: "8888888888",
        passwordHash: "dummy",
        role: "OWNER",
      },
    });
  }

  let shop = await prisma.shop.findUnique({ where: { code: "TST" } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        name: "Test Shop",
        code: "TST",
        city: "Mumbai",
        ownerId: owner.id,
      },
    });
  }

  return { shop, owner };
}

test.describe("ShopControl ERP Debt Ledger Integration Tests", () => {
  let shop, owner, customer, staff;

  test.before(async () => {
    const entities = await getOrCreateTestEntities();
    shop = entities.shop;
    owner = entities.owner;
    await cleanDatabase(shop.id);

    // Create staff member and shop access
    staff = await prisma.user.create({
      data: {
        name: "Test Staff",
        mobile: "7777777777",
        passwordHash: "dummy",
        role: "STAFF"
      }
    });

    await prisma.staffShopAccess.create({
      data: {
        staffId: staff.id,
        shopId: shop.id
      }
    });

    // Open a cash session for cash payments
    await prisma.cashSession.create({
      data: {
        shopId: shop.id,
        staffId: owner.id,
        status: "OPEN",
        openingCash: 0
      }
    });
  });

  test.after(async () => {
    await cleanDatabase(shop.id);
  });

  test("1. Opening Balance Onboarding", async () => {
    // Create customer with ₹5,000 opening outstanding
    customer = await customerService.createCustomer(owner, {
      shopId: shop.id,
      name: "ABC Enterprise",
      phone: "9999999999",
      outstandingAmount: 5000
    });

    assert.strictEqual(Number(customer.outstandingAmount), 5000);
  });

  test("2. Staff Stock Entry Approval and Execution Flow", async () => {
    // A. Create an item first
    const item = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "Test Product A",
      unit: "pcs",
      defaultSellingPrice: 100,
    });

    // B. Call bulkStockEntry as STAFF
    const staffEntryResult = await stockService.bulkStockEntry(staff, {
      shopId: shop.id,
      entries: [
        { itemId: item.id, quantity: 15 }
      ],
      notes: "Bulk stock entry request by staff"
    });

    // C. Verify staff request response
    assert.strictEqual(staffEntryResult.isRequest, true);
    assert.ok(staffEntryResult.requestId);
    assert.strictEqual(staffEntryResult.status, "PENDING");

    // D. Check the stock remains 0 before approval
    const initialStock = await stockService.getCurrentStock(owner, { shopId: shop.id, itemId: item.id });
    assert.strictEqual(initialStock.length, 0);

    // E. Respond to approval request as OWNER (APPROVE)
    const approveResult = await approvalService.respondToRequest(owner, staffEntryResult.requestId, {
      status: "APPROVED"
    });

    assert.strictEqual(approveResult.status, "APPROVED");

    // F. Verify the stock is updated to 15
    const finalStock = await stockService.getCurrentStock(owner, { shopId: shop.id, itemId: item.id });
    assert.strictEqual(finalStock.length, 1);
    assert.strictEqual(finalStock[0].currentQuantity, 15);
  });

  test("3. Staff Rate Change Request Approval Flow", async () => {
    // A. Create an item first
    const item = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "Test Product B",
      unit: "pcs",
      defaultSellingPrice: 100,
    });

    // B. Create a draft order
    const order = await orderService.createOrder(staff, {
      shopId: shop.id,
      customerId: customer.id,
      items: [
        { itemId: item.id, quantityOrdered: 10, rate: 100 }
      ]
    });

    const orderItem = order.items[0];
    assert.strictEqual(Number(orderItem.rate), 100);
    assert.strictEqual(Number(order.totalAmount), 1000);

    // C. Request rate change as staff
    const request = await rateChangeService.createRateChangeRequest(staff, {
      orderItemId: orderItem.id,
      suggestedRate: 80,
      reason: "Discount for regular customer"
    });

    assert.strictEqual(request.status, "PENDING");
    assert.strictEqual(request.suggestedRate, 80);

    // D. Approve as owner
    const approveResult = await rateChangeService.approveRateChangeRequest(owner, request.id);
    assert.strictEqual(approveResult.status, "APPROVED");

    // E. Verify order item rate and order totals are updated
    const updatedOrder = await orderService.getOrder(owner, order.id);
    assert.strictEqual(Number(updatedOrder.items[0].rate), 80);
    assert.strictEqual(Number(updatedOrder.totalAmount), 800);
  });

  test("4. Staff Sale Correction & Cancel Request Approval Flow", async () => {
    // A. Create an item and add stock (opening stock)
    const item = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "Test Product C",
      unit: "pcs",
      defaultSellingPrice: 100,
    });

    await stockService.bulkStockEntry(owner, {
      shopId: shop.id,
      entries: [{ itemId: item.id, quantity: 50 }]
    });

    // B. Create a sale
    const sale = await saleService.createSale(staff, {
      shopId: shop.id,
      customerId: customer.id,
      items: [
        { itemId: item.id, quantity: 5, rate: 100 }
      ]
    });

    assert.strictEqual(sale.saleStatus, "CONFIRMED");

    // C. Request sale cancellation as staff
    const request = await correctionService.createCorrectionRequest(staff, {
      entityType: "SALE",
      entityId: sale.id,
      requestedChangeJson: { action: "CANCEL", status: "CANCELLED" },
      reason: "Customer changed mind"
    });

    assert.strictEqual(request.status, "PENDING");

    // D. Approve cancellation request as owner
    const approveResult = await correctionService.approveCorrectionRequest(owner, request.id);
    assert.strictEqual(approveResult.status, "APPROVED");

    // E. Verify sale is CANCELLED in database
    const updatedSale = await saleService.getSale(owner, sale.id);
    assert.strictEqual(updatedSale.saleStatus, "CANCELLED");
  });

  test("5. Hybrid Vector Search and Embedding Updates Flow", async () => {
    // A. Create multiple items with different names
    const item1 = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "Toner Printer Laser Cartridge 12A",
      unit: "pcs",
      defaultSellingPrice: 1500,
    });

    const item2 = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "Office Steel Chasis Frame",
      unit: "pcs",
      defaultSellingPrice: 400,
    });

    const item3 = await itemService.createItem(owner, {
      shopId: shop.id,
      name: "Heavy Duty Painting Roller Tool",
      unit: "pcs",
      defaultSellingPrice: 200,
    });

    // B. Query "toner" and assert item1 is ranked first (due to vector similarity and name contains)
    const tonerSearch = await itemService.listItems(owner, {
      shopId: shop.id,
      search: "toner",
    });

    assert.ok(tonerSearch.items.length >= 1);
    assert.strictEqual(tonerSearch.items[0].id, item1.id);

    // C. Query "chasis" and assert item2 is ranked first
    const chasisSearch = await itemService.listItems(owner, {
      shopId: shop.id,
      search: "chasis",
    });

    assert.ok(chasisSearch.items.length >= 1);
    assert.strictEqual(chasisSearch.items[0].id, item2.id);

    // D. Update item3 name to "Toner Ink Refill Bottle" and verify search for "toner" now ranks it highly
    await itemService.updateItem(owner, item3.id, {
      name: "Toner Ink Refill Bottle"
    });

    const updatedTonerSearch = await itemService.listItems(owner, {
      shopId: shop.id,
      search: "toner",
    });

    const topItemIds = updatedTonerSearch.items.slice(0, 2).map(it => it.id);
    assert.ok(topItemIds.includes(item3.id));
  });
});
