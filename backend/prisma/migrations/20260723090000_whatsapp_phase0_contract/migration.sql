CREATE TYPE "WaOperationState" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'RETRY_SCHEDULED',
  'TERMINALLY_FAILED',
  'COMPLETED'
);

CREATE TYPE "WaProviderStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED'
);

CREATE TYPE "WaContentState" AS ENUM ('VISIBLE', 'DELETED');

ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'WHATSAPP_MESSAGE';

ALTER TABLE "WaConversation"
ADD COLUMN "entityVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "WaMessage"
ADD COLUMN "clientMessageId" TEXT,
ADD COLUMN "clientPayloadHash" TEXT,
ADD COLUMN "sourceDeviceId" TEXT,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "operationState" "WaOperationState" NOT NULL DEFAULT 'QUEUED',
ADD COLUMN "providerStatus" "WaProviderStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "contentState" "WaContentState" NOT NULL DEFAULT 'VISIBLE',
ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "providerStatusAt" TIMESTAMP(3),
ADD COLUMN "entityVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "WaMessage"
SET
  "operationState" = CASE
    WHEN "status" = 'QUEUED' THEN 'QUEUED'::"WaOperationState"
    WHEN "status" = 'FAILED' THEN 'TERMINALLY_FAILED'::"WaOperationState"
    ELSE 'COMPLETED'::"WaOperationState"
  END,
  "providerStatus" = CASE
    WHEN "status" = 'SENT' THEN 'SENT'::"WaProviderStatus"
    WHEN "status" = 'DELIVERED' THEN 'DELIVERED'::"WaProviderStatus"
    WHEN "status" = 'READ' THEN 'READ'::"WaProviderStatus"
    WHEN "status" = 'FAILED' THEN 'FAILED'::"WaProviderStatus"
    ELSE 'PENDING'::"WaProviderStatus"
  END,
  "contentState" = CASE
    WHEN "status" = 'DELETED' THEN 'DELETED'::"WaContentState"
    ELSE 'VISIBLE'::"WaContentState"
  END,
  "providerStatusAt" = COALESCE("readAt", "deliveredAt", "failedAt", "createdAt");

CREATE UNIQUE INDEX "WaMessage_conversationId_clientMessageId_key"
ON "WaMessage"("conversationId", "clientMessageId");

CREATE INDEX "WaMessage_clientMessageId_idx"
ON "WaMessage"("clientMessageId");

CREATE INDEX "WaMessage_operationState_lastRetryAt_idx"
ON "WaMessage"("operationState", "lastRetryAt");
