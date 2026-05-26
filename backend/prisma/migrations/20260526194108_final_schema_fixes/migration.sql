-- DropForeignKey
ALTER TABLE "Dispatch" DROP CONSTRAINT "Dispatch_orderId_fkey";

-- AlterTable
ALTER TABLE "Dispatch" ALTER COLUMN "orderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DailySummaryExport_dailySummaryId_idx" ON "DailySummaryExport"("dailySummaryId");

-- CreateIndex
CREATE INDEX "DeliveryMemo_shopId_expectedPaymentDate_idx" ON "DeliveryMemo"("shopId", "expectedPaymentDate");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "RateChangeRequest_orderItemId_idx" ON "RateChangeRequest"("orderItemId");

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
