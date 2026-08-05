import prisma from "../lib/db.js";
import { insertReconciliationEntryWithoutBalanceMutation } from "../services/customer-ledger.service.js";

async function runReconciliation() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`[CustomerLedgerReconciliation] Starting reconciliation script (dryRun: ${isDryRun})...`);

  const customers = await prisma.customer.findMany({
    where: { type: { not: "WALK_IN" } },
    select: { id: true, shopId: true, name: true, outstandingAmount: true, advanceBalance: true, createdById: true },
  });

  console.log(`[CustomerLedgerReconciliation] Found ${customers.length} non-walkin customers to inspect.`);

  let reconciledCount = 0;
  let skippedCount = 0;
  let totalDeltaAmount = 0;

  for (const customer of customers) {
    const cachedNet = Number(customer.outstandingAmount || 0) - Number(customer.advanceBalance || 0);

    const ledgerSumResult = await prisma.customerLedgerEntry.aggregate({
      where: { customerId: customer.id, shopId: customer.shopId },
      _sum: { amount: true },
    });

    const debitsResult = await prisma.customerLedgerEntry.aggregate({
      where: { customerId: customer.id, shopId: customer.shopId, direction: "DEBIT" },
      _sum: { amount: true },
    });
    const creditsResult = await prisma.customerLedgerEntry.aggregate({
      where: { customerId: customer.id, shopId: customer.shopId, direction: "CREDIT" },
      _sum: { amount: true },
    });

    const ledgerNet = Number(debitsResult._sum.amount || 0) - Number(creditsResult._sum.amount || 0);
    const difference = cachedNet - ledgerNet;

    if (Math.abs(difference) < 0.01) {
      skippedCount++;
      continue;
    }

    console.log(
      `[Reconcile] Customer "${customer.name}" (${customer.id}): cachedNet=₹${cachedNet.toFixed(2)}, ledgerNet=₹${ledgerNet.toFixed(2)}, difference=₹${difference.toFixed(2)}`
    );

    if (isDryRun) {
      reconciledCount++;
      totalDeltaAmount += Math.abs(difference);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const direction = difference > 0 ? "DEBIT" : "CREDIT";
      const amount = Math.abs(difference);

      await insertReconciliationEntryWithoutBalanceMutation(tx, {
        shopId: customer.shopId,
        customerId: customer.id,
        direction,
        amount,
        createdById: customer.createdById,
        notes: `Legacy reconciliation entry to align ledger net (₹${ledgerNet.toFixed(2)}) with authoritative cached balance (₹${cachedNet.toFixed(2)})`,
      });
    });

    reconciledCount++;
    totalDeltaAmount += Math.abs(difference);
  }

  console.log(`\n======================================================`);
  console.log(`Reconciliation Complete!`);
  console.log(`Total Inspected: ${customers.length}`);
  console.log(`Reconciled: ${reconciledCount}`);
  console.log(`Already In Balance: ${skippedCount}`);
  console.log(`Total Adjustment Net: ₹${totalDeltaAmount.toFixed(2)}`);
  console.log(`======================================================\n`);

  await prisma.$disconnect();
}

runReconciliation().catch((err) => {
  console.error("[Reconciliation Error]", err);
  process.exit(1);
});
