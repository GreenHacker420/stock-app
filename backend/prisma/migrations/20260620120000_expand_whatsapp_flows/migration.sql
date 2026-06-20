ALTER TYPE "WaFlowExecutionStatus" ADD VALUE IF NOT EXISTS 'OPENED';
ALTER TYPE "WaFlowExecutionStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "WaFlowExecutionStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "WaFlowExecutionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "WaFlow"
ADD COLUMN "categories" JSONB,
ADD COLUMN "jsonVersion" TEXT,
ADD COLUMN "dataApiVersion" TEXT,
ADD COLUMN "validationErrors" JSONB,
ADD COLUMN "endpointKey" TEXT,
ADD COLUMN "endpointHealth" JSONB,
ADD COLUMN "handlerKey" TEXT,
ADD COLUMN "previewExpiresAt" TIMESTAMP(3),
ADD COLUMN "localRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "deployedRevision" INTEGER,
ADD COLUMN "rawMeta" JSONB,
ADD COLUMN "syncError" TEXT,
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "deprecatedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "WaFlow" SET "endpointKey" = "id" WHERE "endpointKey" IS NULL;
ALTER TABLE "WaFlow" ALTER COLUMN "endpointKey" SET NOT NULL;

ALTER TABLE "WaFlowExecution"
ADD COLUMN "metaMessageId" TEXT,
ADD COLUMN "flowTokenHash" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "currentScreen" TEXT,
ADD COLUMN "lastAction" TEXT,
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastEndpointError" TEXT,
ADD COLUMN "openedAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "WaFlow_endpointKey_key" ON "WaFlow"("endpointKey");
CREATE INDEX "WaFlow_shopId_status_updatedAt_idx" ON "WaFlow"("shopId", "status", "updatedAt");
CREATE INDEX "WaFlowExecution_idempotencyKey_idx" ON "WaFlowExecution"("idempotencyKey");
CREATE INDEX "WaFlowExecution_conversationId_startedAt_idx" ON "WaFlowExecution"("conversationId", "startedAt");
