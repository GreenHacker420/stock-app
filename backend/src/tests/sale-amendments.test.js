import test from "node:test";
import assert from "node:assert";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import * as saleService from "../services/sale.service.js";

const CODES = ["TST1"];
const MOBILES = ["9998887701", "9998887702"];

async function cleanup() {
  const shops = await prisma.shop.findMany({ where: { code: { in: CODES } }, select: { id: true } });
  const shopIds = shops.map((shop) => shop.id);
  if (shopIds.length) {
    await prisma.saleItem.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
    await prisma.saleAmendment.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
    await prisma.invoice.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
    await prisma.stockLedger.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.stockBalance.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.sale.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.item.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
  }
  await prisma.user.deleteMany({ where: { mobile: { in: MOBILES } } });
}

test.describe("Sale Amendments and Invoices", () => {
  let owner;
  let shop;
  let customer;
  let itemA;
  let itemB;

  test.before(async () => {
    await cleanup();
    owner = await prisma.user.create({
      data: { name: "Test Owner", mobile: MOBILES[0], passwordHash: "hash", role: "OWNER" }
    });
    shop = await prisma.shop.create({
      data: { name: "Test Shop", code: CODES[0], ownerId: owner.id, city: "Nagpur" }
    });
    customer = await prisma.customer.create({
      data: { name: "Test Customer", shopId: shop.id, outstandingAmount: 0, createdById: owner.id }
    });
    itemA = await prisma.item.create({
      data: { name: "Product A", sku: "SKU-A", shopId: shop.id, defaultSellingPrice: 100, minimumAllowedPrice: 80, unit: "PCS" }
    });
    itemB = await prisma.item.create({
      data: { name: "Product B", sku: "SKU-B", shopId: shop.id, defaultSellingPrice: 200, minimumAllowedPrice: 160, unit: "PCS" }
    });

    // Seed stock balances
    await prisma.stockBalance.createMany({
      data: [
        { shopId: shop.id, itemId: itemA.id, physicalStock: 100, availableStock: 100 },
        { shopId: shop.id, itemId: itemB.id, physicalStock: 100, availableStock: 100 },
      ]
    });
    await prisma.stockLedger.createMany({
      data: [
        { shopId: shop.id, itemId: itemA.id, movementType: "OPENING_STOCK", quantityIn: 100, quantityOut: 0, createdById: owner.id },
        { shopId: shop.id, itemId: itemB.id, movementType: "OPENING_STOCK", quantityIn: 100, quantityOut: 0, createdById: owner.id },
      ]
    });
  });

  test.after(async () => {
    await cleanup();
  });

  test("1. Direct editing works on draft sales but throws on confirmed sales", async () => {
    // Create draft sale
    const draftSale = await prisma.sale.create({
      data: {
        saleNumber: "SALE-001",
        shopId: shop.id,
        customerId: customer.id,
        saleStatus: "DRAFT",
        paymentStatus: "UNPAID",
        totalAmount: 100,
        subtotal: 100,
        discountAmount: 0,
        paidAmount: 0,
        balanceAmount: 100,
        gstRequired: false,
        staffId: owner.id,
        items: {
          create: {
            itemId: itemA.id,
            quantity: 1,
            rate: 100,
            totalAmount: 100,
          }
        }
      }
    });

    // Update draft sale directly
    const updatedDraft = await saleService.updateSale(owner, draftSale.id, {
      items: [
        { itemId: itemA.id, quantity: 2, rate: 100 }
      ]
    });

    assert.strictEqual(Number(updatedDraft.totalAmount), 200);

    // Convert draft sale to confirmed
    const confirmedSale = await prisma.sale.create({
      data: {
        saleNumber: "SALE-002",
        shopId: shop.id,
        customerId: customer.id,
        saleStatus: "CONFIRMED",
        paymentStatus: "UNPAID",
        totalAmount: 200,
        subtotal: 200,
        discountAmount: 0,
        paidAmount: 0,
        balanceAmount: 200,
        gstRequired: false,
        staffId: owner.id,
        items: {
          create: {
            itemId: itemA.id,
            quantity: 2,
            rate: 100,
            totalAmount: 200,
          }
        }
      }
    });

    // Directly updating confirmed sale should throw ApiError
    await assert.rejects(
      saleService.updateSale(owner, confirmedSale.id, {
        items: [{ itemId: itemA.id, quantity: 3, rate: 100 }]
      }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /Cannot directly edit a confirmed sale/);
        return true;
      }
    );
  });

  test("2. Confirmed sales can be amended, producing delta ledger entries and logging amendments", async () => {
    // Create confirmed sale
    const sale = await prisma.sale.create({
      data: {
        saleNumber: "SALE-003",
        shopId: shop.id,
        customerId: customer.id,
        saleStatus: "CONFIRMED",
        paymentStatus: "UNPAID",
        totalAmount: 300,
        subtotal: 300,
        discountAmount: 0,
        paidAmount: 0,
        balanceAmount: 300,
        gstRequired: false,
        staffId: owner.id,
        items: {
          createMany: {
            data: [
              { itemId: itemA.id, quantity: 1, rate: 100, totalAmount: 100 },
              { itemId: itemB.id, quantity: 1, rate: 200, totalAmount: 200 },
            ]
          }
        }
      }
    });

    // Track initial customer debt (re-fetch)
    const initCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    const initDebt = Number(initCustomer.outstandingAmount);

    // Perform amendment: quantity of Product A goes from 1 -> 3, Product B from 1 -> 0 (removed)
    const amended = await saleService.amendSale(owner, sale.id, {
      expectedVersion: 1,
      reason: "Adjusted units based on buyer request",
      items: [
        { itemId: itemA.id, quantity: 3, rate: 100 }
      ],
      discountAmount: 10
    });

    // Check totals
    // 3 * 100 = 300 - 10 discount = 290 total amount
    assert.strictEqual(Number(amended.totalAmount), 290);
    assert.strictEqual(amended.version, 2);

    // Check financial delta applied to customer debt
    const updatedCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    const expectedDebtChange = 290 - 300; // -10 change
    assert.strictEqual(Number(updatedCustomer.outstandingAmount), initDebt + expectedDebtChange);

    // Check stock ledger append-only deltas
    // Product A delta: 3 - 1 = +2 (SALE_AMENDMENT)
    const ledgerA = await prisma.stockLedger.findFirst({
      where: { itemId: itemA.id, referenceId: sale.id, movementType: "SALE_AMENDMENT" }
    });
    assert.ok(ledgerA);
    assert.strictEqual(Number(ledgerA.quantityOut), 2);

    // Product B delta: 0 - 1 = -1 (SALE_AMENDMENT_REVERSAL)
    const ledgerB = await prisma.stockLedger.findFirst({
      where: { itemId: itemB.id, referenceId: sale.id, movementType: "SALE_AMENDMENT_REVERSAL" }
    });
    assert.ok(ledgerB);
    assert.strictEqual(Number(ledgerB.quantityIn), 1);

    // Check amendment log creation
    const log = await prisma.saleAmendment.findFirst({ where: { saleId: sale.id } });
    assert.ok(log);
    assert.strictEqual(log.reason, "Adjusted units based on buyer request");
    assert.strictEqual(log.version, 2);
    assert.strictEqual(Number(log.newTotal), 290);
  });

  test("3. Optimistic concurrency check prevents simultaneous writes", async () => {
    const sale = await prisma.sale.create({
      data: {
        saleNumber: "SALE-004",
        shopId: shop.id,
        customerId: customer.id,
        saleStatus: "CONFIRMED",
        paymentStatus: "UNPAID",
        totalAmount: 100,
        subtotal: 100,
        discountAmount: 0,
        paidAmount: 0,
        balanceAmount: 100,
        gstRequired: false,
        staffId: owner.id,
        items: { create: { itemId: itemA.id, quantity: 1, rate: 100, totalAmount: 100 } }
      }
    });

    // Amend with stale version (expectedVersion should be 1, but we pass 999)
    await assert.rejects(
      saleService.amendSale(owner, sale.id, {
        expectedVersion: 999,
        reason: "Stale update check",
        items: [{ itemId: itemA.id, quantity: 2, rate: 100 }]
      }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.statusCode, 409);
        assert.match(err.message, /This sale was modified by another user/);
        return true;
      }
    );
  });

  test("4. Invoices can be issued and cancelled with immutable snapshots", async () => {
    const sale = await prisma.sale.create({
      data: {
        saleNumber: "SALE-005",
        shopId: shop.id,
        customerId: customer.id,
        saleStatus: "CONFIRMED",
        paymentStatus: "UNPAID",
        totalAmount: 100,
        subtotal: 100,
        discountAmount: 0,
        paidAmount: 0,
        balanceAmount: 100,
        gstRequired: true,
        staffId: owner.id,
        items: { create: { itemId: itemA.id, quantity: 1, rate: 100, totalAmount: 100 } }
      }
    });

    // Issue invoice
    const invoice = await saleService.issueInvoice(owner, sale.id, {
      invoiceNumber: "INV-2026-99"
    });

    assert.strictEqual(invoice.invoiceNumber, "INV-2026-99");
    assert.strictEqual(invoice.status, "ISSUED");
    assert.ok(invoice.saleSnapshot);
    assert.strictEqual(invoice.saleSnapshot.saleNumber, sale.saleNumber);

    // Verify sale properties updated
    const updatedSale = await prisma.sale.findUnique({ where: { id: sale.id } });
    assert.strictEqual(updatedSale.gstInvoiceStatus, "GENERATED");
    assert.strictEqual(updatedSale.gstInvoiceNumber, "INV-2026-99");

    // Cancel invoice
    await saleService.cancelInvoice(owner, sale.id);

    // Verify invoice cancelled and sale properties updated
    const cancelledInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    assert.strictEqual(cancelledInvoice.status, "CANCELLED");
    assert.ok(cancelledInvoice.cancelledAt);

    const postCancelSale = await prisma.sale.findUnique({ where: { id: sale.id } });
    assert.strictEqual(postCancelSale.gstInvoiceStatus, "PENDING");
    assert.strictEqual(postCancelSale.gstInvoiceNumber, null);
  });
});
