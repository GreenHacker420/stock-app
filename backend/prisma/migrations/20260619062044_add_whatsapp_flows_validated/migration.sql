/*
  Warnings:

  - You are about to drop the column `rsaPrivateKeyEncrypted` on the `WaFlow` table. All the data in the column will be lost.
  - You are about to drop the column `rsaPublicKey` on the `WaFlow` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "WaFlow" DROP COLUMN "rsaPrivateKeyEncrypted",
DROP COLUMN "rsaPublicKey",
ADD COLUMN     "endpointUrl" TEXT;

-- AlterTable
ALTER TABLE "WaIntegration" ADD COLUMN     "rsaPrivateKeyEncrypted" TEXT,
ADD COLUMN     "rsaPublicKey" TEXT;
