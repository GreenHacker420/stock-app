import "dotenv/config";
import prisma from "../src/lib/db.js";
import { money } from "../src/utils/money.js";
import { ensureSystemUser } from "../src/services/transactionHelpers.js";

async function runMigration() {
  console.log("Starting Opening Balance Migration...");
  
  await prisma.$transaction(async (tx) => {
    // Ensure system user exists first
    await ensureSystemUser(tx);
    
    // Find all customers with outstandingAmount > 0
    const customers = await tx.customer.findMany({
      where: {
        outstandingAmount: {
          gt: 0
        }
      }
    });
    
    console.log(`Found ${customers.length} customers with outstanding balances.`);
    
    for (const customer of customers) {
      const outstandingVal = money(customer.outstandingAmount);
      
      if (outstandingVal.gt(0)) {
        console.log(`Migrating customer ${customer.name} (${customer.id}) with balance: ${outstandingVal.toString()}`);
        
        // Create CreditOutstanding record
        await tx.creditOutstanding.create({
          data: {
            shopId: customer.shopId,
            customerId: customer.id,
            originalAmount: outstandingVal,
            pendingAmount: outstandingVal,
            paidAmount: money(0),
            sourceType: "OPENING_BALANCE",
            status: "PENDING",
            createdById: "SYSTEM"
          }
        });
        
        // Reset the customer outstandingAmount column to 0
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            outstandingAmount: money(0)
          }
        });
      }
    }
  });
  
  console.log("Opening Balance Migration completed successfully.");
}

runMigration()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
