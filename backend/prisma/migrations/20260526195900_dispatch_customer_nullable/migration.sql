-- DropForeignKey
ALTER TABLE "Dispatch" DROP CONSTRAINT "Dispatch_customerId_fkey";

-- AlterTable
ALTER TABLE "Dispatch" ALTER COLUMN "customerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
