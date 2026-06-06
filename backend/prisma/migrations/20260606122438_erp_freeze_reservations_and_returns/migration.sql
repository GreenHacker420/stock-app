-- CreateEnum
CREATE TYPE "ReturnSourceType" AS ENUM ('SALE', 'DELIVERY_MEMO');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'DISPATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('ISSUED', 'PARTIALLY_APPLIED', 'FULLY_APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationReleaseReason" AS ENUM ('DISPATCH', 'CANCEL', 'SHORTAGE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RefundSourceType" AS ENUM ('CASH', 'BANK', 'CHEQUE', 'ADVANCE_REVERSAL');

-- CreateEnum
CREATE TYPE "LedgerMovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'RETURN', 'ADJUSTMENT', 'RESERVATION_RELEASE');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('PAYMENT_CREATED', 'PAYMENT_REVERSED', 'CREDIT_NOTE_CREATED', 'CREDIT_NOTE_APPLIED', 'ADVANCE_CREATED', 'ADVANCE_APPLIED', 'RESERVATION_CREATED', 'RESERVATION_RELEASED', 'RETURN_CREATED', 'RETURN_APPROVED', 'RETURN_COMPLETED');

-- AlterTable
ALTER TABLE "CreditOutstanding" ADD COLUMN     "creditNoteAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "isVoided" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "CustomerAdvance" ADD COLUMN     "isVoided" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "DeliveryMemoItem" ADD COLUMN     "returnedQty" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "isVoided" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "originalQty" DECIMAL(12,3) NOT NULL,
    "reservedQty" DECIMAL(12,3) NOT NULL,
    "packedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedReason" "ReservationReleaseReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "dmId" TEXT,
    "sourceType" "ReturnSourceType" NOT NULL,
    "subtotalAmount" DECIMAL(12,2) NOT NULL,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReturnItem" (
    "id" TEXT NOT NULL,
    "inventoryReturnId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "saleItemId" TEXT,
    "deliveryMemoItemId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "InventoryReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "dmId" TEXT,
    "inventoryReturnId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "appliedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advanceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "saleId" TEXT,
    "dmId" TEXT,
    "creditNoteId" TEXT,
    "paymentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "sourceType" "RefundSourceType" NOT NULL,
    "reason" TEXT,
    "approvedById" TEXT NOT NULL,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_orderItemId_key" ON "StockReservation"("orderItemId");

