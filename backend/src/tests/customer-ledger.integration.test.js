import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import prisma from "../lib/db.js";
import {
  postLedgerEntry,
  reverseLedgerEntry,
  postOpeningBalance,
  getCustomerLedger,
  getCustomerLedgerSummary,
  getCustomerLedgerStatement,
  allocateLedgerCredit,
} from "../services/customer-ledger.service.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let shopId, ownerId, regularCustomerId, walkinCustomerId;

async function cleanup() {
  await prisma.customerLedgerAllocation.deleteMany({ where: { shop: { id: shopId } } }).catch(() => {});
  await prisma.customerLedgerAttachment.deleteMany({ where: { shopId } }).catch(() => {});
  await prisma.customerLedgerEntry.deleteMany({ where: { shopId } }).catch(() => {});
  await prisma.customer.deleteMany({ where: { shopId } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { shopId } }).catch(() => {});
  await prisma.shop.deleteMany({ where: { id: shopId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: ownerId } }).catch(() => {});
}

function ownerUser() {
  return { id: ownerId, role: "OWNER" };
}

before(async () => {
  // Create minimal user + shop + customers for tests
  const ts = Date.now();
  const user = await prisma.user.create({
    data: {
      name: "LedgerTest Owner",
      mobile: `+9199${ts.toString().slice(-8)}`,
      passwordHash: "x",
      role: "OWNER",
    },
  });
  ownerId = user.id;

  const shop = await prisma.shop.create({
    data: {
      name: "LedgerTest Shop",
      code: `LEDGER_${ts}`,
      city: "Mumbai",
      ownerId,
    },
  });
  shopId = shop.id;

  const regular = await prisma.customer.create({
    data: {
      shopId,
      name: "Regular Test Customer",
      type: "REGULAR",
      createdById: ownerId,
      outstandingAmount: 0,
      advanceBalance: 0,
    },
  });
  regularCustomerId = regular.id;

  const walkin = await prisma.customer.create({
    data: {
      shopId,
      name: "Walk In Customer",
      type: "WALK_IN",
      createdById: ownerId,
      outstandingAmount: 0,
      advanceBalance: 0,
    },
  });
  walkinCustomerId = walkin.id;
});


after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Helper to get fresh customer state
// ---------------------------------------------------------------------------
async function freshCustomer() {
  return prisma.customer.findUnique({ where: { id: regularCustomerId } });
}

async function ledgerNetForCustomer(customerId = regularCustomerId) {
  const totals = await prisma.customerLedgerEntry.groupBy({
    by: ["direction"],
    where: { customerId, shopId },
    _sum: { amount: true },
  });
  let debit = 0, credit = 0;
  totals.forEach((t) => {
    if (t.direction === "DEBIT") debit = Number(t._sum.amount || 0);
    if (t.direction === "CREDIT") credit = Number(t._sum.amount || 0);
  });
  return debit - credit;
}

