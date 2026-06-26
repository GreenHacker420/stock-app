CREATE INDEX IF NOT EXISTS "Customer_shopId_status_createdAt_idx" ON "Customer"("shopId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Sale_shopId_customerId_createdAt_idx" ON "Sale"("shopId", "customerId", "createdAt");
