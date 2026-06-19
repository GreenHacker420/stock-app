-- CreateEnum
CREATE TYPE "WaWebhookProcessingStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'QUARANTINED'
);

-- AlterEnum
ALTER TYPE "WaMessageType" ADD VALUE 'ORDER';
ALTER TYPE "WaMessageType" ADD VALUE 'SYSTEM';

-- CreateTable
CREATE TABLE "WaWebhookEnvelope" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "wabaId" TEXT,
  "phoneNumberId" TEXT,
  "field" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  "processingStatus" "WaWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "WaWebhookEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaWebhookEnvelope_shopId_payloadHash_key"
ON "WaWebhookEnvelope"("shopId", "payloadHash");

-- CreateIndex
CREATE INDEX "WaWebhookEnvelope_shopId_processingStatus_receivedAt_idx"
ON "WaWebhookEnvelope"("shopId", "processingStatus", "receivedAt");

-- CreateIndex
CREATE INDEX "WaWebhookEnvelope_field_receivedAt_idx"
ON "WaWebhookEnvelope"("field", "receivedAt");
