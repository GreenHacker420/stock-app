-- AlterTable
ALTER TABLE "DeliveryMemoItem" ADD COLUMN     "serialNumber" TEXT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "requiresSerialNumber" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "serialNumber" TEXT;
