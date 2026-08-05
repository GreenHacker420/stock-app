-- CreateEnum
CREATE TYPE "CustomerLedgerSourceType" AS ENUM ('OPENING_BALANCE', 'SALE', 'DELIVERY_MEMO', 'PAYMENT', 'RETURN', 'SALE_AMENDMENT', 'MANUAL_ADJUSTMENT', 'REVERSAL', 'LEGACY_RECONCILIATION');

-- CreateEnum
CREATE TYPE "CustomerLedgerEntryType" AS ENUM ('OPENING_RECEIVABLE', 'OPENING_ADVANCE', 'SALE_POSTED', 'DELIVERY_MEMO_POSTED', 'PAYMENT_RECEIVED', 'RETURN_CREDIT', 'SALE_VALUE_INCREASE', 'SALE_VALUE_DECREASE', 'ADJUSTMENT_DEBIT', 'ADJUSTMENT_CREDIT', 'REVERSAL', 'LEGACY_RECONCILIATION', 'ADVANCE_APPLIED');

-- CreateEnum
CREATE TYPE "LedgerAttachmentPurpose" AS ENUM ('OPENING_BALANCE_BILL', 'PAYMENT_PROOF', 'ADJUSTMENT_PROOF', 'RETURN_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemAssetPurpose" AS ENUM ('PRIMARY_IMAGE', 'GALLERY_IMAGE', 'MANUAL', 'WARRANTY_DOCUMENT');

-- CreateEnum
CREATE TYPE "AssetDomain" AS ENUM ('PRODUCT', 'CUSTOMER_LEDGER', 'PAYMENT', 'EXPENSE', 'DISPATCH', 'WHATSAPP', 'SALE_INVOICE', 'DAILY_SUMMARY', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetDeletionStatus" AS ENUM ('NONE', 'REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SaleReceivableOrigin" AS ENUM ('DIRECT_SALE', 'DELIVERY_MEMO');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'CUSTOMER_LEDGER_ENTRY';
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'CUSTOMER_LEDGER_ALLOCATION';
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'ASSET';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'POSTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REVERSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'UPLOAD_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DELETE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STORAGE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECONCILED';

-- AlterTable Customer
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "ledgerVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Sale
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "receivableOrigin" "SaleReceivableOrigin" NOT NULL DEFAULT 'DIRECT_SALE';

-- AlterTable Asset
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "domain" "AssetDomain" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "deletionStatus" "AssetDeletionStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "deleteRequestedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "deleteRequestedById" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "storageDeletedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "storageDeleteError" TEXT;

CREATE INDEX IF NOT EXISTS "Asset_shopId_domain_status_createdAt_idx" ON "Asset"("shopId", "domain", "status", "createdAt");

-- AlterTable CustomerLedgerEntry (Convert string columns safely to Enums)
ALTER TABLE "CustomerLedgerEntry" ADD COLUMN IF NOT EXISTS "clientMutationId" TEXT;
ALTER TABLE "CustomerLedgerEntry" ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "CustomerLedgerEntry" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "CustomerLedgerEntry" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Map legacy sourceType strings if present
UPDATE "CustomerLedgerEntry" SET "sourceType" = 'OPENING_BALANCE' WHERE "sourceType" = 'OPENING_BALANCE';
UPDATE "CustomerLedgerEntry" SET "sourceType" = 'SALE' WHERE "sourceType" = 'SALE';
UPDATE "CustomerLedgerEntry" SET "sourceType" = 'DELIVERY_MEMO' WHERE "sourceType" = 'DELIVERY_MEMO' OR "sourceType" = 'DM';
UPDATE "CustomerLedgerEntry" SET "sourceType" = 'PAYMENT' WHERE "sourceType" = 'PAYMENT';
UPDATE "CustomerLedgerEntry" SET "sourceType" = 'RETURN' WHERE "sourceType" = 'RETURN';
UPDATE "CustomerLedgerEntry" SET "sourceType" = 'SALE_AMENDMENT' WHERE "sourceType" = 'SALE_AMENDMENT';
UPDATE "CustomerLedgerEntry" SET "sourceType" = 'MANUAL_ADJUSTMENT' WHERE "sourceType" = 'MANUAL_ADJUSTMENT';
UPDATE "CustomerLedgerEntry" SET "sourceType" = 'REVERSAL' WHERE "sourceType" = 'REVERSAL';
UPDATE "CustomerLedgerEntry" SET "sourceType" = 'LEGACY_RECONCILIATION' WHERE "sourceType" = 'LEGACY_RECONCILIATION';

-- Map legacy entryType strings if present
UPDATE "CustomerLedgerEntry" SET "entryType" = 'OPENING_RECEIVABLE' WHERE "entryType" = 'OPENING_RECEIVABLE';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'OPENING_ADVANCE' WHERE "entryType" = 'OPENING_ADVANCE';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'SALE_POSTED' WHERE "entryType" = 'SALE_POSTED';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'DELIVERY_MEMO_POSTED' WHERE "entryType" = 'DELIVERY_MEMO_POSTED' OR "entryType" = 'DM_POSTED';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'PAYMENT_RECEIVED' WHERE "entryType" = 'PAYMENT_RECEIVED';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'RETURN_CREDIT' WHERE "entryType" = 'RETURN_CREDIT';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'SALE_VALUE_INCREASE' WHERE "entryType" = 'SALE_VALUE_INCREASE';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'SALE_VALUE_DECREASE' WHERE "entryType" = 'SALE_VALUE_DECREASE';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'ADJUSTMENT_DEBIT' WHERE "entryType" = 'ADJUSTMENT_DEBIT';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'ADJUSTMENT_CREDIT' WHERE "entryType" = 'ADJUSTMENT_CREDIT';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'REVERSAL' WHERE "entryType" = 'REVERSAL';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'LEGACY_RECONCILIATION' WHERE "entryType" = 'LEGACY_RECONCILIATION';
UPDATE "CustomerLedgerEntry" SET "entryType" = 'ADVANCE_APPLIED' WHERE "entryType" = 'ADVANCE_APPLIED';

-- Alter columns to Enum types
ALTER TABLE "CustomerLedgerEntry" ALTER COLUMN "sourceType" TYPE "CustomerLedgerSourceType" USING ("sourceType"::"CustomerLedgerSourceType");
ALTER TABLE "CustomerLedgerEntry" ALTER COLUMN "entryType" TYPE "CustomerLedgerEntryType" USING ("entryType"::"CustomerLedgerEntryType");

-- Drop old index on reversalOfId if exists
DROP INDEX IF EXISTS "CustomerLedgerEntry_reversalOfId_idx";
DROP INDEX IF EXISTS "CustomerLedgerEntry_sourceType_sourceId_entryType_key";

-- Add unique constraints & indexes
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLedgerEntry_reversalOfId_key" ON "CustomerLedgerEntry"("reversalOfId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLedgerEntry_shopId_idempotencyKey_key" ON "CustomerLedgerEntry"("shopId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLedgerEntry_shopId_clientMutationId_key" ON "CustomerLedgerEntry"("shopId", "clientMutationId") WHERE "clientMutationId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLedgerEntry_shopId_sourceType_sourceId_entryType_key" ON "CustomerLedgerEntry"("shopId", "sourceType", "sourceId", "entryType");

CREATE INDEX IF NOT EXISTS "CustomerLedgerEntry_customerId_effectiveAt_id_idx" ON "CustomerLedgerEntry"("customerId", "effectiveAt", "id");
CREATE INDEX IF NOT EXISTS "CustomerLedgerEntry_shopId_sourceType_sourceId_idx" ON "CustomerLedgerEntry"("shopId", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "CustomerLedgerEntry_customerId_direction_effectiveAt_idx" ON "CustomerLedgerEntry"("customerId", "direction", "effectiveAt");

-- Add Check Constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLedgerEntry_amount_check'
  ) THEN
    ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_amount_check" CHECK ("amount" > 0);
  END IF;
END $$;

-- CreateTable CustomerLedgerAttachment
CREATE TABLE IF NOT EXISTS "CustomerLedgerAttachment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "purpose" "LedgerAttachmentPurpose" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLedgerAttachment_ledgerEntryId_assetId_key" ON "CustomerLedgerAttachment"("ledgerEntryId", "assetId");
CREATE INDEX IF NOT EXISTS "CustomerLedgerAttachment_assetId_idx" ON "CustomerLedgerAttachment"("assetId");
CREATE INDEX IF NOT EXISTS "CustomerLedgerAttachment_shopId_purpose_createdAt_idx" ON "CustomerLedgerAttachment"("shopId", "purpose", "createdAt");

ALTER TABLE "CustomerLedgerAttachment" ADD CONSTRAINT "CustomerLedgerAttachment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "CustomerLedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerAttachment" ADD CONSTRAINT "CustomerLedgerAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerAttachment" ADD CONSTRAINT "CustomerLedgerAttachment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable CustomerLedgerAllocation
CREATE TABLE IF NOT EXISTS "CustomerLedgerAllocation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "debitEntryId" TEXT NOT NULL,
    "creditEntryId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLedgerAllocation_debitEntryId_creditEntryId_key" ON "CustomerLedgerAllocation"("debitEntryId", "creditEntryId");
CREATE INDEX IF NOT EXISTS "CustomerLedgerAllocation_creditEntryId_idx" ON "CustomerLedgerAllocation"("creditEntryId");
CREATE INDEX IF NOT EXISTS "CustomerLedgerAllocation_shopId_customerId_createdAt_idx" ON "CustomerLedgerAllocation"("shopId", "customerId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLedgerAllocation_amount_check') THEN
    ALTER TABLE "CustomerLedgerAllocation" ADD CONSTRAINT "CustomerLedgerAllocation_amount_check" CHECK ("amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLedgerAllocation_entry_check') THEN
    ALTER TABLE "CustomerLedgerAllocation" ADD CONSTRAINT "CustomerLedgerAllocation_entry_check" CHECK ("debitEntryId" <> "creditEntryId");
  END IF;
END $$;

ALTER TABLE "CustomerLedgerAllocation" ADD CONSTRAINT "CustomerLedgerAllocation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerAllocation" ADD CONSTRAINT "CustomerLedgerAllocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerAllocation" ADD CONSTRAINT "CustomerLedgerAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerAllocation" ADD CONSTRAINT "CustomerLedgerAllocation_debitEntryId_fkey" FOREIGN KEY ("debitEntryId") REFERENCES "CustomerLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerAllocation" ADD CONSTRAINT "CustomerLedgerAllocation_creditEntryId_fkey" FOREIGN KEY ("creditEntryId") REFERENCES "CustomerLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable ItemAsset
CREATE TABLE IF NOT EXISTS "ItemAsset" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "purpose" "ItemAssetPurpose" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ItemAsset_itemId_assetId_purpose_key" ON "ItemAsset"("itemId", "assetId", "purpose");
CREATE INDEX IF NOT EXISTS "ItemAsset_assetId_idx" ON "ItemAsset"("assetId");

ALTER TABLE "ItemAsset" ADD CONSTRAINT "ItemAsset_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemAsset" ADD CONSTRAINT "ItemAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemAsset" ADD CONSTRAINT "ItemAsset_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable AssetDeletionOutbox
CREATE TABLE IF NOT EXISTS "AssetDeletionOutbox" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "storageBucket" TEXT,
    "storageKey" TEXT,
    "status" "AssetDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AssetDeletionOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AssetDeletionOutbox_shopId_status_createdAt_idx" ON "AssetDeletionOutbox"("shopId", "status", "createdAt");

ALTER TABLE "AssetDeletionOutbox" ADD CONSTRAINT "AssetDeletionOutbox_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