-- CreateIndex
CREATE INDEX "StockReservation_shopId_status_idx" ON "StockReservation"("shopId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_itemId_status_idx" ON "StockReservation"("itemId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_orderId_idx" ON "StockReservation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReturn_returnNumber_key" ON "InventoryReturn"("returnNumber");

-- CreateIndex
CREATE INDEX "InventoryReturn_shopId_status_idx" ON "InventoryReturn"("shopId", "status");

-- CreateIndex
CREATE INDEX "InventoryReturn_customerId_idx" ON "InventoryReturn"("customerId");

-- CreateIndex
CREATE INDEX "InventoryReturnItem_itemId_idx" ON "InventoryReturnItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_inventoryReturnId_key" ON "CreditNote"("inventoryReturnId");

-- CreateIndex
CREATE INDEX "CreditNote_shopId_idx" ON "CreditNote"("shopId");

-- CreateIndex
CREATE INDEX "CreditNote_customerId_idx" ON "CreditNote"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentId_key" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_shopId_idx" ON "Refund"("shopId");

-- CreateIndex
CREATE INDEX "Refund_creditNoteId_idx" ON "Refund"("creditNoteId");

-- CreateIndex
CREATE INDEX "Refund_customerId_idx" ON "Refund"("customerId");

-- CreateIndex
CREATE INDEX "Refund_saleId_idx" ON "Refund"("saleId");

-- CreateIndex
CREATE INDEX "Refund_dmId_idx" ON "Refund"("dmId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditOutstanding" ADD CONSTRAINT "CreditOutstanding_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_dmId_fkey" FOREIGN KEY ("dmId") REFERENCES "DeliveryMemo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturnItem" ADD CONSTRAINT "InventoryReturnItem_inventoryReturnId_fkey" FOREIGN KEY ("inventoryReturnId") REFERENCES "InventoryReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturnItem" ADD CONSTRAINT "InventoryReturnItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_dmId_fkey" FOREIGN KEY ("dmId") REFERENCES "DeliveryMemo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_inventoryReturnId_fkey" FOREIGN KEY ("inventoryReturnId") REFERENCES "InventoryReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_dmId_fkey" FOREIGN KEY ("dmId") REFERENCES "DeliveryMemo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 1. Database-level validation check constraints
ALTER TABLE "CreditOutstanding" ADD CONSTRAINT check_credit_outstanding_pending_math 
  CHECK ("pendingAmount" = "originalAmount" - "paidAmount" - "creditNoteAmount");

ALTER TABLE "CreditOutstanding" ADD CONSTRAINT check_credit_outstanding_non_negative 
  CHECK ("originalAmount" >= 0 AND "paidAmount" >= 0 AND "creditNoteAmount" >= 0 AND "pendingAmount" >= 0);

ALTER TABLE "CustomerAdvance" ADD CONSTRAINT check_customer_advance_pending_math 
  CHECK ("pendingAmount" = "originalAmount" - "paidAmount");

ALTER TABLE "CustomerAdvance" ADD CONSTRAINT check_customer_advance_non_negative 
  CHECK ("originalAmount" >= 0 AND "paidAmount" >= 0 AND "pendingAmount" >= 0);

ALTER TABLE "Payment" ADD CONSTRAINT check_payment_amount_non_negative 
  CHECK ("amount" >= 0);

ALTER TABLE "Refund" ADD CONSTRAINT check_refund_amount_non_negative 
  CHECK ("amount" >= 0);

ALTER TABLE "CreditNote" ADD CONSTRAINT check_credit_note_non_negative 
  CHECK ("amount" >= 0 AND "appliedAmount" >= 0 AND "refundAmount" >= 0 AND "advanceAmount" >= 0);

ALTER TABLE "CreditNote" ADD CONSTRAINT check_credit_note_allocations_sum 
  CHECK ("appliedAmount" + "refundAmount" + "advanceAmount" <= "amount");

ALTER TABLE "InventoryReturn" ADD CONSTRAINT check_return_amounts_non_negative 
  CHECK ("subtotalAmount" >= 0 AND "adjustmentAmount" >= 0 AND "netAmount" >= 0);

-- 2. Quantity & Bounds Constraints
ALTER TABLE "InventoryReturnItem" ADD CONSTRAINT check_return_item_qty 
  CHECK ("quantity" > 0 AND "rate" >= 0 AND "totalAmount" >= 0);

ALTER TABLE "DeliveryMemoItem" ADD CONSTRAINT check_dm_item_returned_qty 
  CHECK ("returnedQty" >= 0 AND "returnedQty" <= "quantity");

ALTER TABLE "StockReservation" ADD CONSTRAINT check_reservation_bounds 
  CHECK ("reservedQty" >= 0 AND "packedQty" >= 0 AND "packedQty" <= "reservedQty" AND "reservedQty" <= "originalQty");

-- 3. Lineage Origin Constraint (XOR check for item returned source)
ALTER TABLE "InventoryReturnItem" ADD CONSTRAINT check_return_item_origin 
  CHECK (
    ("saleItemId" IS NOT NULL AND "deliveryMemoItemId" IS NULL)
    OR
    ("saleItemId" IS NULL AND "deliveryMemoItemId" IS NOT NULL)
  );

-- 4. Partial Performance Indexes for Active Entities
CREATE INDEX idx_credit_outstanding_active 
ON "CreditOutstanding"("customerId") 
WHERE status != 'PAID' AND "isVoided" = false;

CREATE INDEX idx_stock_reservation_active 
ON "StockReservation"("itemId") 
WHERE status = 'ACTIVE';

