/*
  Warnings:

  - A unique constraint covering the columns `[shopId,clientMutationId]` on the table `CustomerLedgerAllocation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum (safely if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReturnItemReason') THEN
    CREATE TYPE "ReturnItemReason" AS ENUM ('DEFECTIVE', 'DAMAGED', 'WRONG_ITEM', 'EXCESS', 'CUSTOMER_CANCELLED', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CancelReason') THEN
    CREATE TYPE "CancelReason" AS ENUM ('CUSTOMER_CANCELLED', 'MISTAKE', 'OUT_OF_STOCK', 'PRICE_ISSUE', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DiscountType') THEN
    CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
  END IF;
END $$;

-- DropForeignKey safely
ALTER TABLE "CustomerLedgerEntry" DROP CONSTRAINT IF EXISTS "CustomerLedgerEntry_customerId_fkey";

-- DropIndex safely
DROP INDEX IF EXISTS "CustomerLedgerEntry_shopId_customerId_effectiveAt_idx";

-- DropIndex safely
DROP INDEX IF EXISTS "WaConversation_shopId_isArchived_isPinned_idx";

-- AlterTable CustomerLedgerAllocation (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'CustomerLedgerAllocation') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CustomerLedgerAllocation' AND column_name = 'clientMutationId') THEN
      ALTER TABLE "CustomerLedgerAllocation" ADD COLUMN "clientMutationId" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'CustomerLedgerAllocation_shopId_clientMutationId_key') THEN
      CREATE UNIQUE INDEX "CustomerLedgerAllocation_shopId_clientMutationId_key" ON "CustomerLedgerAllocation"("shopId", "clientMutationId");
    END IF;
  END IF;
END $$;

-- AlterTable CustomerLedgerEntry
ALTER TABLE "CustomerLedgerEntry" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable DeliveryMemoSerialAssignment safely
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'DeliveryMemoSerialAssignment') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'DeliveryMemoSerialAssignment' AND column_name = 'saleId') THEN
      ALTER TABLE "DeliveryMemoSerialAssignment" ADD COLUMN "saleId" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryMemoSerialAssignment_saleId_fkey') THEN
      ALTER TABLE "DeliveryMemoSerialAssignment" ADD CONSTRAINT "DeliveryMemoSerialAssignment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

-- AddForeignKey safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLedgerEntry_customerId_fkey') THEN
    ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
