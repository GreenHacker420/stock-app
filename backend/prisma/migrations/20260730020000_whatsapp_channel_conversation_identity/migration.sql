-- Conversations belong to a WhatsApp channel, not to the shop row that first
-- connected that channel. PostgreSQL permits multiple NULL values in a unique
-- index, so preserved legacy/unassigned conversations remain isolated.
DROP INDEX IF EXISTS "WaConversation_shopId_phone_key";

CREATE UNIQUE INDEX IF NOT EXISTS "WaConversation_integrationId_phone_key"
ON "WaConversation"("integrationId", "phone");
