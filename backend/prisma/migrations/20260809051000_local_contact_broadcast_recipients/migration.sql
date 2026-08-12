-- Allow WhatsApp broadcasts to target local device contacts without creating CRM customers.
CREATE TYPE "WaBroadcastRecipientSource" AS ENUM ('CUSTOMER', 'DEVICE_CONTACT', 'MANUAL');

ALTER TABLE "WaBroadcastRecipient"
  ADD COLUMN "source" "WaBroadcastRecipientSource" NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN "sourceContactId" TEXT,
  ALTER COLUMN "customerId" DROP NOT NULL;

DROP INDEX IF EXISTS "WaBroadcastRecipient_broadcastId_customerId_key";

-- Match the application's shared E.164 normalization. Existing ten-digit values
-- are interpreted with the same India default used by whatsapp.phone.js.
UPDATE "WaBroadcastRecipient"
SET "customerPhone" = CASE
  WHEN length(regexp_replace("customerPhone", '\D', '', 'g')) = 10
    THEN '+91' || regexp_replace("customerPhone", '\D', '', 'g')
  ELSE '+' || regexp_replace("customerPhone", '\D', '', 'g')
END;

-- Preserve historical message links before collapsing duplicate recipients.
WITH ranked AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "broadcastId", "customerPhone"
      ORDER BY "createdAt", "id"
    ) AS "keepId",
    row_number() OVER (
      PARTITION BY "broadcastId", "customerPhone"
      ORDER BY "createdAt", "id"
    ) AS "rowNumber"
  FROM "WaBroadcastRecipient"
)
UPDATE "WaMessage" AS message
SET "broadcastRecipientId" = ranked."keepId"
FROM ranked
WHERE ranked."rowNumber" > 1
  AND message."broadcastRecipientId" = ranked."id";

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "broadcastId", "customerPhone"
      ORDER BY "createdAt", "id"
    ) AS "rowNumber"
  FROM "WaBroadcastRecipient"
)
DELETE FROM "WaBroadcastRecipient" AS recipient
USING ranked
WHERE recipient."id" = ranked."id"
  AND ranked."rowNumber" > 1;

CREATE UNIQUE INDEX "WaBroadcastRecipient_broadcastId_customerPhone_key"
  ON "WaBroadcastRecipient"("broadcastId", "customerPhone");

CREATE INDEX "WaBroadcastRecipient_broadcastId_customerId_idx"
  ON "WaBroadcastRecipient"("broadcastId", "customerId");

-- The relation is now optional, so align the database constraint with Prisma's
-- SetNull/Cascade defaults without scanning the full table during ADD CONSTRAINT.
ALTER TABLE "WaBroadcastRecipient"
  DROP CONSTRAINT IF EXISTS "WaBroadcastRecipient_customerId_fkey";

ALTER TABLE "WaBroadcastRecipient"
  ADD CONSTRAINT "WaBroadcastRecipient_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "WaBroadcastRecipient"
  VALIDATE CONSTRAINT "WaBroadcastRecipient_customerId_fkey";
