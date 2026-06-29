-- Scope idempotency keys by authenticated user as well as shop and endpoint.
DROP INDEX IF EXISTS "IdempotencyKey_key_shopId_endpoint_key";
CREATE UNIQUE INDEX "IdempotencyKey_key_shopId_userId_endpoint_key"
ON "IdempotencyKey"("key", "shopId", "userId", "endpoint");
