/*
  Warnings:

  - Changed the type of `eventType` on the `WaWebhookEvent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "WaWebhookEventType" AS ENUM ('STATUS', 'MESSAGE');

-- AlterTable
ALTER TABLE "WaWebhookEvent" DROP COLUMN "eventType",
ADD COLUMN     "eventType" "WaWebhookEventType" NOT NULL;
