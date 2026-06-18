/*
  Warnings:

  - The `status` column on the `WaFlow` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `WaFlowExecution` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `WaIntegration` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `WaTemplate` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "WaIntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "WaFlowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'BLOCKED', 'THROTTLED');

-- CreateEnum
CREATE TYPE "WaFlowExecutionStatus" AS ENUM ('STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaTemplateStatus" AS ENUM ('APPROVED', 'REJECTED', 'PENDING', 'PAUSED', 'DISABLED', 'IN_APPEAL');

-- DropForeignKey
ALTER TABLE "WaFlow" DROP CONSTRAINT "WaFlow_shopId_fkey";

-- DropForeignKey
ALTER TABLE "WaFlowExecution" DROP CONSTRAINT "WaFlowExecution_conversationId_fkey";

-- AlterTable
ALTER TABLE "WaFlow" DROP COLUMN "status",
ADD COLUMN     "status" "WaFlowStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "WaFlowExecution" DROP COLUMN "status",
ADD COLUMN     "status" "WaFlowExecutionStatus" NOT NULL DEFAULT 'STARTED';

-- AlterTable
ALTER TABLE "WaIntegration" ADD COLUMN     "appSecret" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "WaIntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED';

-- AlterTable
ALTER TABLE "WaTemplate" DROP COLUMN "status",
ADD COLUMN     "status" "WaTemplateStatus" NOT NULL DEFAULT 'PENDING';

-- AddForeignKey
ALTER TABLE "WaFlow" ADD CONSTRAINT "WaFlow_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaFlowExecution" ADD CONSTRAINT "WaFlowExecution_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WaConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
