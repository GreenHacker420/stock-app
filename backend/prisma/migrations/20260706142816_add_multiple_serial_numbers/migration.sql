/*
  Warnings:

  - You are about to drop the column `serialNumber` on the `DeliveryMemoItem` table. All the data in the column will be lost.
  - You are about to drop the column `serialNumber` on the `SaleItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DeliveryMemoItem" DROP COLUMN "serialNumber",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "serialNumbers" JSONB;

-- AlterTable
ALTER TABLE "SaleItem" DROP COLUMN "serialNumber",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "serialNumbers" JSONB;
