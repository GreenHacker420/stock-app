CREATE TYPE "TenantMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "defaultWaIntegrationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TenantMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "callPhone" TEXT,
    "defaultWaIntegrationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Shop"
ADD COLUMN "tenantId" TEXT,
ADD COLUMN "shopGroupId" TEXT;

ALTER TABLE "WaIntegration"
ADD COLUMN "tenantId" TEXT,
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedReason" TEXT;

CREATE TABLE "WaIntegrationShopAccess" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canSend" BOOLEAN NOT NULL DEFAULT true,
    "canManage" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaIntegrationShopAccess_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WaConversation"
ADD COLUMN "integrationId" TEXT,
ADD COLUMN "contextShopId" TEXT;

CREATE TABLE "WaConversationCustomerLink" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaConversationCustomerLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WaMessage"
ADD COLUMN "contextShopId" TEXT;

ALTER TABLE "WaWebhookEnvelope"
ADD COLUMN "integrationId" TEXT;

ALTER TABLE "WaWebhookEvent"
ADD COLUMN "integrationId" TEXT;

ALTER TABLE "WaTemplate"
ADD COLUMN "integrationId" TEXT;

ALTER TABLE "WaFlow"
ADD COLUMN "integrationId" TEXT;

ALTER TABLE "WaBroadcast"
ADD COLUMN "integrationId" TEXT;

CREATE INDEX "Tenant_ownerId_idx" ON "Tenant"("ownerId");
CREATE INDEX "Tenant_defaultWaIntegrationId_idx" ON "Tenant"("defaultWaIntegrationId");

CREATE UNIQUE INDEX "TenantMember_tenantId_userId_key"
ON "TenantMember"("tenantId", "userId");
CREATE INDEX "TenantMember_userId_idx" ON "TenantMember"("userId");

CREATE UNIQUE INDEX "ShopGroup_tenantId_code_key"
ON "ShopGroup"("tenantId", "code");
CREATE INDEX "ShopGroup_tenantId_name_idx" ON "ShopGroup"("tenantId", "name");
CREATE INDEX "ShopGroup_defaultWaIntegrationId_idx"
ON "ShopGroup"("defaultWaIntegrationId");

CREATE INDEX "Shop_tenantId_idx" ON "Shop"("tenantId");
CREATE INDEX "Shop_shopGroupId_idx" ON "Shop"("shopGroupId");

CREATE INDEX "WaIntegration_tenantId_status_idx"
ON "WaIntegration"("tenantId", "status");

CREATE UNIQUE INDEX "WaIntegrationShopAccess_integrationId_shopId_key"
ON "WaIntegrationShopAccess"("integrationId", "shopId");
CREATE INDEX "WaIntegrationShopAccess_shopId_isPrimary_idx"
ON "WaIntegrationShopAccess"("shopId", "isPrimary");

CREATE INDEX "WaConversation_integrationId_updatedAt_id_idx"
ON "WaConversation"("integrationId", "updatedAt", "id");
CREATE INDEX "WaConversation_contextShopId_updatedAt_id_idx"
ON "WaConversation"("contextShopId", "updatedAt", "id");

CREATE UNIQUE INDEX "WaConversationCustomerLink_conversationId_shopId_key"
ON "WaConversationCustomerLink"("conversationId", "shopId");
CREATE INDEX "WaConversationCustomerLink_shopId_customerId_idx"
ON "WaConversationCustomerLink"("shopId", "customerId");
CREATE INDEX "WaConversationCustomerLink_customerId_idx"
ON "WaConversationCustomerLink"("customerId");

CREATE INDEX "WaMessage_contextShopId_createdAt_idx"
ON "WaMessage"("contextShopId", "createdAt");

CREATE INDEX "WaWebhookEnvelope_integrationId_processingStatus_receivedAt_idx"
ON "WaWebhookEnvelope"("integrationId", "processingStatus", "receivedAt");

CREATE INDEX "WaWebhookEvent_integrationId_processedAt_idx"
ON "WaWebhookEvent"("integrationId", "processedAt");

CREATE INDEX "WaTemplate_integrationId_status_idx"
ON "WaTemplate"("integrationId", "status");

CREATE INDEX "WaFlow_integrationId_status_updatedAt_idx"
ON "WaFlow"("integrationId", "status", "updatedAt");

CREATE INDEX "WaBroadcast_integrationId_status_idx"
ON "WaBroadcast"("integrationId", "status");

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_defaultWaIntegrationId_fkey"
FOREIGN KEY ("defaultWaIntegrationId") REFERENCES "WaIntegration"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TenantMember"
ADD CONSTRAINT "TenantMember_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantMember"
ADD CONSTRAINT "TenantMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopGroup"
ADD CONSTRAINT "ShopGroup_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopGroup"
ADD CONSTRAINT "ShopGroup_defaultWaIntegrationId_fkey"
FOREIGN KEY ("defaultWaIntegrationId") REFERENCES "WaIntegration"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Shop"
ADD CONSTRAINT "Shop_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shop"
ADD CONSTRAINT "Shop_shopGroupId_fkey"
FOREIGN KEY ("shopGroupId") REFERENCES "ShopGroup"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaIntegration"
ADD CONSTRAINT "WaIntegration_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaIntegrationShopAccess"
ADD CONSTRAINT "WaIntegrationShopAccess_integrationId_fkey"
FOREIGN KEY ("integrationId") REFERENCES "WaIntegration"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaIntegrationShopAccess"
ADD CONSTRAINT "WaIntegrationShopAccess_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaConversation"
ADD CONSTRAINT "WaConversation_integrationId_fkey"
FOREIGN KEY ("integrationId") REFERENCES "WaIntegration"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaConversation"
ADD CONSTRAINT "WaConversation_contextShopId_fkey"
FOREIGN KEY ("contextShopId") REFERENCES "Shop"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WaConversationCustomerLink"
ADD CONSTRAINT "WaConversationCustomerLink_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "WaConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaConversationCustomerLink"
ADD CONSTRAINT "WaConversationCustomerLink_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaConversationCustomerLink"
ADD CONSTRAINT "WaConversationCustomerLink_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaMessage"
ADD CONSTRAINT "WaMessage_contextShopId_fkey"
FOREIGN KEY ("contextShopId") REFERENCES "Shop"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WaWebhookEnvelope"
ADD CONSTRAINT "WaWebhookEnvelope_integrationId_fkey"
FOREIGN KEY ("integrationId") REFERENCES "WaIntegration"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaTemplate"
ADD CONSTRAINT "WaTemplate_integrationId_fkey"
FOREIGN KEY ("integrationId") REFERENCES "WaIntegration"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaFlow"
ADD CONSTRAINT "WaFlow_integrationId_fkey"
FOREIGN KEY ("integrationId") REFERENCES "WaIntegration"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaBroadcast"
ADD CONSTRAINT "WaBroadcast_integrationId_fkey"
FOREIGN KEY ("integrationId") REFERENCES "WaIntegration"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
