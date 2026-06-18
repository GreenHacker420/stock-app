/*
  Warnings:

  - Added the required column `eventType` to the `WaWebhookEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WaMessage" ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "replyToMetaMessageId" TEXT;

-- AlterTable
ALTER TABLE "WaWebhookEvent" ADD COLUMN     "eventType" TEXT NOT NULL;
