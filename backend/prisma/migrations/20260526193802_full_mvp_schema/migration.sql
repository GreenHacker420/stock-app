/*
  Warnings:

  - You are about to drop the column `status` on the `Payment` table. All the data in the column will be lost.
  - Made the column `shopId` on table `Notification` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_shopId_fkey";

-- DropIndex
DROP INDEX "CreditOutstanding_dueDate_idx";

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "previousSessionId" TEXT;

-- AlterTable
ALTER TABLE "DailySummary" ALTER COLUMN "summaryDate" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "DailySummaryExport" ADD COLUMN     "errorMsg" TEXT,
ADD COLUMN     "status" "ExportStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "DeliveryMemo" ADD COLUMN     "paymentStatus" "BillPaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "shopId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "StockLedger" ADD COLUMN     "approvedById" TEXT;

-- CreateIndex
CREATE INDEX "CashSession_previousSessionId_idx" ON "CashSession"("previousSessionId");

-- CreateIndex
CREATE INDEX "CreditOutstanding_shopId_dueDate_idx" ON "CreditOutstanding"("shopId", "dueDate");

-- CreateIndex
CREATE INDEX "PackingTask_orderId_idx" ON "PackingTask"("orderId");

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_previousSessionId_fkey" FOREIGN KEY ("previousSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
