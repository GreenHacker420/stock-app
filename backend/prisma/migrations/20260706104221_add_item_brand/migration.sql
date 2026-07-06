-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "brandId" TEXT;

-- CreateTable
CREATE TABLE "ItemBrand" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemBrand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemBrand_shopId_name_key" ON "ItemBrand"("shopId", "name");

-- AddForeignKey
ALTER TABLE "ItemBrand" ADD CONSTRAINT "ItemBrand_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "ItemBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
