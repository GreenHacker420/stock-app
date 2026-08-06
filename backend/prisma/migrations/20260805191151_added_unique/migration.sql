/*
  Warnings:

  - A unique constraint covering the columns `[shopId,clientMutationId]` on the table `CustomerLedgerAllocation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ReturnItemReason" AS ENUM ('DEFECTIVE', 'DAMAGED', 'WRONG_ITEM', 'EXCESS', 'CUSTOMER_CANCELLED', 'OTHER');

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('CUSTOMER_CANCELLED', 'MISTAKE', 'OUT_OF_STOCK', 'PRICE_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- DropForeignKey
ALTER TABLE "CustomerLedgerEntry" DROP CONSTRAINT "CustomerLedgerEntry_customerId_fkey";

-- DropIndex
DROP INDEX "CustomerLedgerEntry_shopId_customerId_effectiveAt_idx";

-- DropIndex
DROP INDEX "WaConversation_shopId_isArchived_isPinned_idx";

-- AlterTable
ALTER TABLE "CustomerLedgerAllocation" ADD COLUMN     "clientMutationId" TEXT;

-- AlterTable
ALTER TABLE "CustomerLedgerEntry" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliveryMemoSerialAssignment" ADD COLUMN     "saleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerAllocation_shopId_clientMutationId_key" ON "CustomerLedgerAllocation"("shopId", "clientMutationId");

-- AddForeignKey
ALTER TABLE "DeliveryMemoSerialAssignment" ADD CONSTRAINT "DeliveryMemoSerialAssignment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
