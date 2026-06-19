/*
  Warnings:

  - A unique constraint covering the columns `[shopId,flowId]` on the table `WaFlow` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[flowToken]` on the table `WaFlowExecution` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shopId,name,language]` on the table `WaTemplate` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `WaFlow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `WaFlowExecution` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `category` on the `WaTemplate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "WaBroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "WaBroadcastRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WaMessagingLimitTier" AS ENUM ('TIER_250', 'TIER_1K', 'TIER_10K', 'TIER_100K', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "WaQualityRating" AS ENUM ('GREEN', 'YELLOW', 'RED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WaTemplateCategory" AS ENUM ('UTILITY', 'MARKETING', 'AUTHENTICATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WaMessageType" ADD VALUE 'INTERACTIVE';
ALTER TYPE "WaMessageType" ADD VALUE 'LOCATION';
ALTER TYPE "WaMessageType" ADD VALUE 'CONTACT_CARD';
ALTER TYPE "WaMessageType" ADD VALUE 'REACTION';
ALTER TYPE "WaMessageType" ADD VALUE 'UNSUPPORTED';

-- DropIndex
DROP INDEX "WaFlow_flowId_key";

-- AlterTable
ALTER TABLE "WaConversation" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "bsuid" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WaFlow" ADD COLUMN     "description" TEXT,
ADD COLUMN     "endpointEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previewUrl" TEXT,
ADD COLUMN     "rsaPrivateKeyEncrypted" TEXT,
ADD COLUMN     "rsaPublicKey" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3),
ADD COLUMN     "totalResponses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "WaFlowExecution" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "flowToken" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "shopId" TEXT NOT NULL,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WaIntegration" ADD COLUMN     "callingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "connectedAt" TIMESTAMP(3),
ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "messagingLimitTier" "WaMessagingLimitTier",
ADD COLUMN     "qualityRating" "WaQualityRating";

-- AlterTable
ALTER TABLE "WaMessage" ADD COLUMN     "broadcastRecipientId" TEXT,
ADD COLUMN     "lastRetryAt" TIMESTAMP(3),
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "s3Bucket" TEXT,
ADD COLUMN     "s3Key" TEXT,
ADD COLUMN     "templateLanguage" TEXT,
ADD COLUMN     "templateName" TEXT;

-- AlterTable
ALTER TABLE "WaTemplate" ADD COLUMN     "bodyVariables" JSONB,
ADD COLUMN     "headerVariables" JSONB,
ADD COLUMN     "metaRejectionReason" TEXT,
ADD COLUMN     "metaTemplateId" TEXT,
ADD COLUMN     "readCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "syncedAt" TIMESTAMP(3),
DROP COLUMN "category",
ADD COLUMN     "category" "WaTemplateCategory" NOT NULL;

-- AlterTable
ALTER TABLE "WaWebhookEvent" ADD COLUMN     "shopId" TEXT;

-- CreateTable
CREATE TABLE "WaBroadcast" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVariables" JSONB,
    "audienceFilter" JSONB,
    "audienceCount" INTEGER NOT NULL DEFAULT 0,
    "status" "WaBroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaBroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT NOT NULL,
    "status" "WaBroadcastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "metaMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaBroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaBroadcast_shopId_status_idx" ON "WaBroadcast"("shopId", "status");

-- CreateIndex
CREATE INDEX "WaBroadcastRecipient_broadcastId_status_idx" ON "WaBroadcastRecipient"("broadcastId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WaBroadcastRecipient_broadcastId_customerId_key" ON "WaBroadcastRecipient"("broadcastId", "customerId");

-- CreateIndex
CREATE INDEX "WaConversation_shopId_updatedAt_idx" ON "WaConversation"("shopId", "updatedAt");

-- CreateIndex
CREATE INDEX "WaConversation_shopId_customerId_idx" ON "WaConversation"("shopId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "WaFlow_shopId_flowId_key" ON "WaFlow"("shopId", "flowId");

-- CreateIndex
CREATE UNIQUE INDEX "WaFlowExecution_flowToken_key" ON "WaFlowExecution"("flowToken");

-- CreateIndex
CREATE INDEX "WaFlowExecution_shopId_flowId_idx" ON "WaFlowExecution"("shopId", "flowId");

-- CreateIndex
CREATE INDEX "WaFlowExecution_flowToken_idx" ON "WaFlowExecution"("flowToken");

-- CreateIndex
CREATE INDEX "WaIntegration_phoneNumberId_idx" ON "WaIntegration"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WaMessage_conversationId_createdAt_idx" ON "WaMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WaTemplate_shopId_status_idx" ON "WaTemplate"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WaTemplate_shopId_name_language_key" ON "WaTemplate"("shopId", "name", "language");

-- CreateIndex
CREATE INDEX "WaWebhookEvent_processedAt_idx" ON "WaWebhookEvent"("processedAt");

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaFlowExecution" ADD CONSTRAINT "WaFlowExecution_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "WaFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaFlowExecution" ADD CONSTRAINT "WaFlowExecution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaBroadcast" ADD CONSTRAINT "WaBroadcast_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaBroadcast" ADD CONSTRAINT "WaBroadcast_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WaTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaBroadcast" ADD CONSTRAINT "WaBroadcast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaBroadcastRecipient" ADD CONSTRAINT "WaBroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "WaBroadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaBroadcastRecipient" ADD CONSTRAINT "WaBroadcastRecipient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