// ---------------------------------------------------------------------------
// Suite 1: Walk-in guard
// ---------------------------------------------------------------------------
describe("Walk-in customer guard", () => {
  it("should reject postLedgerEntry for WALK_IN customer", async () => {
    await assert.rejects(
      () => prisma.$transaction((tx) =>
        postLedgerEntry(tx, {
          shopId, customerId: walkinCustomerId,
          sourceType: "SALE", sourceId: "fake-sale-id",
          entryType: "SALE_POSTED", direction: "DEBIT",
          amount: 100, createdById: ownerId,
        })
      ),
      (err) => {
        assert.ok(err.message.includes("Walk-in"), `Expected walk-in error, got: ${err.message}`);
        return true;
      }
    );
  });

  it("should reject postOpeningBalance for WALK_IN customer", async () => {
    await assert.rejects(
      () => prisma.$transaction((tx) =>
        postOpeningBalance(tx, {
          shopId, customerId: walkinCustomerId,
          amount: 500, direction: "DEBIT", createdById: ownerId,
        })
      ),
      (err) => {
        assert.ok(err.message.includes("Walk-in") || err.message.includes("Walk-in"), `Expected walk-in error, got: ${err.message}`);
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Opening Balance
// ---------------------------------------------------------------------------
describe("Opening Balance", () => {
  it("should post DEBIT opening balance (receivable) and update customer", async () => {
    const result = await prisma.$transaction((tx) =>
      postOpeningBalance(tx, {
        shopId, customerId: regularCustomerId,
        amount: 1000, direction: "DEBIT", createdById: ownerId,
        notes: "Opening receivable",
      })
    );

    assert.ok(result.entry, "Entry should be created");
    assert.equal(result.entry.entryType, "OPENING_RECEIVABLE");
    assert.equal(result.entry.direction, "DEBIT");
    assert.equal(Number(result.entry.amount), 1000);
    assert.equal(Number(result.customer.outstandingAmount), 1000);
    assert.equal(Number(result.customer.advanceBalance), 0);
  });

  it("should reject second opening balance for the same customer", async () => {
    await assert.rejects(
      () => prisma.$transaction((tx) =>
        postOpeningBalance(tx, {
          shopId, customerId: regularCustomerId,
          amount: 500, direction: "DEBIT", createdById: ownerId,
        })
      ),
      (err) => {
        assert.ok(err.statusCode === 409 || err.message.includes("already been set"), `Got: ${err.message}`);
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Accounting Invariants
// ---------------------------------------------------------------------------
describe("Accounting invariants: netBalance = Σ(DEBIT) − Σ(CREDIT)", () => {
  it("DEBIT entry increases outstandingAmount", async () => {
    const before = await freshCustomer();
    const prevOutstanding = Number(before.outstandingAmount);

    await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "SALE", sourceId: `sale-inv-${Date.now()}`,
        entryType: "SALE_POSTED", direction: "DEBIT",
        amount: 500, createdById: ownerId,
      })
    );

    const after = await freshCustomer();
    assert.equal(Number(after.outstandingAmount), prevOutstanding + 500);
    assert.equal(Number(after.advanceBalance), 0);
  });

  it("CREDIT entry reduces outstandingAmount", async () => {
    const before = await freshCustomer();
    const prevOutstanding = Number(before.outstandingAmount);

    await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "PAYMENT", sourceId: `pay-inv-${Date.now()}`,
        entryType: "PAYMENT_RECEIVED", direction: "CREDIT",
        amount: 300, createdById: ownerId,
      })
    );

    const after = await freshCustomer();
    assert.equal(Number(after.outstandingAmount), Math.max(0, prevOutstanding - 300));
  });

  it("excess CREDIT creates advance balance, not negative outstanding", async () => {
    // Fresh customer starting at zero — do not set outstandingAmount directly
    const extra = await prisma.customer.create({
      data: { shopId, name: "Excess Credit Customer", type: "REGULAR", createdById: ownerId, outstandingAmount: 0, advanceBalance: 0 },
    });

    // Post the sale debit through ledger
    await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: extra.id,
        sourceType: "SALE", sourceId: `sale-excess-${Date.now()}`,
        entryType: "SALE_POSTED", direction: "DEBIT",
        amount: 200, createdById: ownerId,
      })
    );

    // Overpay (credit > debit → advance)
    await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: extra.id,
        sourceType: "PAYMENT", sourceId: `pay-excess-${Date.now()}`,
        entryType: "PAYMENT_RECEIVED", direction: "CREDIT",
        amount: 350, createdById: ownerId,
      })
    );

    const after = await prisma.customer.findUnique({ where: { id: extra.id } });
    // Net = 200 (debit) - 350 (credit) = -150 → advance = 150, outstanding = 0
    assert.ok(Number(after.outstandingAmount) >= 0, "outstandingAmount must not be negative");
    assert.ok(Number(after.advanceBalance) > 0, `advance should be positive after overpayment, got ${Number(after.advanceBalance)}`);
    assert.equal(Number(after.outstandingAmount), 0, "No outstanding after overpayment");
    assert.equal(Number(after.advanceBalance), 150, "Advance should be 150");

    // Cleanup
    await prisma.customerLedgerEntry.deleteMany({ where: { customerId: extra.id } });
    await prisma.customer.delete({ where: { id: extra.id } });
  });

  it("cached balance equals ledger computed net balance", async () => {
    const c = await freshCustomer();
    const ledgerNet = await ledgerNetForCustomer(regularCustomerId);
    const cachedNet = Number(c.outstandingAmount) - Number(c.advanceBalance);
    assert.ok(
      Math.abs(cachedNet - ledgerNet) < 0.01,
      `Cached net (${cachedNet}) !== ledger net (${ledgerNet})`
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Reversal Idempotency / Source Identity
// ---------------------------------------------------------------------------
describe("Reversal source identity (no compound key collision)", () => {
  it("reversalEntry.sourceId should be originalEntry.id, not originalEntry.sourceId", async () => {
    const saleSourceId = `rev-test-sale-${Date.now()}`;

    const { entry: original } = await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "SALE", sourceId: saleSourceId,
        entryType: "SALE_POSTED", direction: "DEBIT",
        amount: 400, createdById: ownerId,
      })
    );

    const { reversalEntry } = await prisma.$transaction((tx) =>
      reverseLedgerEntry(tx, {
        shopId, entryId: original.id,
        reversalReason: "Test reversal",
        createdById: ownerId,
      })
    );

    assert.equal(reversalEntry.sourceId, original.id, "Reversal sourceId must be the original entry id");
    assert.equal(reversalEntry.sourceType, "REVERSAL");
    assert.equal(reversalEntry.reversalOfId, original.id);
    assert.ok(reversalEntry.metadata?.originalSourceId === saleSourceId);
  });

  it("two reversals from same sale source do not collide on compound key", async () => {
    const saleId = `multi-rev-sale-${Date.now()}`;
    const ts = Date.now();

    // Use distinct entryTypes and explicit idempotencyKeys so compound key dedup doesn't merge them
    const { entry: e1 } = await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "SALE", sourceId: saleId,
        entryType: "SALE_POSTED", direction: "DEBIT",
        amount: 100, createdById: ownerId,
        idempotencyKey: `multi-rev-A-${ts}`,
      })
    );

    const { entry: e2 } = await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "SALE_AMENDMENT", sourceId: `amendment-${ts}`,
        entryType: "SALE_VALUE_INCREASE", direction: "DEBIT",
        amount: 200, createdById: ownerId,
        idempotencyKey: `multi-rev-B-${ts}`,
      })
    );

    // Reversing both should not throw — they have distinct entry IDs as sourceId
    const { reversalEntry: r1 } = await prisma.$transaction((tx) =>
      reverseLedgerEntry(tx, { shopId, entryId: e1.id, reversalReason: "Rev 1", createdById: ownerId })
    );
    const { reversalEntry: r2 } = await prisma.$transaction((tx) =>
      reverseLedgerEntry(tx, { shopId, entryId: e2.id, reversalReason: "Rev 2", createdById: ownerId })
    );

    assert.notEqual(r1.sourceId, r2.sourceId);
    assert.equal(r1.sourceId, e1.id);
    assert.equal(r2.sourceId, e2.id);
  });

  it("cannot reverse an already-reversed entry", async () => {
    const { entry } = await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "MANUAL_ADJUSTMENT", sourceId: `adj-${Date.now()}`,
        entryType: "ADJUSTMENT_DEBIT", direction: "DEBIT",
        amount: 50, createdById: ownerId,
      })
    );

    await prisma.$transaction((tx) =>
      reverseLedgerEntry(tx, { shopId, entryId: entry.id, reversalReason: "First", createdById: ownerId })
    );

    await assert.rejects(
      () => prisma.$transaction((tx) =>
        reverseLedgerEntry(tx, { shopId, entryId: entry.id, reversalReason: "Second", createdById: ownerId })
      ),
      (err) => {
        assert.ok(err.statusCode === 409 || err.message.includes("already been reversed"), `Got: ${err.message}`);
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Idempotency
// ---------------------------------------------------------------------------
describe("Ledger entry idempotency", () => {
  it("duplicate idempotencyKey returns existing entry without double-posting", async () => {
    const key = `idem-${Date.now()}`;

    const { entry: e1 } = await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "PAYMENT", sourceId: `pay-idem-${Date.now()}`,
        entryType: "PAYMENT_RECEIVED", direction: "CREDIT",
        amount: 100, createdById: ownerId, idempotencyKey: key,
      })
    );

    const { entry: e2, isDuplicate } = await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "PAYMENT", sourceId: `pay-idem-${Date.now()}-2`,
        entryType: "PAYMENT_RECEIVED", direction: "CREDIT",
        amount: 999, // different amount — should be ignored
        createdById: ownerId, idempotencyKey: key,
      })
    );

    assert.equal(isDuplicate, true);
    assert.equal(e1.id, e2.id);
    assert.equal(Number(e2.amount), 100, "Amount must not be updated on duplicate");
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Running Balance CTE
// ---------------------------------------------------------------------------
describe("Running balance CTE accuracy", () => {
  it("running balance increases monotonically for sequential debits", async () => {
    // Create a fresh customer for CTE tests
    const cteCustomer = await prisma.customer.create({
      data: { shopId, name: "CTE Test Customer", type: "REGULAR", createdById: ownerId, outstandingAmount: 0, advanceBalance: 0 },
    });

    const amounts = [100, 200, 150];
    for (const amt of amounts) {
      await prisma.$transaction((tx) =>
        postLedgerEntry(tx, {
          shopId, customerId: cteCustomer.id,
          sourceType: "SALE", sourceId: `cte-sale-${amt}-${Date.now()}`,
          entryType: "SALE_POSTED", direction: "DEBIT",
          amount: amt, createdById: ownerId,
        })
      );
    }

    const result = await getCustomerLedger(ownerUser(), cteCustomer.id, {
      shopId,
      limit: 20,
    });

    const entries = result.entries.sort((a, b) => new Date(a.effectiveAt) - new Date(b.effectiveAt));
    let prevBalance = 0;
    for (const entry of entries) {
      if (entry.direction === "DEBIT") {
        assert.ok(entry.runningBalance > prevBalance, `Running balance should increase at DEBIT entry`);
      }
      prevBalance = entry.runningBalance;
    }

    // Cleanup
    await prisma.customerLedgerEntry.deleteMany({ where: { customerId: cteCustomer.id } });
    await prisma.customer.delete({ where: { id: cteCustomer.id } });
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Customer Ledger Statement
// ---------------------------------------------------------------------------
describe("Customer Ledger Statement API", () => {
  it("should return correct opening/closing balances for a date range", async () => {
    const stmtCustomer = await prisma.customer.create({
      data: { shopId, name: "Statement Customer", type: "REGULAR", createdById: ownerId, outstandingAmount: 0, advanceBalance: 0 },
    });

    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();

    // Posting before the range (opening balance)
    await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: stmtCustomer.id,
        sourceType: "SALE", sourceId: `stmt-pre-${Date.now()}`,
        entryType: "SALE_POSTED", direction: "DEBIT",
        amount: 500, createdById: ownerId,
        effectiveAt: past,
      })
    );

    // Within range
    await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: stmtCustomer.id,
        sourceType: "PAYMENT", sourceId: `stmt-pay-${Date.now()}`,
        entryType: "PAYMENT_RECEIVED", direction: "CREDIT",
        amount: 200, createdById: ownerId,
        effectiveAt: today,
      })
    );

    const stmt = await getCustomerLedgerStatement(ownerUser(), stmtCustomer.id, {
      shopId,
      from: yesterday.toISOString(),
      to: new Date(Date.now() + 86400000).toISOString(),
    });

    assert.equal(stmt.openingBalance, 500, `Expected opening balance of 500, got ${stmt.openingBalance}`);
    assert.equal(stmt.periodCredits, 200, `Expected 200 in credits, got ${stmt.periodCredits}`);
    assert.equal(stmt.closingBalance, 300, `Expected closing balance of 300, got ${stmt.closingBalance}`);
    assert.equal(stmt.outstandingAmount, 300);
    assert.equal(stmt.advanceBalance, 0);

    // Cleanup
    await prisma.customerLedgerEntry.deleteMany({ where: { customerId: stmtCustomer.id } });
    await prisma.customer.delete({ where: { id: stmtCustomer.id } });
  });

  it("should reject statement without from/to", async () => {
    await assert.rejects(
      () => getCustomerLedgerStatement(ownerUser(), regularCustomerId, { shopId }),
      (err) => {
        assert.ok(err.message.includes("from") || err.message.includes("required"), `Got: ${err.message}`);
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Allocation Concurrency
// ---------------------------------------------------------------------------
describe("Allocation idempotency via clientMutationId", () => {
  it("duplicate allocation with clientMutationId returns existing allocation", async () => {
    const cmid = `alloc-idem-${Date.now()}`;

    const { entry: debit } = await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "SALE", sourceId: `alloc-sale-${Date.now()}`,
        entryType: "SALE_POSTED", direction: "DEBIT",
        amount: 600, createdById: ownerId,
      })
    );

    const { entry: credit } = await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        shopId, customerId: regularCustomerId,
        sourceType: "PAYMENT", sourceId: `alloc-pay-${Date.now()}`,
        entryType: "PAYMENT_RECEIVED", direction: "CREDIT",
        amount: 600, createdById: ownerId,
      })
    );

    const a1 = await prisma.$transaction((tx) =>
      allocateLedgerCredit(tx, {
        shopId, customerId: regularCustomerId,
        debitEntryId: debit.id, creditEntryId: credit.id,
        amount: 300, createdById: ownerId, clientMutationId: cmid,
      })
    );

    // Retry with same clientMutationId
    const a2 = await prisma.$transaction((tx) =>
      allocateLedgerCredit(tx, {
        shopId, customerId: regularCustomerId,
        debitEntryId: debit.id, creditEntryId: credit.id,
        amount: 300, createdById: ownerId, clientMutationId: cmid,
      })
    );

    assert.equal(a1.id, a2.id, "Idempotent allocation should return same record");
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Authorization
// ---------------------------------------------------------------------------
describe("Ledger authorization", () => {
  it("getCustomerLedger should throw on shopId mismatch", async () => {
    const otherShop = await prisma.shop.create({
      data: { name: "Other Shop", code: `OTHER_${Date.now()}`, city: "Delhi", ownerId },
    });

    await assert.rejects(
      () => getCustomerLedger(ownerUser(), regularCustomerId, { shopId: otherShop.id }),
      (err) => {
        assert.ok(err.statusCode === 403 || err.statusCode === 404, `Expected 403/404, got ${err.statusCode}: ${err.message}`);
        return true;
      }
    );

    await prisma.shop.delete({ where: { id: otherShop.id } });
  });

  it("getCustomerLedger should reject malformed cursor", async () => {
    await assert.rejects(
      () => getCustomerLedger(ownerUser(), regularCustomerId, { shopId, cursor: "not-valid-base64!!" }),
      (err) => {
        assert.ok(err.statusCode === 400 || err.message.includes("cursor") || err.message.includes("Invalid"), `Got: ${err.message}`);
        return true;
      }
    );
  });

  it("getCustomerLedger should reject invalid direction enum", async () => {
    await assert.rejects(
      () => getCustomerLedger(ownerUser(), regularCustomerId, { shopId, direction: "INVALID" }),
      (err) => {
        assert.ok(err.statusCode === 400, `Expected 400, got: ${err.statusCode}`);
        return true;
      }
    );
  });
});
