-- CreateTable
CREATE TABLE "LocalCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "city" TEXT,
    "customerType" TEXT,
    "syncStatus" TEXT NOT NULL,
    "conflictReason" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "LocalItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "unit" TEXT,
    "price" TEXT NOT NULL,
    "stockQty" TEXT NOT NULL,
    "pendingStockDelta" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LocalSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "serverCustomerId" TEXT,
    "billNumber" TEXT,
    "subtotal" TEXT NOT NULL,
    "discount" TEXT NOT NULL,
    "tax" TEXT NOT NULL,
    "total" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "notes" TEXT,
    "signatureUri" TEXT,
    "signatureBase64" TEXT,
    "syncStatus" TEXT NOT NULL,
    "conflictReason" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LocalSaleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "itemId" TEXT,
    "serverItemId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "priceSnapshot" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "unit" TEXT,
    "lineTotal" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LocalPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT,
    "saleId" TEXT,
    "serverSaleId" TEXT,
    "customerId" TEXT,
    "serverCustomerId" TEXT,
    "shopId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "syncStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PendingMutation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT,
    "entityType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "localEntityId" TEXT NOT NULL,
    "serverEntityId" TEXT,
    "dependsOnMutationId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IdMapping" (
    "localId" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SyncMetadata" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LocalCustomer_shopId_idx" ON "LocalCustomer"("shopId");
CREATE INDEX "LocalCustomer_serverId_idx" ON "LocalCustomer"("serverId");
CREATE INDEX "LocalCustomer_phone_idx" ON "LocalCustomer"("phone");
CREATE INDEX "LocalCustomer_syncStatus_idx" ON "LocalCustomer"("syncStatus");
CREATE INDEX "LocalItem_shopId_idx" ON "LocalItem"("shopId");
CREATE INDEX "LocalItem_serverId_idx" ON "LocalItem"("serverId");
CREATE INDEX "LocalItem_sku_idx" ON "LocalItem"("sku");
CREATE INDEX "LocalItem_syncStatus_idx" ON "LocalItem"("syncStatus");
CREATE INDEX "LocalSale_shopId_idx" ON "LocalSale"("shopId");
CREATE INDEX "LocalSale_serverId_idx" ON "LocalSale"("serverId");
CREATE INDEX "LocalSale_customerId_idx" ON "LocalSale"("customerId");
CREATE INDEX "LocalSale_serverCustomerId_idx" ON "LocalSale"("serverCustomerId");
CREATE INDEX "LocalSale_syncStatus_idx" ON "LocalSale"("syncStatus");
CREATE INDEX "LocalSale_createdAt_idx" ON "LocalSale"("createdAt");
CREATE INDEX "LocalSaleItem_saleId_idx" ON "LocalSaleItem"("saleId");
CREATE INDEX "LocalSaleItem_itemId_idx" ON "LocalSaleItem"("itemId");
CREATE INDEX "LocalSaleItem_serverItemId_idx" ON "LocalSaleItem"("serverItemId");
CREATE INDEX "LocalPayment_shopId_idx" ON "LocalPayment"("shopId");
CREATE INDEX "LocalPayment_serverId_idx" ON "LocalPayment"("serverId");
CREATE INDEX "LocalPayment_saleId_idx" ON "LocalPayment"("saleId");
CREATE INDEX "LocalPayment_serverSaleId_idx" ON "LocalPayment"("serverSaleId");
CREATE INDEX "LocalPayment_customerId_idx" ON "LocalPayment"("customerId");
CREATE INDEX "LocalPayment_syncStatus_idx" ON "LocalPayment"("syncStatus");
CREATE UNIQUE INDEX "PendingMutation_idempotencyKey_key" ON "PendingMutation"("idempotencyKey");
CREATE INDEX "PendingMutation_shopId_idx" ON "PendingMutation"("shopId");
CREATE INDEX "PendingMutation_status_idx" ON "PendingMutation"("status");
CREATE INDEX "PendingMutation_entityType_idx" ON "PendingMutation"("entityType");
CREATE INDEX "PendingMutation_localEntityId_idx" ON "PendingMutation"("localEntityId");
CREATE INDEX "PendingMutation_dependsOnMutationId_idx" ON "PendingMutation"("dependsOnMutationId");
CREATE INDEX "PendingMutation_createdAt_idx" ON "PendingMutation"("createdAt");
CREATE INDEX "IdMapping_serverId_idx" ON "IdMapping"("serverId");
CREATE INDEX "IdMapping_entityType_idx" ON "IdMapping"("entityType");
