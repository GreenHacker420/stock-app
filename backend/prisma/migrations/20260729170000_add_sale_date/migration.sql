ALTER TABLE "Sale"
ADD COLUMN "saleDate" TIMESTAMP(3);

UPDATE "Sale" SET "saleDate" = "createdAt";

ALTER TABLE "Sale"
ALTER COLUMN "saleDate" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "saleDate" SET NOT NULL;

CREATE INDEX "Sale_shopId_saleDate_idx" ON "Sale"("shopId", "saleDate");
CREATE INDEX "Sale_shopId_customerId_saleDate_idx" ON "Sale"("shopId", "customerId", "saleDate");
