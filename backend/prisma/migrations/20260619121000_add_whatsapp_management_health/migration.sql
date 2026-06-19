-- AlterTable
ALTER TABLE "WaIntegration"
ADD COLUMN "accountStatus" TEXT,
ADD COLUMN "accountReviewStatus" TEXT,
ADD COLUMN "displayNameStatus" TEXT,
ADD COLUMN "capabilities" JSONB,
ADD COLUMN "lastManagementEventAt" TIMESTAMP(3),
ADD COLUMN "lastManagementEventField" TEXT;

-- AlterTable
ALTER TABLE "WaTemplate"
ADD COLUMN "qualityScore" TEXT,
ADD COLUMN "statusUpdatedAt" TIMESTAMP(3),
ADD COLUMN "qualityUpdatedAt" TIMESTAMP(3);
