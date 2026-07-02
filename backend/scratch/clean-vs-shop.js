import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

// Setup database connection adapter (same as db.js)
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const VS_OLD_ID = "cmpsbksaz000b1is0dpplxfo2"; // "vardaman sales" (VS)
const VS_NEW_ID = "cmr39zcjk000001pjxfdcq497"; // "Vardaman Sales" (VS-BURDI)

const TEST_SHOP_IDS = [
  "cmpn4hebu0000dms019mbw26j", // "test" (NGP-01)
  "cmq3j8nct0001w5s03y3s2ccj"  // "Test Shop" (TST)
];

async function main() {
  console.log("Starting database cleanup and variant generation...");

  try {
    // ==========================================
    // 1. DELETE TEST SHOPS COMPLETELY
    // ==========================================
    for (const testShopId of TEST_SHOP_IDS) {
      console.log(`\nDecongesting test shop: ${testShopId}`);
      
      const tablesWithShopId = [
        "AuditLog", "StockLedger", "StockBalance", "StockReservation", 
        "OrderItem", "OrderItem", "OrderEvent", "Order", 
        "DeliveryMemoItem", "DeliveryMemo", "SaleItem", "Sale", 
        "PaymentDetail", "Payment", "Customer", "ItemPriceHistory", 
        "Item", "ItemCategory", "Expense", "CashSession", 
        "ApprovalRequest", "DailySummary", "DailySummaryExport",
        "StaffShopAccess", "Asset"
      ];

      for (const table of tablesWithShopId) {
        try {
          const deleted = await prisma.$executeRawUnsafe(
            `DELETE FROM "${table}" WHERE "shopId" = $1;`, 
            testShopId
          );
          if (deleted > 0) {
            console.log(`Deleted ${deleted} records from ${table}`);
          }
        } catch (e) {
          // Some tables might not have shopId or might fail, that's fine
        }
      }

      const deletedShop = await prisma.shop.deleteMany({
        where: { id: testShopId }
      });
      console.log(`Deleted shop record: ${JSON.stringify(deletedShop)}`);
    }

    // ==========================================
    // 2. CLEAN UP OLD DATA IN VS SHOP (Keep items, clear quantities/sales/customers)
    // ==========================================
    console.log(`\nCleaning up transactional data for main shop VS (${VS_OLD_ID})...`);

    // Deleting transactional records in correct foreign key order
    const deleteQueries = [
      `DELETE FROM "PaymentDetail" WHERE "paymentId" IN (SELECT id FROM "Payment" WHERE "shopId" = '${VS_OLD_ID}');`,
      `DELETE FROM "Payment" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "SaleItem" WHERE "saleId" IN (SELECT id FROM "Sale" WHERE "shopId" = '${VS_OLD_ID}');`,
      `DELETE FROM "Sale" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "DeliveryMemoItem" WHERE "deliveryMemoId" IN (SELECT id FROM "DeliveryMemo" WHERE "shopId" = '${VS_OLD_ID}');`,
      `DELETE FROM "DeliveryMemo" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "StockReservation" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "shopId" = '${VS_OLD_ID}');`,
      `DELETE FROM "OrderEvent" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "shopId" = '${VS_OLD_ID}');`,
      `DELETE FROM "Order" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "Customer" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "StockLedger" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "StockBalance" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "Expense" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "CashSession" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "ApprovalRequest" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "DailySummary" WHERE "shopId" = '${VS_OLD_ID}';`,
      `DELETE FROM "DailySummaryExport" WHERE "shopId" = '${VS_OLD_ID}';`
    ];

    for (const sql of deleteQueries) {
      const count = await prisma.$executeRawUnsafe(sql);
      console.log(`Executed: ${sql.split('WHERE')[0].trim()}... Deleted count: ${count}`);
    }

    // ==========================================
    // 3. SPLIT COLOR/COLOUR PRODUCTS IN VS SHOP
    // ==========================================
    console.log(`\nSplitting color items in main shop VS (${VS_OLD_ID}) into variants...`);

    const items = await prisma.item.findMany({
      where: { shopId: VS_OLD_ID }
    });

    const isTriColor = (name) => {
      return /HP\s*(803|805|682|47|678)|CANON\s*(57S|CL-746|CL-99|41-COLOR|57-COLOUR|746S-COLOR|98\s*COLOR)/i.test(name);
    };

    const getColorsToSplit = (name) => {
      const upperName = name.toUpperCase();
      if (isTriColor(name)) return null;

      // HP GT52 ink bottles are only Cyan, Magenta, Yellow (Black is 53)
      if (upperName.includes("GT52")) {
        return ["C", "M", "Y"];
      }

      if (!upperName.includes("COLOR") && !upperName.includes("COLOUR")) return null;

      // Ensure it is actually an ink, toner, refill or cartridge product
      const isInkOrToner = /INK|TONER|REFILL|CARTRIDGE|CATRIDGE/i.test(name);
      if (!isInkOrToner) return null;

      if (upperName.includes("057") || upperName.includes("6 COLOUR") || upperName.includes("GI-73") || upperName.includes("CH-7")) {
        if (upperName.includes("GI-73") || upperName.includes("CH-7")) {
          return ["Bk", "C", "M", "Y", "GY", "R"];
        }
        return ["Bk", "C", "M", "Y", "LC", "LM"];
      }
      return ["Bk", "C", "M", "Y"];
    };

    let splitCount = 0;

    for (const item of items) {
      const colors = getColorsToSplit(item.name);
      if (!colors || colors.length === 0) continue;

      console.log(`Splitting "${item.name}" into colors: ${colors.join(", ")}`);

      for (const col of colors) {
        let variantName = item.name.replace(/COLOUR/i, col).replace(/COLOR/i, col);
        if (variantName === item.name) {
          variantName = `${item.name} ${col}`;
        }

        const variantSku = item.sku ? `${item.sku}-${col}` : null;

        // Check if color variant already exists in shop
        const exists = await prisma.item.findFirst({
          where: {
            shopId: VS_OLD_ID,
            name: variantName
          }
        });

        if (!exists) {
          await prisma.item.create({
            data: {
              shopId: VS_OLD_ID,
              name: variantName,
              sku: variantSku,
              categoryId: item.categoryId,
              unit: item.unit,
              defaultSellingPrice: item.defaultSellingPrice,
              minimumAllowedPrice: item.minimumAllowedPrice,
              purchasePrice: item.purchasePrice,
              mrp: item.mrp,
              minimumStock: item.minimumStock,
              imageUrl: item.imageUrl,
              status: item.status,
            }
          });
        }
      }

      // Delete the original general color item
      await prisma.item.delete({
        where: { id: item.id }
      });

      splitCount++;
    }

    console.log(`\nSuccessfully split ${splitCount} color items into detailed color variants.`);
    console.log("Cleanup and generation completed successfully!");

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
