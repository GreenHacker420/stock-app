-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('WHATSAPP_INBOUND', 'WHATSAPP_OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "AssetStorageProvider" AS ENUM ('S3');

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdById" TEXT,
    "kind" "AssetKind" NOT NULL,
    "source" "AssetSource" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'UPLOADING',
    "storageProvider" "AssetStorageProvider",
    "storageBucket" TEXT,
    "storageKey" TEXT,
    "remoteUrl" TEXT,
    "externalProvider" TEXT,
    "externalId" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT,
    "sizeBytes" BIGINT,
    "checksumSha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "WaMessage" ADD COLUMN "assetId" TEXT;

-- Backfill existing WhatsApp media into tenant-scoped assets. Reused Meta or
-- storage identities collapse to one asset and can be referenced by many messages.
WITH media_rows AS (
SELECT
    'wa_asset_' || md5(
      conversation."shopId" || ':' ||
      COALESCE(
        'meta:' || message."mediaId",
        's3:' || COALESCE(message."s3Bucket", '') || ':' || message."s3Key",
        'url:' || message."mediaUrl",
        'message:' || message."id"
      )
    ) AS "assetId",
    conversation."shopId" AS "shopId",
    message.*
FROM "WaMessage" message
JOIN "WaConversation" conversation ON conversation."id" = message."conversationId"
WHERE message."mediaId" IS NOT NULL
   OR message."mediaUrl" IS NOT NULL
   OR message."s3Key" IS NOT NULL
)
INSERT INTO "Asset" (
    "id",
    "shopId",
    "kind",
    "source",
    "status",
    "storageProvider",
    "storageBucket",
    "storageKey",
    "remoteUrl",
    "externalProvider",
    "externalId",
    "mimeType",
    "fileName",
    "createdAt",
    "updatedAt",
    "readyAt"
)
SELECT
    DISTINCT ON (media."assetId")
    media."assetId",
    media."shopId",
    CASE media."type"
      WHEN 'IMAGE' THEN 'IMAGE'::"AssetKind"
      WHEN 'VIDEO' THEN 'VIDEO'::"AssetKind"
      WHEN 'AUDIO' THEN 'AUDIO'::"AssetKind"
      WHEN 'DOCUMENT' THEN 'DOCUMENT'::"AssetKind"
      WHEN 'STICKER' THEN 'STICKER'::"AssetKind"
      ELSE 'OTHER'::"AssetKind"
    END,
    CASE media."direction"
      WHEN 'INBOUND' THEN 'WHATSAPP_INBOUND'::"AssetSource"
      ELSE 'WHATSAPP_OUTBOUND'::"AssetSource"
    END,
    CASE
      WHEN media."s3Key" IS NOT NULL OR media."mediaUrl" IS NOT NULL THEN 'READY'::"AssetStatus"
      ELSE 'UPLOADING'::"AssetStatus"
    END,
    CASE WHEN media."s3Key" IS NOT NULL THEN 'S3'::"AssetStorageProvider" ELSE NULL END,
    media."s3Bucket",
    media."s3Key",
    media."mediaUrl",
    CASE WHEN media."mediaId" IS NOT NULL THEN 'META_WHATSAPP' ELSE NULL END,
    media."mediaId",
    COALESCE(media."mimeType", 'application/octet-stream'),
    media."fileName",
    media."createdAt",
    CURRENT_TIMESTAMP,
    CASE
      WHEN media."s3Key" IS NOT NULL OR media."mediaUrl" IS NOT NULL THEN CURRENT_TIMESTAMP
      ELSE NULL
    END
FROM media_rows media
ORDER BY media."assetId", media."createdAt";

UPDATE "WaMessage" message
SET "assetId" = 'wa_asset_' || md5(
  conversation."shopId" || ':' ||
  COALESCE(
    'meta:' || message."mediaId",
    's3:' || COALESCE(message."s3Bucket", '') || ':' || message."s3Key",
    'url:' || message."mediaUrl",
    'message:' || message."id"
  )
)
FROM "WaConversation" conversation
WHERE conversation."id" = message."conversationId"
  AND (
    message."mediaId" IS NOT NULL
    OR message."mediaUrl" IS NOT NULL
    OR message."s3Key" IS NOT NULL
  );

-- Drop duplicated media identity columns now represented by Asset.
ALTER TABLE "WaMessage"
DROP COLUMN "mediaId",
DROP COLUMN "mediaUrl",
DROP COLUMN "s3Key",
DROP COLUMN "s3Bucket",
DROP COLUMN "mimeType",
DROP COLUMN "fileName";

-- CreateIndex
CREATE UNIQUE INDEX "Asset_shopId_storageProvider_storageBucket_storageKey_key"
ON "Asset"("shopId", "storageProvider", "storageBucket", "storageKey");

CREATE UNIQUE INDEX "Asset_shopId_externalProvider_externalId_key"
ON "Asset"("shopId", "externalProvider", "externalId");

CREATE INDEX "Asset_shopId_status_createdAt_idx" ON "Asset"("shopId", "status", "createdAt");
CREATE INDEX "Asset_createdById_idx" ON "Asset"("createdById");
CREATE INDEX "WaMessage_assetId_idx" ON "WaMessage"("assetId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
