import prisma from "../lib/db.js";
import * as saleService from "../services/sale.service.js";

const CODES = ["TST1"];
const MOBILES = ["9998887701"];

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

async function run() {
  try {
    await cleanup();
    const owner = await prisma.user.create({
      data: { name: "Test Owner", mobile: MOBILES[0], passwordHash: "hash", role: "OWNER" }
    });
    const shop = await prisma.shop.create({
      data: { name: "Test Shop", code: CODES[0], ownerId: owner.id, city: "Nagpur" }
    });
    const customer = await prisma.customer.create({
      data: { name: "Test Customer", shopId: shop.id, outstandingAmount: 0, createdById: owner.id }
    });
    const itemA = await prisma.item.create({
      data: { name: "Product A", sku: "SKU-A", shopId: shop.id, defaultSellingPrice: 100, minimumAllowedPrice: 80, unit: "PCS" }
    });
    const itemB = await prisma.item.create({
      data: { name: "Product B", sku: "SKU-B", shopId: shop.id, defaultSellingPrice: 200, minimumAllowedPrice: 160, unit: "PCS" }
    });

    await prisma.stockBalance.createMany({
      data: [
        { shopId: shop.id, itemId: itemA.id, physicalStock: 100, availableStock: 100 },
        { shopId: shop.id, itemId: itemB.id, physicalStock: 100, availableStock: 100 },
      ]
    });

    console.log("Setup complete");

    // Try Subtest 1:
    try {
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
      const updatedDraft = await saleService.updateSale(owner, draftSale.id, {
        items: [
          { itemId: itemA.id, quantity: 2, rate: 100 }
        ],
        notes: "Updated draft notes"
      });
      console.log("Subtest 1 Success!");
    } catch (e) {
      console.error("Subtest 1 Failed:", e);
    }

    // Try Subtest 2:
    try {
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

      const amended = await saleService.amendSale(owner, sale.id, {
        expectedVersion: 1,
        reason: "Adjusted units based on buyer request",
        items: [
          { itemId: itemA.id, quantity: 3, rate: 100 }
        ],
        discountAmount: 10
      });
      console.log("Subtest 2 Success!");
    } catch (e) {
      console.error("Subtest 2 Failed:", e);
    }

    // Try Subtest 4:
    try {
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

      const invoice = await saleService.issueInvoice(owner, sale.id, {
        invoiceNumber: "INV-2026-99"
      });
      console.log("Subtest 4 Success!");
    } catch (e) {
      console.error("Subtest 4 Failed:", e);
    }

  } catch (err) {
    console.error("SETUP ERROR:", err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
