/*
  Warnings:

  - A unique constraint covering the columns `[saleId]` on the table `CreditOutstanding` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[dmId]` on the table `CreditOutstanding` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `originalAmount` to the `CreditOutstanding` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sourceType` to the `CreditOutstanding` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CreditSourceType" AS ENUM ('SALE', 'DM', 'ORDER', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('PAYMENT', 'ADVANCE_APPLIED', 'REVERSAL');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- AlterTable
ALTER TABLE "CreditOutstanding" ADD COLUMN     "originalAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "referenceId" TEXT,
ADD COLUMN     "sourceType" "CreditSourceType" NOT NULL;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerSignature" TEXT;

-- CreateTable
CREATE TABLE "CustomerAdvance" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentId" TEXT,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "pendingAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "CreditStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "creditOutstandingId" TEXT,
    "customerAdvanceId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocationType" "AllocationType" NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAdvance_paymentId_key" ON "CustomerAdvance"("paymentId");

-- CreateIndex
CREATE INDEX "CustomerAdvance_shopId_status_idx" ON "CustomerAdvance"("shopId", "status");

-- CreateIndex
CREATE INDEX "CustomerAdvance_customerId_idx" ON "CustomerAdvance"("customerId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_creditOutstandingId_idx" ON "PaymentAllocation"("creditOutstandingId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_customerAdvanceId_idx" ON "PaymentAllocation"("customerAdvanceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditOutstanding_saleId_key" ON "CreditOutstanding"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditOutstanding_dmId_key" ON "CreditOutstanding"("dmId");

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_creditOutstandingId_fkey" FOREIGN KEY ("creditOutstandingId") REFERENCES "CreditOutstanding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_customerAdvanceId_fkey" FOREIGN KEY ("customerAdvanceId") REFERENCES "CustomerAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
