import "dotenv/config";
import prisma from "../src/lib/db.js";
import { qty } from "../src/utils/money.js";

async function runBackfill() {
  console.log("Starting Stock Reservation Backfill...");

  await prisma.$transaction(async (tx) => {
    // Find all active orders
    const activeOrders = await tx.order.findMany({
      where: {
        status: {
          in: ["CONFIRMED", "SENT_TO_STAFF", "PACKING", "PARTIALLY_PACKED", "PACKED"]
        }
      },
      include: {
        items: true
      }
    });

    console.log(`Found ${activeOrders.length} active orders to backfill.`);

    for (const order of activeOrders) {
      console.log(`Backfilling reservations for Order: ${order.orderNumber} (ID: ${order.id})...`);
      for (const item of order.items) {
        // Check if reservation already exists
        const existing = await tx.stockReservation.findUnique({
          where: {
            orderItemId: item.id
          }
        });

        if (!existing) {
          const reservedQty = qty(item.quantityOrdered);
          const packedQty = qty(item.quantityPacked);
          
          await tx.stockReservation.create({
            data: {
              shopId: order.shopId,
              orderId: order.id,
              orderItemId: item.id,
              itemId: item.itemId,
              originalQty: reservedQty,
              reservedQty: reservedQty,
              packedQty: packedQty,
              status: "ACTIVE"
            }
          });
          console.log(`  Created ACTIVE reservation for Item ${item.itemId}: Reserved: ${reservedQty}, Packed: ${packedQty}`);
        } else {
          console.log(`  Reservation already exists for OrderItem: ${item.id}`);
        }
      }
    }
  });

  console.log("Stock Reservation Backfill completed successfully.");
}

runBackfill()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
