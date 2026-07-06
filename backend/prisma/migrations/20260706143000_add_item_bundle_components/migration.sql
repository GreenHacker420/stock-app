-- Add virtual bundle/BOM support for sellable catalog items.
-- Stock remains held by component items; the parent item is the sellable kit.
CREATE TABLE "ItemBundleComponent" (
  "id" TEXT NOT NULL,
  "parentItemId" TEXT NOT NULL,
  "componentItemId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ItemBundleComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemBundleComponent_parentItemId_componentItemId_key"
  ON "ItemBundleComponent"("parentItemId", "componentItemId");

CREATE INDEX "ItemBundleComponent_componentItemId_idx"
  ON "ItemBundleComponent"("componentItemId");

ALTER TABLE "ItemBundleComponent"
  ADD CONSTRAINT "ItemBundleComponent_parentItemId_fkey"
  FOREIGN KEY ("parentItemId") REFERENCES "Item"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemBundleComponent"
  ADD CONSTRAINT "ItemBundleComponent_componentItemId_fkey"
  FOREIGN KEY ("componentItemId") REFERENCES "Item"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
