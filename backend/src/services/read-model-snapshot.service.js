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
  bundleComponents: {
    select: {
      componentItemId: true,
      quantity: true,
    },
    orderBy: { componentItemId: "asc" },
  },
};

const CATEGORY_SELECT = {
  id: true,
  name: true,
  updatedAt: true,
};

function projectItem(item) {
  const { category, ...rest } = item;
  return {
    ...rest,
    categoryName: category?.name ?? null,
    bundleComponents: (item.bundleComponents || []).map((component) => ({
      componentItemId: component.componentItemId,
      quantity: Number(component.quantity),
    })),
  };
}

export async function getShopCustomerReadModel(user, shopId) {
  await assertShopAccess(user, shopId);
  return prisma.customer.findMany({
    where: { shopId, status: "ACTIVE" },
    select: CUSTOMER_SELECT,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

export async function getShopItemCatalogReadModel(user, shopId) {
  await assertShopAccess(user, shopId);
  const items = await prisma.item.findMany({
    where: { shopId, status: "ACTIVE" },
    select: ITEM_SELECT,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return items.map(projectItem);
}

export async function getShopCategoryReadModel(user, shopId) {
  await assertShopAccess(user, shopId);
  return prisma.itemCategory.findMany({
    where: { shopId, status: "ACTIVE" },
    select: CATEGORY_SELECT,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
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
