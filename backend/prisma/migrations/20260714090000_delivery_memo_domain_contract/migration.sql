CREATE TYPE "DeliveryMemoPurpose" AS ENUM (
  'CREDIT_DELIVERY',
  'SUPPLY_PENDING_INVOICE',
  'GOODS_ON_APPROVAL',
  'JOB_WORK',
  'STOCK_TRANSFER',
  'WARRANTY_REPLACEMENT',
  'DEMO_OR_SAMPLE'
);

CREATE TYPE "DeliveryMemoLifecycleStatus" AS ENUM (
  'DRAFT',
  'READY_TO_DISPATCH',
  'DISPATCHED',
  'CANCELLATION_PENDING',
  'CANCELLED',
  'CLOSED'
);

CREATE TYPE "DeliveryMemoInvoicingStatus" AS ENUM (
  'NOT_INVOICED',
  'PARTIALLY_INVOICED',
  'FULLY_INVOICED'
);

CREATE TYPE "DeliveryMemoReturnStatus" AS ENUM (
  'NO_RETURN',
  'PARTIALLY_RETURNED',
  'FULLY_RETURNED'
);

CREATE TYPE "CustomerLedgerDirection" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "SerialAssignmentStatus" AS ENUM ('ACTIVE', 'RELEASED');
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_DISPATCHED' BEFORE 'DISPATCHED';

ALTER TABLE "DeliveryMemo"
  ADD COLUMN "documentPurpose" "DeliveryMemoPurpose" NOT NULL DEFAULT 'CREDIT_DELIVERY',
  ADD COLUMN "lifecycleStatus" "DeliveryMemoLifecycleStatus" NOT NULL DEFAULT 'DISPATCHED',
  ADD COLUMN "invoicingStatus" "DeliveryMemoInvoicingStatus" NOT NULL DEFAULT 'NOT_INVOICED',
  ADD COLUMN "returnStatus" "DeliveryMemoReturnStatus" NOT NULL DEFAULT 'NO_RETURN',
  ADD COLUMN "postedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryNotes" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "DeliveryMemo"
SET "postedAt" = "createdAt",
    "lifecycleStatus" = CASE
      WHEN "status" = 'CANCELLED' THEN 'CANCELLED'::"DeliveryMemoLifecycleStatus"
      ELSE 'DISPATCHED'::"DeliveryMemoLifecycleStatus"
    END,
    "invoicingStatus" = CASE
      WHEN "status" = 'CONVERTED_TO_SALE' THEN 'FULLY_INVOICED'::"DeliveryMemoInvoicingStatus"
      ELSE 'NOT_INVOICED'::"DeliveryMemoInvoicingStatus"
    END;

ALTER TABLE "DeliveryMemoItem" ADD COLUMN "orderItemId" TEXT;
CREATE INDEX "DeliveryMemoItem_orderItemId_idx" ON "DeliveryMemoItem"("orderItemId");
ALTER TABLE "DeliveryMemoItem" ADD CONSTRAINT "DeliveryMemoItem_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DeliveryMemoSerialAssignment" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "dmId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "status" "SerialAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "activeKey" TEXT,
  "assignedById" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "releaseReason" TEXT,
  CONSTRAINT "DeliveryMemoSerialAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeliveryMemoSerialAssignment_activeKey_key" ON "DeliveryMemoSerialAssignment"("activeKey");
CREATE INDEX "DeliveryMemoSerialAssignment_shopId_itemId_serialNumber_idx"
  ON "DeliveryMemoSerialAssignment"("shopId", "itemId", "serialNumber");
CREATE INDEX "DeliveryMemoSerialAssignment_dmId_status_idx"
  ON "DeliveryMemoSerialAssignment"("dmId", "status");

CREATE TABLE "CustomerLedgerEntry" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "direction" "CustomerLedgerDirection" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdById" TEXT NOT NULL,
  "reversalOfId" TEXT,
  "idempotencyKey" TEXT,
  "notes" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerLedgerEntry_sourceType_sourceId_entryType_key"
  ON "CustomerLedgerEntry"("sourceType", "sourceId", "entryType");
CREATE INDEX "CustomerLedgerEntry_shopId_customerId_effectiveAt_idx"
  ON "CustomerLedgerEntry"("shopId", "customerId", "effectiveAt");
CREATE INDEX "CustomerLedgerEntry_reversalOfId_idx" ON "CustomerLedgerEntry"("reversalOfId");

CREATE UNIQUE INDEX "Sale_dmId_key" ON "Sale"("dmId") WHERE "dmId" IS NOT NULL;
