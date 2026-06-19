-- CreateEnum
CREATE TYPE "WaTemplateAttributeType" AS ENUM ('TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'DATETIME', 'BOOLEAN', 'URL', 'PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "WaTemplateAttributeSource" AS ENUM ('SYSTEM', 'CUSTOMER', 'CONVERSATION', 'SHOP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WaTemplateMappingStatus" AS ENUM ('VALID', 'INCOMPLETE', 'INVALID');

-- AlterEnum
ALTER TYPE "WaTemplateStatus" ADD VALUE IF NOT EXISTS 'DELETED';

-- AlterTable
ALTER TABLE "WaTemplate"
ADD COLUMN "subtype" TEXT,
ADD COLUMN "parameterFormat" TEXT NOT NULL DEFAULT 'POSITIONAL',
ADD COLUMN "mappingStatus" "WaTemplateMappingStatus" NOT NULL DEFAULT 'INCOMPLETE',
ADD COLUMN "draftDefinition" JSONB,
ADD COLUMN "rawMeta" JSONB,
ADD COLUMN "syncError" TEXT,
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WaTemplateAttribute" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "WaTemplateAttributeType" NOT NULL DEFAULT 'TEXT',
    "source" "WaTemplateAttributeSource" NOT NULL DEFAULT 'CUSTOM',
    "sourcePath" TEXT,
    "fallbackValue" TEXT,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaTemplateAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaTemplateVariableMapping" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "buttonIndex" INTEGER,
    "cardIndex" INTEGER,
    "attributeId" TEXT,
    "sampleValue" TEXT NOT NULL,
    "fallbackValue" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaTemplateVariableMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "metaStatus" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- Seed stable system attributes for every existing shop.
INSERT INTO "WaTemplateAttribute" (
    "id", "shopId", "key", "label", "type", "source", "sourcePath",
    "description", "isSystem", "createdAt", "updatedAt"
)
SELECT
    'wa_attr_' || md5(shop."id" || ':' || seed."key"),
    shop."id",
    seed."key",
    seed."label",
    seed."type"::"WaTemplateAttributeType",
    seed."source"::"WaTemplateAttributeSource",
    seed."sourcePath",
    seed."description",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Shop" shop
CROSS JOIN (
    VALUES
      ('customer.name', 'Customer name', 'TEXT', 'CUSTOMER', 'name', 'Linked customer display name'),
      ('customer.phone', 'Customer phone', 'PHONE', 'CUSTOMER', 'phone', 'Linked customer phone number'),
      ('customer.email', 'Customer email', 'EMAIL', 'CUSTOMER', 'email', 'Linked customer email address'),
      ('customer.outstandingAmount', 'Outstanding amount', 'CURRENCY', 'CUSTOMER', 'outstandingAmount', 'Current customer outstanding balance'),
      ('conversation.contactName', 'WhatsApp contact name', 'TEXT', 'CONVERSATION', 'contactName', 'WhatsApp profile or conversation name'),
      ('conversation.phone', 'WhatsApp phone', 'PHONE', 'CONVERSATION', 'phone', 'Conversation recipient phone number'),
      ('shop.name', 'Shop name', 'TEXT', 'SHOP', 'name', 'Current shop name'),
      ('shop.phone', 'Shop phone', 'PHONE', 'SHOP', 'phone', 'Current shop phone number'),
      ('shop.address', 'Shop address', 'TEXT', 'SHOP', 'address', 'Current shop address')
) AS seed("key", "label", "type", "source", "sourcePath", "description");

-- CreateIndex
CREATE UNIQUE INDEX "WaTemplateAttribute_shopId_key_key" ON "WaTemplateAttribute"("shopId", "key");
CREATE INDEX "WaTemplateAttribute_shopId_isActive_idx" ON "WaTemplateAttribute"("shopId", "isActive");
CREATE UNIQUE INDEX "WaTemplateVariableMapping_templateId_component_position_buttonIndex_cardIndex_key"
ON "WaTemplateVariableMapping"("templateId", "component", "position", "buttonIndex", "cardIndex");
CREATE INDEX "WaTemplateVariableMapping_templateId_idx" ON "WaTemplateVariableMapping"("templateId");
CREATE INDEX "WaTemplateVariableMapping_attributeId_idx" ON "WaTemplateVariableMapping"("attributeId");
CREATE UNIQUE INDEX "WaTemplateVersion_templateId_version_key" ON "WaTemplateVersion"("templateId", "version");
CREATE INDEX "WaTemplateVersion_templateId_createdAt_idx" ON "WaTemplateVersion"("templateId", "createdAt");

-- AddForeignKey
ALTER TABLE "WaTemplateAttribute" ADD CONSTRAINT "WaTemplateAttribute_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaTemplateAttribute" ADD CONSTRAINT "WaTemplateAttribute_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaTemplateVariableMapping" ADD CONSTRAINT "WaTemplateVariableMapping_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "WaTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaTemplateVariableMapping" ADD CONSTRAINT "WaTemplateVariableMapping_attributeId_fkey"
FOREIGN KEY ("attributeId") REFERENCES "WaTemplateAttribute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaTemplateVersion" ADD CONSTRAINT "WaTemplateVersion_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "WaTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaTemplateVersion" ADD CONSTRAINT "WaTemplateVersion_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
