-- AlterTable
ALTER TABLE "CreditOutstanding" ADD COLUMN "creditNoteAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Drop and recreate pendingAmount as Generated Stored Columns
ALTER TABLE "CreditOutstanding" DROP COLUMN "pendingAmount";
ALTER TABLE "CreditOutstanding" ADD COLUMN "pendingAmount" NUMERIC(12,2) GENERATED ALWAYS AS ("originalAmount" - "paidAmount" - "creditNoteAmount") STORED NOT NULL;

ALTER TABLE "CustomerAdvance" DROP COLUMN "pendingAmount";
ALTER TABLE "CustomerAdvance" ADD COLUMN "pendingAmount" NUMERIC(12,2) GENERATED ALWAYS AS ("originalAmount" - "paidAmount") STORED NOT NULL;
