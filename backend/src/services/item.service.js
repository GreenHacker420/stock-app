import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";

export async function listItems(user, { shopId, search }) {
  await assertShopAccess(user, shopId);

  return prisma.item.findMany({
    where: {
      shopId,
      status: "ACTIVE",
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { category: true },
    orderBy: { name: "asc" },
  });
}

export async function createCategory(user, data) {
  await assertShopAccess(user, data.shopId);
  return prisma.itemCategory.create({
    data: {
      shopId: data.shopId,
      name: data.name,
    },
  });
}

export async function createItem(user, data) {
  await assertShopAccess(user, data.shopId);

  if (data.categoryId) {
    const category = await prisma.itemCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || category.shopId !== data.shopId) {
      throw new ApiError(400, "Category does not belong to this shop");
    }
  }

  const item = await prisma.item.create({
    data,
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: item.shopId,
    action: "item.created",
    entityType: "Item",
    entityId: item.id,
    newValueJson: item,
  });

  return item;
}

export async function updateItem(user, id, data) {
  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Item not found");
  await assertShopAccess(user, existing.shopId);

  if (data.categoryId) {
    const category = await prisma.itemCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || category.shopId !== existing.shopId) {
      throw new ApiError(400, "Category does not belong to this shop");
    }
  }

  const item = await prisma.item.update({
    where: { id },
    data,
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: item.shopId,
    action: "item.updated",
    entityType: "Item",
    entityId: id,
    oldValueJson: existing,
    newValueJson: item,
  });

  return item;
}
