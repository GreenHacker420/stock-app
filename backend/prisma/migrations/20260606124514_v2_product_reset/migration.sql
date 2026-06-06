/*
  Warnings:

  - You are about to drop the column `outstandingAmount` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the `CreditOutstanding` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomerAdvance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PaymentAllocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "PaymentMode" ADD VALUE 'CREDIT_NOTE';

-- DropForeignKey
ALTER TABLE "CreditOutstanding" DROP CONSTRAINT "CreditOutstanding_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CreditOutstanding" DROP CONSTRAINT "CreditOutstanding_customerId_fkey";

-- DropForeignKey
ALTER TABLE "CreditOutstanding" DROP CONSTRAINT "CreditOutstanding_dmId_fkey";

-- DropForeignKey
ALTER TABLE "CreditOutstanding" DROP CONSTRAINT "CreditOutstanding_orderId_fkey";

-- DropForeignKey
ALTER TABLE "CreditOutstanding" DROP CONSTRAINT "CreditOutstanding_saleId_fkey";

-- DropForeignKey
ALTER TABLE "CreditOutstanding" DROP CONSTRAINT "CreditOutstanding_shopId_fkey";

-- DropForeignKey
ALTER TABLE "CreditOutstanding" DROP CONSTRAINT "CreditOutstanding_voidedById_fkey";

-- DropForeignKey
ALTER TABLE "CustomerAdvance" DROP CONSTRAINT "CustomerAdvance_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CustomerAdvance" DROP CONSTRAINT "CustomerAdvance_customerId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerAdvance" DROP CONSTRAINT "CustomerAdvance_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerAdvance" DROP CONSTRAINT "CustomerAdvance_shopId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerAdvance" DROP CONSTRAINT "CustomerAdvance_voidedById_fkey";

-- DropForeignKey
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_creditOutstandingId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_customerAdvanceId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_paymentId_fkey";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "outstandingAmount",
ADD COLUMN     "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "CreditOutstanding";

-- DropTable
DROP TABLE "CustomerAdvance";

-- DropTable
DROP TABLE "PaymentAllocation";

-- DropEnum
DROP TYPE "AllocationStatus";

-- DropEnum
DROP TYPE "AllocationType";

-- DropEnum
DROP TYPE "CreditSourceType";
