-- Allow WhatsApp broadcasts to target local device contacts without creating CRM customers.
CREATE TYPE "WaBroadcastRecipientSource" AS ENUM ('CUSTOMER', 'DEVICE_CONTACT', 'MANUAL');

ALTER TABLE "WaBroadcastRecipient"
  ADD COLUMN "source" "WaBroadcastRecipientSource" NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN "sourceContactId" TEXT,
  ALTER COLUMN "customerId" DROP NOT NULL;

DROP INDEX IF EXISTS "WaBroadcastRecipient_broadcastId_customerId_key";

CREATE UNIQUE INDEX "WaBroadcastRecipient_broadcastId_customerPhone_key"
  ON "WaBroadcastRecipient"("broadcastId", "customerPhone");

CREATE INDEX "WaBroadcastRecipient_broadcastId_customerId_idx"
  ON "WaBroadcastRecipient"("broadcastId", "customerId");

ALTER TABLE "WaBroadcastRecipient"
  DROP CONSTRAINT IF EXISTS "WaBroadcastRecipient_customerId_fkey";

ALTER TABLE "WaBroadcastRecipient"
  ADD CONSTRAINT "WaBroadcastRecipient_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
