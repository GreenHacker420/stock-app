/*
  Warnings:

  - Changed the type of `entityType` on the `ApprovalRequest` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `action` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `entityType` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `customerId` on table `DeliveryMemo` required. This step will fail if there are existing NULL values in that column.
  - Made the column `customerId` on table `Dispatch` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `priceType` on the `ItemPriceHistory` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `triggerEvent` on the `Notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `entityType` on the `Notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `eventType` on the `OrderEvent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `customerId` on table `Payment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `customerId` on table `Sale` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('SELLING', 'MINIMUM', 'MRP', 'PURCHASE');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('USER', 'SHOP', 'CUSTOMER', 'ITEM', 'STOCK_LEDGER', 'ORDER', 'SALE', 'DELIVERY_MEMO', 'PAYMENT', 'CASH_SESSION', 'APPROVAL_REQUEST', 'INVENTORY_RETURN', 'EXPENSE', 'STAFF_SHOP_ACCESS', 'STOCK_BALANCE', 'STOCK_RESERVATION');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('ORDER_ASSIGNED', 'APPROVAL_REQUESTED', 'APPROVAL_RESOLVED', 'CHEQUE_BOUNCED', 'LOW_STOCK', 'PAYMENT_MISMATCH');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_ASSIGNED', 'PACKING_STARTED', 'ITEM_PACKED', 'SHORTAGE_REPORTED', 'PAYMENT_ADDED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'MOVEMENT_CREATED', 'ENTRY_REQUESTED', 'OPENING_SET', 'WALKIN_CREATED', 'REVIEWED', 'CANCELLED', 'VOIDED', 'APPROVED', 'REJECTED', 'COMPLETED', 'SUBMITTED', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED', 'STAFF_ASSIGNED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('WALK_IN', 'REGULAR', 'BUSINESS');

-- DropForeignKey
ALTER TABLE "DeliveryMemo" DROP CONSTRAINT "DeliveryMemo_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Dispatch" DROP CONSTRAINT "Dispatch_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_dmId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_saleId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_customerId_fkey";

-- AlterTable
ALTER TABLE "ApprovalRequest" DROP COLUMN "entityType",
ADD COLUMN     "entityType" "EntityType" NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "action",
ADD COLUMN     "action" "AuditAction" NOT NULL,
DROP COLUMN "entityType",
ADD COLUMN     "entityType" "EntityType" NOT NULL;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "advanceBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "type" "CustomerType" NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "DeliveryMemo" ALTER COLUMN "customerId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Dispatch" ALTER COLUMN "customerId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ItemPriceHistory" DROP COLUMN "priceType",
ADD COLUMN     "priceType" "PriceType" NOT NULL;

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "triggerEvent",
ADD COLUMN     "triggerEvent" "NotificationEvent" NOT NULL,
DROP COLUMN "entityType",
ADD COLUMN     "entityType" "EntityType" NOT NULL;

-- AlterTable
ALTER TABLE "OrderEvent" DROP COLUMN "eventType",
ADD COLUMN     "eventType" "OrderEventType" NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "customerId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Sale" ALTER COLUMN "customerId" SET NOT NULL;

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "physicalStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reservedStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "availableStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_itemId_key" ON "StockBalance"("itemId");

-- CreateIndex
CREATE INDEX "StockBalance_shopId_idx" ON "StockBalance"("shopId");

-- CreateIndex
CREATE INDEX "StockBalance_shopId_availableStock_idx" ON "StockBalance"("shopId", "availableStock");

-- CreateIndex
CREATE INDEX "ApprovalRequest_entityType_entityId_idx" ON "ApprovalRequest"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Customer_shopId_phone_idx" ON "Customer"("shopId", "phone");

-- CreateIndex
CREATE INDEX "Customer_shopId_gstin_idx" ON "Customer"("shopId", "gstin");

-- CreateIndex
CREATE INDEX "Customer_shopId_email_idx" ON "Customer"("shopId", "email");

-- CreateIndex
CREATE INDEX "Item_shopId_status_idx" ON "Item"("shopId", "status");

-- CreateIndex
CREATE INDEX "Item_shopId_sku_idx" ON "Item"("shopId", "sku");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Order_shopId_status_createdAt_idx" ON "Order"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_shopId_createdAt_idx" ON "Payment"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "StockLedger_shopId_itemId_createdAt_idx" ON "StockLedger"("shopId", "itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryMemo" ADD CONSTRAINT "DeliveryMemo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_dmId_fkey" FOREIGN KEY ("dmId") REFERENCES "DeliveryMemo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
