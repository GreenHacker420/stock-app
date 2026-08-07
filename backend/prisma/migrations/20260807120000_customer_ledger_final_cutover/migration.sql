-- Customer Ledger final cutover:
-- 1) Preflight unknown legacy values
-- 2) Neutralize ADVANCE_APPLIED (delete fake advance-application credits)
-- 3) Expand-contract sourceType/entryType to final enums
-- 4) Allocation immutability (drop pair unique, add reversal fields)
-- 5) PaymentAmendment table
-- 6) Single opening-balance partial unique index

--------------------------------------------------------------------------------
-- STEP A: Preflight
--------------------------------------------------------------------------------
DO $$
DECLARE
  unknown_source TEXT;
  unknown_entry TEXT;
BEGIN
  SELECT string_agg(DISTINCT "sourceType"::text, ', ')
  INTO unknown_source
  FROM "CustomerLedgerEntry"
  WHERE "sourceType"::text NOT IN (
    'OPENING_BALANCE', 'SALE', 'DELIVERY_MEMO', 'PAYMENT', 'RETURN',
    'SALE_AMENDMENT', 'PAYMENT_AMENDMENT', 'MANUAL_ADJUSTMENT',
    'CHEQUE', 'REVERSAL', 'LEGACY_RECONCILIATION', 'DM'
  );

  IF unknown_source IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown CustomerLedgerEntry.sourceType values: %', unknown_source;
  END IF;

  SELECT string_agg(DISTINCT "entryType"::text, ', ')
  INTO unknown_entry
  FROM "CustomerLedgerEntry"
  WHERE "entryType"::text NOT IN (
    'OPENING_RECEIVABLE', 'OPENING_ADVANCE', 'SALE_POSTED', 'DELIVERY_MEMO_POSTED',
    'PAYMENT_RECEIVED', 'PAYMENT_VALUE_INCREASE', 'PAYMENT_VALUE_DECREASE',
    'RETURN_CREDIT', 'SALE_VALUE_INCREASE', 'SALE_VALUE_DECREASE',
    'CHEQUE_BOUNCED', 'ADJUSTMENT_DEBIT', 'ADJUSTMENT_CREDIT',
    'REVERSAL', 'LEGACY_RECONCILIATION', 'ADVANCE_APPLIED',
    'DM_POSTED', 'DM_CANCELLED', 'DELIVERY_MEMO_RETURN'
  );

  IF unknown_entry IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown CustomerLedgerEntry.entryType values: %', unknown_entry;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- Neutralize ADVANCE_APPLIED:
-- These were synthetic credits that double-counted advance application.
-- Removing them restores ledger net = SUM(DEBIT) - SUM(CREDIT) under the
-- authoritative model (advance is just a net credit position).
--------------------------------------------------------------------------------
DELETE FROM "CustomerLedgerAllocation"
WHERE "debitEntryId" IN (SELECT id FROM "CustomerLedgerEntry" WHERE "entryType"::text = 'ADVANCE_APPLIED')
   OR "creditEntryId" IN (SELECT id FROM "CustomerLedgerEntry" WHERE "entryType"::text = 'ADVANCE_APPLIED');

DELETE FROM "CustomerLedgerAttachment"
WHERE "ledgerEntryId" IN (SELECT id FROM "CustomerLedgerEntry" WHERE "entryType"::text = 'ADVANCE_APPLIED');

DELETE FROM "CustomerLedgerEntry"
WHERE "entryType"::text = 'ADVANCE_APPLIED';

