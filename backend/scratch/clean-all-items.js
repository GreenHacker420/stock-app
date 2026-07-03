import { PrismaClient } from "/app/src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const VS_OLD_ID = "cmpsbksaz000b1is0dpplxfo2"; // VS
const VS_NEW_ID = "cmr39zcjk000001pjxfdcq497"; // VS-BURDI

const targetShops = [VS_OLD_ID, VS_NEW_ID];

async function main() {
  console.log("Starting deletion of all items in VS and VS-BURDI...");

  for (const shopId of targetShops) {
    console.log(`\nCleaning items for shop: ${shopId}`);

    const deleteQueries = [
      `DELETE FROM "StockLedger" WHERE "shopId" = '${shopId}';`,
      `DELETE FROM "StockBalance" WHERE "shopId" = '${shopId}';`,
      `DELETE FROM "StockReservation" WHERE "shopId" = '${shopId}';`,
      `DELETE FROM "OrderItem" WHERE "itemId" IN (SELECT id FROM "Item" WHERE "shopId" = '${shopId}');`,
      `DELETE FROM "DeliveryMemoItem" WHERE "itemId" IN (SELECT id FROM "Item" WHERE "shopId" = '${shopId}');`,
      `DELETE FROM "SaleItem" WHERE "itemId" IN (SELECT id FROM "Item" WHERE "shopId" = '${shopId}');`,
      `DELETE FROM "ItemPriceHistory" WHERE "itemId" IN (SELECT id FROM "Item" WHERE "shopId" = '${shopId}');`,
      `DELETE FROM "Item" WHERE "shopId" = '${shopId}';`
    ];

    for (const sql of deleteQueries) {
      const count = await prisma.$executeRawUnsafe(sql);
      console.log(`Executed: ${sql.split('WHERE')[0].trim()}... Deleted count: ${count}`);
    }
  }

  console.log("\nDeletion completed successfully! All items deleted, categories kept intact.");
}

main()
  .catch((e) => { console.error("Script failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
