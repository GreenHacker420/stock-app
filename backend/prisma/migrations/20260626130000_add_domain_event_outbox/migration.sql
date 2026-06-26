CREATE TABLE "DomainEventOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "shopId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "DomainEventOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DomainEventOutbox_status_createdAt_idx" ON "DomainEventOutbox"("status", "createdAt");
CREATE INDEX "DomainEventOutbox_shopId_entity_action_idx" ON "DomainEventOutbox"("shopId", "entity", "action");
CREATE INDEX "DomainEventOutbox_entity_entityId_idx" ON "DomainEventOutbox"("entity", "entityId");
