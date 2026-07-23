ALTER TABLE "WaConversation"
ADD COLUMN "isMuted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mutedUntil" TIMESTAMP(3);

CREATE INDEX "WaConversation_shopId_isArchived_isPinned_idx"
ON "WaConversation"("shopId", "isArchived", "isPinned");
