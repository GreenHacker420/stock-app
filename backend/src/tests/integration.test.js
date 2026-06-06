import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import { z } from "zod";
import * as customerService from "../services/customer.service.js";
import * as saleService from "../services/sale.service.js";
import * as dmService from "../services/deliveryMemo.service.js";
import * as paymentService from "../services/payment.service.js";
import * as chequeService from "../services/cheque.service.js";
import { cancelCreditOutstanding } from "../services/transactionHelpers.js";

// Constant for system-triggered actions
const SYSTEM_USER_ID = "SYSTEM";

async function cleanDatabase() {
  await prisma.paymentAllocation.deleteMany();
  await prisma.customerAdvance.deleteMany();
  await prisma.creditOutstanding.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.deliveryMemoItem.deleteMany();
  await prisma.deliveryMemo.deleteMany();
  await prisma.stockLedger.deleteMany();
  await prisma.item.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.customer.deleteMany();
}

async function getOrCreateTestEntities() {
  // Ensure we have a default shop and user
  let shop = await prisma.shop.findFirst();
  let owner = await prisma.user.findFirst({ where: { role: { name: "OWNER" } } });

  if (!owner) {
    const role = await prisma.role.upsert({
      where: { name: "OWNER" },
      update: {},
      create: { name: "OWNER" },
    });
    owner = await prisma.user.create({
      data: {
        name: "Test Owner",
        mobile: "8888888888",
        passwordHash: "dummy",
        roleId: role.id,
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

  owner.role = "OWNER";
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
      name: "Acme Corp",
      phone: "9876543210",
      outstandingAmount: 5000,
    });

    // Verify CustomerOutstanding is created
    const credit = await prisma.creditOutstanding.findFirst({
      where: { customerId: customer.id },
    });

    assert.ok(credit, "Opening balance CreditOutstanding should be created");
    assert.strictEqual(credit.sourceType, "OPENING_BALANCE");
    assert.ok(credit.originalAmount.eq(5000));
    assert.ok(credit.pendingAmount.eq(5000));
    assert.ok(credit.paidAmount.eq(0));
    assert.strictEqual(credit.status, "PENDING");

    // Verify outstanding calculation dynamically on read
    const profile = await customerService.getCustomer(owner, customer.id);
    assert.ok(profile.outstandingAmount.eq(5000), "Profile should report ₹5000 outstanding");
  });

  test("2. Partial Payment", async () => {
    // Record ₹2,000 cash payment against customer (FIFO/Opening Balance)
    const payment = await paymentService.addPayment(owner, {
      shopId: shop.id,
      customerId: customer.id,
      paymentMode: "CASH",
      amount: 2000,
    });

    // Check CreditOutstanding update
    const credit = await prisma.creditOutstanding.findFirst({
      where: { customerId: customer.id },
    });
    assert.ok(credit.paidAmount.eq(2000));
    assert.ok(credit.pendingAmount.eq(3000));
    assert.strictEqual(credit.status, "PARTIALLY_PAID");

    // Verify PaymentAllocation is created
    const allocation = await prisma.paymentAllocation.findFirst({
      where: { paymentId: payment.id },
    });
    assert.ok(allocation, "PaymentAllocation should exist");
    assert.strictEqual(allocation.allocationType, "PAYMENT");
    assert.ok(allocation.amount.eq(2000));
    assert.strictEqual(allocation.status, "ACTIVE");
  });

  test("3. Full Payment", async () => {
    // Record another ₹3,000 payment
    await paymentService.addPayment(owner, {
      shopId: shop.id,
      customerId: customer.id,
      paymentMode: "CASH",
      amount: 3000,
    });

    const credit = await prisma.creditOutstanding.findFirst({
      where: { customerId: customer.id },
    });
    assert.ok(credit.paidAmount.eq(5000));
    assert.ok(credit.pendingAmount.eq(0));
    assert.strictEqual(credit.status, "PAID");
  });

  test("4. FIFO Allocation", async () => {
    // Create items for Sale
    const item = await prisma.item.create({
      data: {
        shopId: shop.id,
        name: "Cement Box",
        unit: "bag",
        defaultSellingPrice: 500,
      },
    });

    // Add stock for the item to avoid Insufficient stock error
    await prisma.stockLedger.create({
      data: {
        shopId: shop.id,
        itemId: item.id,
        movementType: "STOCK_IN",
        quantityIn: 1000,
        quantityOut: 0,
        createdById: owner.id
      }
    });

    // Create Sale A (₹1,000 balance)
    const saleA = await saleService.createSale(owner, {
      shopId: shop.id,
      customerId: customer.id,
      items: [{ itemId: item.id, quantity: 2, rate: 500 }],
      payments: [],
    });

    // Create Sale B (₹2,000 balance)
    const saleB = await saleService.createSale(owner, {
      shopId: shop.id,
      customerId: customer.id,
      items: [{ itemId: item.id, quantity: 4, rate: 500 }],
      payments: [],
    });

    // Confirm CreditOutstanding exist
    const creditA = await prisma.creditOutstanding.findUnique({ where: { saleId: saleA.id } });
    const creditB = await prisma.creditOutstanding.findUnique({ where: { saleId: saleB.id } });
    assert.ok(creditA && creditB);

    // Make general payment of ₹1,200 (FIFO should clear Sale A, partially pay Sale B)
    const payment = await paymentService.addPayment(owner, {
      shopId: shop.id,
      customerId: customer.id,
      paymentMode: "CASH",
      amount: 1200,
    });

    const updatedA = await prisma.creditOutstanding.findUnique({ where: { saleId: saleA.id } });
    const updatedB = await prisma.creditOutstanding.findUnique({ where: { saleId: saleB.id } });

    assert.ok(updatedA.pendingAmount.eq(0));
    assert.strictEqual(updatedA.status, "PAID");

    assert.ok(updatedB.pendingAmount.eq(1800));
    assert.ok(updatedB.paidAmount.eq(200));
    assert.strictEqual(updatedB.status, "PARTIALLY_PAID");

    // Verify allocations
    const allocs = await prisma.paymentAllocation.findMany({ where: { paymentId: payment.id } });
    assert.strictEqual(allocs.length, 2);
  });

  test("5. Advance Creation & Auto Allocation", async () => {
    // Current outstanding debt is ₹1,800 on Sale B.
    // Record payment of ₹2,500 (FIFO clears Sale B, creates ₹700 CustomerAdvance)
    const payment = await paymentService.addPayment(owner, {
      shopId: shop.id,
      customerId: customer.id,
      paymentMode: "CASH",
      amount: 2500,
    });

    const creditB = await prisma.creditOutstanding.findUnique({ where: { saleId: payment.sale?.id || "" } }); // Wait, query from Sale B instead
    const creditB_updated = await prisma.creditOutstanding.findFirst({ where: { customerId: customer.id, sourceType: "SALE", status: "PAID" } });
    assert.ok(creditB_updated);

    const advance = await prisma.customerAdvance.findFirst({
      where: { customerId: customer.id, status: "PENDING" },
    });
    assert.ok(advance, "CustomerAdvance should be created");
    assert.ok(advance.pendingAmount.eq(700));

    // Create a new Sale C for ₹1,000. It should auto-apply the ₹700 advance
    const item = await prisma.item.findFirst();
    const saleC = await saleService.createSale(owner, {
      shopId: shop.id,
      customerId: customer.id,
      items: [{ itemId: item.id, quantity: 2, rate: 500 }],
      payments: [],
    });

    const creditC = await prisma.creditOutstanding.findUnique({ where: { saleId: saleC.id } });
    assert.ok(creditC.paidAmount.eq(700), "Auto-allocation should apply ₹700 from advance");
    assert.ok(creditC.pendingAmount.eq(300));
    assert.strictEqual(creditC.status, "PARTIALLY_PAID");

    const usedAdvance = await prisma.customerAdvance.findUnique({ where: { id: advance.id } });
    assert.ok(usedAdvance.pendingAmount.eq(0));
    assert.strictEqual(usedAdvance.status, "PAID");

    // Verify the ADVANCE_APPLIED allocation
    const advAlloc = await prisma.paymentAllocation.findFirst({
      where: { customerAdvanceId: advance.id, creditOutstandingId: creditC.id },
    });
    assert.ok(advAlloc);
    assert.strictEqual(advAlloc.allocationType, "ADVANCE_APPLIED");
    assert.ok(advAlloc.amount.eq(700));
  });

  test("6. Cheque Bounce & Reversal", async () => {
    // Record ₹300 cheque to clear Sale C
    const payment = await paymentService.addPayment(owner, {
      shopId: shop.id,
      customerId: customer.id,
      paymentMode: "CHEQUE",
      amount: 300,
      details: {
        chequeNumber: "123456",
        chequeBankName: "SBI",
        chequeDate: new Date(),
      },
    });

    const creditC_before = await prisma.creditOutstanding.findFirst({
      where: { saleId: payment.saleId },
    });
    assert.ok(creditC_before.pendingAmount.eq(0));

    // Bounce the cheque
    await chequeService.updateChequeStatus(owner, payment.id, "BOUNCED");

    // Verify credit is restored
    const creditC_after = await prisma.creditOutstanding.findFirst({
      where: { saleId: payment.saleId },
    });
    assert.ok(creditC_after.pendingAmount.eq(300), "Bouncing should restore ₹300 pending");
    assert.ok(creditC_after.paidAmount.eq(700));

    // Verify reversal allocation
    const revAlloc = await prisma.paymentAllocation.findFirst({
      where: { paymentId: payment.id, allocationType: "REVERSAL" },
    });
    assert.ok(revAlloc);
    assert.ok(revAlloc.amount.eq(300));
    assert.strictEqual(revAlloc.reversalOfId, (await prisma.paymentAllocation.findFirst({ where: { paymentId: payment.id, allocationType: "PAYMENT" } })).id);
  });

  test("7. Sale Cancellation & Reversal", async () => {
    const item = await prisma.item.findFirst();
    
    // Create Sale D (₹500 balance)
    const saleD = await saleService.createSale(owner, {
      shopId: shop.id,
      customerId: customer.id,
      items: [{ itemId: item.id, quantity: 1, rate: 500 }],
      payments: [],
    });

    const creditD = await prisma.creditOutstanding.findUnique({ where: { saleId: saleD.id } });

    // Pay ₹200 against Sale D
    const payment = await paymentService.addPayment(owner, {
      shopId: shop.id,
      customerId: customer.id,
      saleId: saleD.id,
      paymentMode: "CASH",
      amount: 200,
    });

    // Cancel the CreditOutstanding manually (simulating sale cancellation)
    await cancelCreditOutstanding(prisma, { creditId: creditD.id, userId: owner.id });

    // Verify credit status
    const cancelledCredit = await prisma.creditOutstanding.findUnique({ where: { id: creditD.id } });
    assert.strictEqual(cancelledCredit.status, "CANCELLED");
    assert.ok(cancelledCredit.pendingAmount.eq(0));
    assert.ok(cancelledCredit.paidAmount.eq(0));

    // Verify that the ₹200 paid is converted into a CustomerAdvance
    const newAdvance = await prisma.customerAdvance.findFirst({
      where: { customerId: customer.id, paymentId: payment.id },
    });
    assert.ok(newAdvance);
    assert.ok(newAdvance.originalAmount.eq(200));
  });

  test("8. DM Cancellation & Reversal", async () => {
    const item = await prisma.item.findFirst();
    
    // Create DM D (₹500 balance)
    const dmD = await dmService.createDeliveryMemo(owner, {
      shopId: shop.id,
      customerId: customer.id,
      items: [{ itemId: item.id, quantity: 1, rate: 500 }],
      payments: [],
    });

    const creditD = await prisma.creditOutstanding.findUnique({ where: { dmId: dmD.id } });

    // Pay ₹200 against DM D
    const payment = await paymentService.addPayment(owner, {
      shopId: shop.id,
      customerId: customer.id,
      dmId: dmD.id,
      paymentMode: "CASH",
      amount: 200,
    });

    // Cancel the CreditOutstanding manually (simulating DM cancellation)
    await cancelCreditOutstanding(prisma, { creditId: creditD.id, userId: owner.id });

    // Verify credit status
    const cancelledCredit = await prisma.creditOutstanding.findUnique({ where: { id: creditD.id } });
    assert.strictEqual(cancelledCredit.status, "CANCELLED");
    assert.ok(cancelledCredit.pendingAmount.eq(0));
    assert.ok(cancelledCredit.paidAmount.eq(0));

    // Verify that the ₹200 paid is converted into a CustomerAdvance
    const newAdvance = await prisma.customerAdvance.findFirst({
      where: { customerId: customer.id, paymentId: payment.id },
    });
    assert.ok(newAdvance);
    assert.ok(newAdvance.originalAmount.eq(200));
  });
});