--------------------------------------------------------------------------------
-- Ensure target enum values exist on temporary new types
--------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "CustomerLedgerSourceType_new" AS ENUM (
    'OPENING_BALANCE',
    'SALE',
    'DELIVERY_MEMO',
    'PAYMENT',
    'RETURN',
    'SALE_AMENDMENT',
    'PAYMENT_AMENDMENT',
    'MANUAL_ADJUSTMENT',
    'CHEQUE',
    'REVERSAL',
    'LEGACY_RECONCILIATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerLedgerEntryType_new" AS ENUM (
    'OPENING_RECEIVABLE',
    'OPENING_ADVANCE',
    'SALE_POSTED',
    'DELIVERY_MEMO_POSTED',
    'PAYMENT_RECEIVED',
    'PAYMENT_VALUE_INCREASE',
    'PAYMENT_VALUE_DECREASE',
    'RETURN_CREDIT',
    'SALE_VALUE_INCREASE',
    'SALE_VALUE_DECREASE',
    'CHEQUE_BOUNCED',
    'ADJUSTMENT_DEBIT',
    'ADJUSTMENT_CREDIT',
    'REVERSAL',
    'LEGACY_RECONCILIATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

--------------------------------------------------------------------------------
-- STEP B: Expanded columns
--------------------------------------------------------------------------------
ALTER TABLE "CustomerLedgerEntry"
  ADD COLUMN IF NOT EXISTS "sourceType_new" "CustomerLedgerSourceType_new",
  ADD COLUMN IF NOT EXISTS "entryType_new" "CustomerLedgerEntryType_new";

UPDATE "CustomerLedgerEntry"
SET "sourceType_new" = CASE "sourceType"::text
  WHEN 'DM' THEN 'DELIVERY_MEMO'::"CustomerLedgerSourceType_new"
  WHEN 'DELIVERY_MEMO' THEN 'DELIVERY_MEMO'::"CustomerLedgerSourceType_new"
  WHEN 'OPENING_BALANCE' THEN 'OPENING_BALANCE'::"CustomerLedgerSourceType_new"
  WHEN 'SALE' THEN 'SALE'::"CustomerLedgerSourceType_new"
  WHEN 'PAYMENT' THEN 'PAYMENT'::"CustomerLedgerSourceType_new"
  WHEN 'RETURN' THEN 'RETURN'::"CustomerLedgerSourceType_new"
  WHEN 'SALE_AMENDMENT' THEN 'SALE_AMENDMENT'::"CustomerLedgerSourceType_new"
  WHEN 'PAYMENT_AMENDMENT' THEN 'PAYMENT_AMENDMENT'::"CustomerLedgerSourceType_new"
  WHEN 'MANUAL_ADJUSTMENT' THEN 'MANUAL_ADJUSTMENT'::"CustomerLedgerSourceType_new"
  WHEN 'CHEQUE' THEN 'CHEQUE'::"CustomerLedgerSourceType_new"
  WHEN 'REVERSAL' THEN 'REVERSAL'::"CustomerLedgerSourceType_new"
  WHEN 'LEGACY_RECONCILIATION' THEN 'LEGACY_RECONCILIATION'::"CustomerLedgerSourceType_new"
  ELSE NULL
END;

UPDATE "CustomerLedgerEntry"
SET "entryType_new" = CASE "entryType"::text
  WHEN 'DM_POSTED' THEN 'DELIVERY_MEMO_POSTED'::"CustomerLedgerEntryType_new"
  WHEN 'DELIVERY_MEMO_POSTED' THEN 'DELIVERY_MEMO_POSTED'::"CustomerLedgerEntryType_new"
  WHEN 'DELIVERY_MEMO_RETURN' THEN 'RETURN_CREDIT'::"CustomerLedgerEntryType_new"
  WHEN 'DM_CANCELLED' THEN 'REVERSAL'::"CustomerLedgerEntryType_new"
  WHEN 'OPENING_RECEIVABLE' THEN 'OPENING_RECEIVABLE'::"CustomerLedgerEntryType_new"
  WHEN 'OPENING_ADVANCE' THEN 'OPENING_ADVANCE'::"CustomerLedgerEntryType_new"
  WHEN 'SALE_POSTED' THEN 'SALE_POSTED'::"CustomerLedgerEntryType_new"
  WHEN 'PAYMENT_RECEIVED' THEN 'PAYMENT_RECEIVED'::"CustomerLedgerEntryType_new"
  WHEN 'PAYMENT_VALUE_INCREASE' THEN 'PAYMENT_VALUE_INCREASE'::"CustomerLedgerEntryType_new"
  WHEN 'PAYMENT_VALUE_DECREASE' THEN 'PAYMENT_VALUE_DECREASE'::"CustomerLedgerEntryType_new"
  WHEN 'RETURN_CREDIT' THEN 'RETURN_CREDIT'::"CustomerLedgerEntryType_new"
  WHEN 'SALE_VALUE_INCREASE' THEN 'SALE_VALUE_INCREASE'::"CustomerLedgerEntryType_new"
  WHEN 'SALE_VALUE_DECREASE' THEN 'SALE_VALUE_DECREASE'::"CustomerLedgerEntryType_new"
  WHEN 'CHEQUE_BOUNCED' THEN 'CHEQUE_BOUNCED'::"CustomerLedgerEntryType_new"
  WHEN 'ADJUSTMENT_DEBIT' THEN 'ADJUSTMENT_DEBIT'::"CustomerLedgerEntryType_new"
  WHEN 'ADJUSTMENT_CREDIT' THEN 'ADJUSTMENT_CREDIT'::"CustomerLedgerEntryType_new"
  WHEN 'REVERSAL' THEN 'REVERSAL'::"CustomerLedgerEntryType_new"
  WHEN 'LEGACY_RECONCILIATION' THEN 'LEGACY_RECONCILIATION'::"CustomerLedgerEntryType_new"
  ELSE NULL
END;

-- For DM_CANCELLED rows that become REVERSAL, ensure sourceType becomes REVERSAL
UPDATE "CustomerLedgerEntry"
SET "sourceType_new" = 'REVERSAL'::"CustomerLedgerSourceType_new"
WHERE "entryType"::text = 'DM_CANCELLED';

--------------------------------------------------------------------------------
-- STEP C: Verify conversion
--------------------------------------------------------------------------------
DO $$
DECLARE
  unmapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped_count
  FROM "CustomerLedgerEntry"
  WHERE "sourceType_new" IS NULL OR "entryType_new" IS NULL;

  IF unmapped_count > 0 THEN
    RAISE EXCEPTION 'Unmapped CustomerLedgerEntry rows after conversion: %', unmapped_count;
  END IF;
END $$;

--------------------------------------------------------------------------------
-- STEP D: Contract
--------------------------------------------------------------------------------
DROP INDEX IF EXISTS "CustomerLedgerEntry_shopId_sourceType_sourceId_entryType_key";
DROP INDEX IF EXISTS "CustomerLedgerEntry_shopId_sourceType_sourceId_idx";
DROP INDEX IF EXISTS "CustomerLedgerEntry_customerId_direction_effectiveAt_idx";

ALTER TABLE "CustomerLedgerEntry" DROP COLUMN "sourceType";
ALTER TABLE "CustomerLedgerEntry" DROP COLUMN "entryType";
ALTER TABLE "CustomerLedgerEntry" RENAME COLUMN "sourceType_new" TO "sourceType";
ALTER TABLE "CustomerLedgerEntry" RENAME COLUMN "entryType_new" TO "entryType";

ALTER TABLE "CustomerLedgerEntry" ALTER COLUMN "sourceType" SET NOT NULL;
ALTER TABLE "CustomerLedgerEntry" ALTER COLUMN "entryType" SET NOT NULL;

DROP TYPE IF EXISTS "CustomerLedgerSourceType";
DROP TYPE IF EXISTS "CustomerLedgerEntryType";
ALTER TYPE "CustomerLedgerSourceType_new" RENAME TO "CustomerLedgerSourceType";
ALTER TYPE "CustomerLedgerEntryType_new" RENAME TO "CustomerLedgerEntryType";

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLedgerEntry_shopId_sourceType_sourceId_entryType_key"
  ON "CustomerLedgerEntry"("shopId", "sourceType", "sourceId", "entryType");
CREATE INDEX IF NOT EXISTS "CustomerLedgerEntry_shopId_sourceType_sourceId_idx"
  ON "CustomerLedgerEntry"("shopId", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "CustomerLedgerEntry_customerId_direction_effectiveAt_idx"
  ON "CustomerLedgerEntry"("customerId", "direction", "effectiveAt");

-- One opening balance per customer (DB-enforced)
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLedgerEntry_one_opening_balance_per_customer"
  ON "CustomerLedgerEntry"("shopId", "customerId")
  WHERE "sourceType" = 'OPENING_BALANCE';

--------------------------------------------------------------------------------
-- Allocation immutability
--------------------------------------------------------------------------------
DROP INDEX IF EXISTS "CustomerLedgerAllocation_debitEntryId_creditEntryId_key";
DROP INDEX IF EXISTS "CustomerLedgerAllocation_shopId_clientMutationId_key";

ALTER TABLE "CustomerLedgerAllocation"
  ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT,
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLedgerAllocation_reversalOfId_key'
  ) THEN
    ALTER TABLE "CustomerLedgerAllocation"
      ADD CONSTRAINT "CustomerLedgerAllocation_reversalOfId_key" UNIQUE ("reversalOfId");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLedgerAllocation_reversalOfId_fkey'
  ) THEN
    ALTER TABLE "CustomerLedgerAllocation"
      ADD CONSTRAINT "CustomerLedgerAllocation_reversalOfId_fkey"
      FOREIGN KEY ("reversalOfId") REFERENCES "CustomerLedgerAllocation"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CustomerLedgerAllocation_debitEntryId_creditEntryId_idx"
  ON "CustomerLedgerAllocation"("debitEntryId", "creditEntryId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLedgerAllocation_shopId_clientMutationId_active_key"
  ON "CustomerLedgerAllocation"("shopId", "clientMutationId")
  WHERE "clientMutationId" IS NOT NULL AND "reversedAt" IS NULL;

--------------------------------------------------------------------------------
-- PaymentAmendment
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PaymentAmendment" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "previousAmount" DECIMAL(12,2) NOT NULL,
  "newAmount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentAmendment_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAmendment_paymentId_fkey'
  ) THEN
    ALTER TABLE "PaymentAmendment"
      ADD CONSTRAINT "PaymentAmendment_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAmendment_shopId_fkey'
  ) THEN
    ALTER TABLE "PaymentAmendment"
      ADD CONSTRAINT "PaymentAmendment_shopId_fkey"
      FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAmendment_createdById_fkey'
  ) THEN
    ALTER TABLE "PaymentAmendment"
      ADD CONSTRAINT "PaymentAmendment_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PaymentAmendment_paymentId_createdAt_idx"
  ON "PaymentAmendment"("paymentId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentAmendment_shopId_createdAt_idx"
  ON "PaymentAmendment"("shopId", "createdAt");

--------------------------------------------------------------------------------
-- Recalculate customer cached balances from authoritative ledger
--------------------------------------------------------------------------------
UPDATE "Customer" c
SET
  "outstandingAmount" = GREATEST(COALESCE(agg.net, 0), 0),
  "advanceBalance" = GREATEST(-COALESCE(agg.net, 0), 0),
  "ledgerVersion" = COALESCE(c."ledgerVersion", 0) + 1
FROM (
  SELECT
    e."customerId",
    SUM(CASE WHEN e.direction = 'DEBIT' THEN e.amount ELSE -e.amount END) AS net
  FROM "CustomerLedgerEntry" e
  GROUP BY e."customerId"
) agg
WHERE c.id = agg."customerId";
