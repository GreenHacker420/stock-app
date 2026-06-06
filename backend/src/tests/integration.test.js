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

async function cleanDatabase() {
  await prisma.inventoryReturnItem.deleteMany();
  await prisma.inventoryReturn.deleteMany();
  await prisma.stockReservation.deleteMany();
  await prisma.paymentDetail.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.deliveryMemoItem.deleteMany();
  await prisma.deliveryMemo.deleteMany();
  await prisma.dispatchItem.deleteMany();
  await prisma.dispatch.deleteMany();
  await prisma.packingTask.deleteMany();
  await prisma.orderEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stockLedger.deleteMany();
  await prisma.itemPriceHistory.deleteMany();
  await prisma.item.deleteMany();
  await prisma.itemCategory.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.customer.deleteMany();
}

async function getOrCreateTestEntities() {
  // Ensure we have a default shop and user
  let shop = await prisma.shop.findFirst();
  let owner = await prisma.user.findFirst({ where: { role: "OWNER" } });

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
  let shop, owner, customer;

  test.before(async () => {
    const entities = await getOrCreateTestEntities();
    shop = entities.shop;
    owner = entities.owner;
    await cleanDatabase();

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
    await cleanDatabase();
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
});
