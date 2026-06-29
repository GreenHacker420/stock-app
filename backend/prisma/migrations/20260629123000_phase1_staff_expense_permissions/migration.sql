-- Phase 1: staff tenant scoping and expense verification state.

ALTER TABLE "User"
  ADD COLUMN "staffOwnerId" TEXT;

ALTER TABLE "User"
  ADD CONSTRAINT "User_staffOwnerId_fkey"
  FOREIGN KEY ("staffOwnerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_staffOwnerId_idx" ON "User"("staffOwnerId");

CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Expense"
  ADD COLUMN "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "verificationNote" TEXT,
  ADD COLUMN "verifiedById" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Expense_shopId_status_idx" ON "Expense"("shopId", "status");
