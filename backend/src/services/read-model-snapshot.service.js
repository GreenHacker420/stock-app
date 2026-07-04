import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { Prisma } from "../generated/prisma/index.js";

const SCHEMA_VERSION = 1;

const CUSTOMER_SELECT = {
  id: true,
  shopId: true,
  name: true,
  type: true,
  phone: true,
  address: true,
  city: true,
  gstin: true,
  contactPerson: true,
  creditLimit: true,
  outstandingAmount: true,
  updatedAt: true,
};

const ITEM_SELECT = {
  id: true,
  shopId: true,
  name: true,
  sku: true,
  imageUrl: true,
  unit: true,
  defaultSellingPrice: true,
  minimumAllowedPrice: true,
  mrp: true,
  minimumStock: true,
  categoryId: true,
  updatedAt: true,
  category: { select: { name: true } },
};

const CATEGORY_SELECT = {
  id: true,
  name: true,
  updatedAt: true,
};

function projectItem(item) {
  const { category, ...rest } = item;
  return { ...rest, categoryName: category?.name ?? null };
}
export async function getShopReadModelBootstrap(user, shopId) {
  await assertShopAccess(user, shopId);

  return prisma.$transaction(
    async (tx) => {
      const maxSeqRow = await tx.domainEventOutbox.aggregate({
        where: { shopId },
        _max: { sequence: true },
      });
      const baseCursor = maxSeqRow._max.sequence != null ? maxSeqRow._max.sequence.toString() : null;

      const [customers, items, categories] = await Promise.all([
        tx.customer.findMany({
          where: { shopId, status: "ACTIVE" },
          select: CUSTOMER_SELECT,
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        tx.item.findMany({
          where: { shopId, status: "ACTIVE" },
          select: ITEM_SELECT,
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        tx.itemCategory.findMany({
          where: { shopId, status: "ACTIVE" },
          select: CATEGORY_SELECT,
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
      ]);

      return {
        schemaVersion: SCHEMA_VERSION,
        shopId,
        generatedAt: new Date().toISOString(),
        baseCursor,
        complete: true,
        customers,
        items: items.map(projectItem),
        categories,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
