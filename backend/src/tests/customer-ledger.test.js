import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import prisma from "../lib/db.js";
import {
  postLedgerEntry,
  reverseLedgerEntry,
  insertReconciliationEntryWithoutBalanceMutation,
  getCustomerLedger,
  allocateLedgerCredit,
} from "../services/customer-ledger.service.js";
import { getCustomer } from "../services/customer.service.js";

describe("Customer Ledger Service Tests", () => {
  let testShop;
  let testUser;
  let testCustomer;
  let walkinCustomer;

  before(async () => {
    // Create test user and shop
    testUser = await prisma.user.create({
      data: {
        name: "Ledger Test User",
        mobile: `999${Date.now().toString().slice(-7)}`,
        passwordHash: "hash123",
        role: "OWNER",
      },
    });

    testShop = await prisma.shop.create({
      data: {
        name: "Ledger Test Shop",
        code: `SHOP_${Date.now()}`,
        city: "Mumbai",
        ownerId: testUser.id,
      },
    });

    testCustomer = await prisma.customer.create({
      data: {
        shopId: testShop.id,
        name: "Rahul Sharma",
        type: "REGULAR",
        phone: "9876543210",
        createdById: testUser.id,
      },
    });

    walkinCustomer = await prisma.customer.create({
      data: {
        shopId: testShop.id,
        name: "Walk-In Cash Customer",
        type: "WALK_IN",
        createdById: testUser.id,
      },
    });
  });

  after(async () => {
    if (testShop) {
      await prisma.customerLedgerAllocation.deleteMany({
        where: { shopId: testShop.id, reversalOfId: { not: null } },
      });
      await prisma.customerLedgerAllocation.deleteMany({ where: { shopId: testShop.id } });
      await prisma.customerLedgerAttachment.deleteMany({ where: { shopId: testShop.id } });
      await prisma.customerLedgerEntry.deleteMany({
        where: { shopId: testShop.id, reversalOfId: { not: null } },
      });
      await prisma.customerLedgerEntry.deleteMany({ where: { shopId: testShop.id } });
      await prisma.customer.deleteMany({ where: { shopId: testShop.id } });
      await prisma.shop.delete({ where: { id: testShop.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
    }
  });

  test("1. Reject ledger posting for WALK_IN customer", async () => {
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await postLedgerEntry(tx, {
          shopId: testShop.id,
          customerId: walkinCustomer.id,
          sourceType: "SALE",
          sourceId: "sale_walkin_1",
          entryType: "SALE_POSTED",
          direction: "DEBIT",
          amount: 500,
          createdById: testUser.id,
        });
      }),
      (err) => err.message.includes("Walk-in customers cannot carry debt or credit balance")
    );
  });

  test("2. Post DEBIT entry and verify customer outstanding balance", async () => {
    const result = await prisma.$transaction(async (tx) => {
      return postLedgerEntry(tx, {
        shopId: testShop.id,
        customerId: testCustomer.id,
        sourceType: "SALE",
        sourceId: "sale_001",
        entryType: "SALE_POSTED",
        direction: "DEBIT",
        amount: 10000,
        createdById: testUser.id,
      });
    });

    assert.equal(result.isDuplicate, false);
    assert.equal(Number(result.customer.outstandingAmount), 10000);
    assert.equal(Number(result.customer.advanceBalance), 0);
  });

  test("3. Post CREDIT entry (payment) and verify debt reduction", async () => {
    const result = await prisma.$transaction(async (tx) => {
      return postLedgerEntry(tx, {
        shopId: testShop.id,
        customerId: testCustomer.id,
        sourceType: "PAYMENT",
        sourceId: "pay_001",
        entryType: "PAYMENT_RECEIVED",
        direction: "CREDIT",
        amount: 4000,
        createdById: testUser.id,
      });
    });

    assert.equal(Number(result.customer.outstandingAmount), 6000);
    assert.equal(Number(result.customer.advanceBalance), 0);
  });

  test("4. Excess payment creates advance balance without negative debt", async () => {
    const result = await prisma.$transaction(async (tx) => {
      return postLedgerEntry(tx, {
        shopId: testShop.id,
        customerId: testCustomer.id,
        sourceType: "PAYMENT",
        sourceId: "pay_002",
        entryType: "PAYMENT_RECEIVED",
        direction: "CREDIT",
        amount: 8000,
        createdById: testUser.id,
      });
    });

    // Net balance = 6000 - 8000 = -2000 (2000 advance)
    assert.equal(Number(result.customer.outstandingAmount), 0);
    assert.equal(Number(result.customer.advanceBalance), 2000);
  });

  test("5. Single-use reversal reverses entry and restores balance", async () => {
    // Reverse pay_002 (8000 credit)
    const payEntry = await prisma.customerLedgerEntry.findFirst({
      where: { shopId: testShop.id, sourceId: "pay_002" },
    });

    const reversalResult = await prisma.$transaction(async (tx) => {
      return reverseLedgerEntry(tx, {
        shopId: testShop.id,
        entryId: payEntry.id,
        reversalReason: "Cheque bounced",
        createdById: testUser.id,
      });
    });

    // Debt restored to 6000 outstanding, 0 advance
    assert.equal(Number(reversalResult.customer.outstandingAmount), 6000);
    assert.equal(Number(reversalResult.customer.advanceBalance), 0);

    // Attempt second reversal of same entry should throw 409
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        return reverseLedgerEntry(tx, {
          shopId: testShop.id,
          entryId: payEntry.id,
          reversalReason: "Duplicate reversal attempt",
          createdById: testUser.id,
        });
      }),
      (err) => err.message.includes("already been reversed")
    );
  });

  test("6. Reconciliation entry aligns ledger sum without double-mutating cached balance", async () => {
    // Current cached net = 6000 outstanding
    const result = await prisma.$transaction(async (tx) => {
      return insertReconciliationEntryWithoutBalanceMutation(tx, {
        shopId: testShop.id,
        customerId: testCustomer.id,
        direction: "DEBIT",
        amount: 2000,
        createdById: testUser.id,
        notes: "Test reconciliation entry",
      });
    });

    assert.equal(Number(result.customer.outstandingAmount), 6000);
    assert.equal(Number(result.customer.advanceBalance), 0);
  });

  test("7. getCustomerLedger computes accurate running balances via CTE", async () => {
    const ledger = await getCustomerLedger(
      { id: testUser.id, role: "OWNER" },
      testCustomer.id,
      { shopId: testShop.id }
    );

    assert.ok(ledger.entries.length >= 4);
    assert.equal(ledger.customer.outstandingAmount, 8000);
    assert.equal(ledger.customer.advanceBalance, 0);

    const customer = await getCustomer({ id: testUser.id, role: "OWNER" }, testCustomer.id);
    assert.equal(customer.outstandingAmount, 8000);
  });
});
