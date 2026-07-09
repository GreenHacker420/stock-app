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
    console.log("Cleanup success");
    const owner = await prisma.user.create({
      data: { name: "Test Owner", mobile: MOBILES[0], passwordHash: "hash", role: "OWNER" }
    });
    console.log("Owner created:", owner.id);
    
    const shop = await prisma.shop.create({
      data: { name: "Test Shop", code: CODES[0], ownerId: owner.id, city: "Nagpur" }
    });
    console.log("Shop created:", shop.id);

    const customer = await prisma.customer.create({
      data: { name: "Test Customer", shopId: shop.id, outstandingAmount: 0, createdById: owner.id }
    });
    console.log("Customer created:", customer.id);

    const itemA = await prisma.item.create({
      data: { name: "Product A", sku: "SKU-A", shopId: shop.id, defaultSellingPrice: 100, minimumAllowedPrice: 80, unit: "PCS" }
    });
    console.log("Item A created:", itemA.id);

    const draftSale = await prisma.sale.create({
      data: {
        saleNumber: "SALE-001",
        shopId: shop.id,
        customerId: customer.id,
        saleStatus: "DRAFT",
        paymentStatus: "PENDING",
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
    console.log("Draft sale created:", draftSale.id);

    const updatedDraft = await saleService.updateSale(owner, draftSale.id, {
      items: [
        { itemId: itemA.id, quantity: 2, rate: 100 }
      ],
      notes: "Updated draft notes"
    });
    console.log("Updated draft success:", updatedDraft.totalAmount);

  } catch (err) {
    console.error("TEST RUN ERROR:", err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
