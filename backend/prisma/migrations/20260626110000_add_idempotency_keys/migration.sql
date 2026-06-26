CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB,
    "statusCode" INTEGER,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyKey_key_shopId_endpoint_key" ON "IdempotencyKey"("key", "shopId", "endpoint");
CREATE INDEX "IdempotencyKey_shopId_endpoint_createdAt_idx" ON "IdempotencyKey"("shopId", "endpoint", "createdAt");
CREATE INDEX "IdempotencyKey_resourceType_resourceId_idx" ON "IdempotencyKey"("resourceType", "resourceId");
