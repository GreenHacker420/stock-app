DROP INDEX IF EXISTS "WaConversation_shopId_updatedAt_idx";
CREATE INDEX "WaConversation_shopId_updatedAt_id_idx"
ON "WaConversation"("shopId", "updatedAt", "id");

DROP INDEX IF EXISTS "WaMessage_conversationId_createdAt_idx";
CREATE INDEX "WaMessage_conversationId_createdAt_id_idx"
ON "WaMessage"("conversationId", "createdAt", "id");
