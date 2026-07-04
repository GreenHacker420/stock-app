-- CreateTable
CREATE TABLE "ShopEventSequence" (
    "shopId" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ShopEventSequence_pkey" PRIMARY KEY ("shopId")
);

-- AlterTable: add sequence as nullable first (safe on a non-empty table)
ALTER TABLE "DomainEventOutbox" ADD COLUMN "sequence" BIGINT;

-- Backfill: deterministic historical ordering per shop for any pre-existing rows.
-- This is seed data for the counter, not a correctness proof — going forward,
-- every new row gets its sequence from the transactionally-locked
-- ShopEventSequence counter (see allocateShopEventSequence in
-- domain-event.service.js), which is what actually guarantees commit order.
WITH ranked AS (
  SELECT "id", "shopId", ROW_NUMBER() OVER (PARTITION BY "shopId" ORDER BY "createdAt", "id") AS rn
  FROM "DomainEventOutbox"
)
UPDATE "DomainEventOutbox" d
SET "sequence" = ranked.rn
FROM ranked
WHERE d."id" = ranked."id";

-- Seed each shop's counter to its current backfilled maximum so newly
-- allocated sequences continue after existing history instead of restarting.
INSERT INTO "ShopEventSequence" ("shopId", "value")
SELECT "shopId", COALESCE(MAX("sequence"), 0)
FROM "DomainEventOutbox"
GROUP BY "shopId"
ON CONFLICT ("shopId") DO UPDATE SET "value" = EXCLUDED."value";

-- Now safe to enforce NOT NULL: every row has a sequence value.
ALTER TABLE "DomainEventOutbox" ALTER COLUMN "sequence" SET NOT NULL;

-- CreateIndex
CREATE INDEX "DomainEventOutbox_shopId_status_sequence_idx" ON "DomainEventOutbox"("shopId", "status", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEventOutbox_shopId_sequence_key" ON "DomainEventOutbox"("shopId", "sequence");
