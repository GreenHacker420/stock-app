-- CreateEnum
CREATE TYPE "WaMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WaMessageType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'STICKER', 'TEMPLATE', 'FLOW');

-- CreateEnum
CREATE TYPE "WaMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "WaConversation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT NOT NULL,
    "contactName" TEXT,
    "lastCustomerMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "metaMessageId" TEXT,
    "direction" "WaMessageDirection" NOT NULL,
    "status" "WaMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "type" "WaMessageType" NOT NULL DEFAULT 'TEXT',
    "content" JSONB,
    "mediaUrl" TEXT,
    "mimeType" TEXT,
    "fileName" TEXT,
    "templateId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaWebhookEvent" (
    "id" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaTemplate" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaTemplateUsage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WaTemplateUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaFlow" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "flowId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "flowJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaFlowExecution" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputJson" JSONB,
    "resultJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WaFlowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaConversation_shopId_phone_key" ON "WaConversation"("shopId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessage_metaMessageId_key" ON "WaMessage"("metaMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "WaFlow_flowId_key" ON "WaFlow"("flowId");

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WaConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaTemplate" ADD CONSTRAINT "WaTemplate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaFlow" ADD CONSTRAINT "WaFlow_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaFlowExecution" ADD CONSTRAINT "WaFlowExecution_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WaConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
