-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "embedding" vector(384);
