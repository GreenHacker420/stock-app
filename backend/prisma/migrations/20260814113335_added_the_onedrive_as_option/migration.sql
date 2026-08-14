-- AlterEnum
ALTER TYPE "AssetStorageProvider" ADD VALUE 'ONEDRIVE';

-- CreateIndex
CREATE INDEX "CustomerLedgerAllocation_shopId_clientMutationId_idx" ON "CustomerLedgerAllocation"("shopId", "clientMutationId");
