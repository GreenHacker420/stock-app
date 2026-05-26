import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";

export async function listShops(user) {
  if (user.role === "OWNER") {
    return prisma.shop.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
    });
  }

  const accesses = await prisma.staffShopAccess.findMany({
    where: { staffId: user.id },
    include: { shop: true },
    orderBy: { createdAt: "desc" },
  });

  return accesses.map((access) => access.shop).filter((shop) => shop.status === "ACTIVE");
}

export async function createShop(user, data) {
  const shop = await prisma.shop.create({
    data: {
      name: data.name,
      code: data.code,
      city: data.city,
      address: data.address,
      openingCash: data.openingCash ?? 0,
      ownerId: user.id,
    },
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: shop.id,
    action: "shop.created",
    entityType: "Shop",
    entityId: shop.id,
    newValueJson: shop,
  });

  return shop;
}

export async function updateShop(user, shopId, data) {
  const existing = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!existing || existing.ownerId !== user.id) {
    throw new ApiError(404, "Shop not found");
  }

  const shop = await prisma.shop.update({
    where: { id: shopId },
    data,
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId,
    action: "shop.updated",
    entityType: "Shop",
    entityId: shopId,
    oldValueJson: existing,
    newValueJson: shop,
  });

  return shop;
}

export async function assignStaff(user, shopId, staffId) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.ownerId !== user.id) {
    throw new ApiError(404, "Shop not found");
  }

  const staff = await prisma.user.findUnique({
    where: { id: staffId },
    include: { role: true },
  });

  if (!staff || staff.role.name !== "STAFF" || staff.status !== "ACTIVE") {
    throw new ApiError(400, "Active staff user not found");
  }

  const access = await prisma.staffShopAccess.upsert({
    where: {
      staffId_shopId: {
        staffId,
        shopId,
      },
    },
    update: {},
    create: {
      staffId,
      shopId,
    },
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId,
    action: "shop.staff_assigned",
    entityType: "StaffShopAccess",
    entityId: access.id,
    newValueJson: access,
  });

  return access;
}

export async function setOpeningStock(user, shopId, entries) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.ownerId !== user.id) {
    throw new ApiError(404, "Shop not found");
  }

  if (shop.openingStockLocked) {
    throw new ApiError(400, "Opening stock is already locked for this shop");
  }

  const existingTransactions = await prisma.$transaction([
    prisma.order.count({ where: { shopId } }),
    prisma.sale.count({ where: { shopId } }),
    prisma.deliveryMemo.count({ where: { shopId } }),
  ]);

  if (existingTransactions.some((count) => count > 0)) {
    throw new ApiError(400, "Opening stock cannot be set after transactions exist");
  }

  const itemIds = entries.map((entry) => entry.itemId);
  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      shopId,
    },
    select: { id: true },
  });

  if (items.length !== new Set(itemIds).size) {
    throw new ApiError(400, "One or more items do not belong to this shop");
  }

  const duplicateOpeningRows = await prisma.stockLedger.findMany({
    where: {
      shopId,
      itemId: { in: itemIds },
      movementType: "OPENING_STOCK",
    },
    select: { itemId: true },
  });

  if (duplicateOpeningRows.length > 0) {
    throw new ApiError(400, "Opening stock already exists for one or more items");
  }

  const result = await prisma.$transaction(async (tx) => {
    const rows = await Promise.all(
      entries.map((entry) =>
        tx.stockLedger.create({
          data: {
            shopId,
            itemId: entry.itemId,
            movementType: "OPENING_STOCK",
            quantityIn: entry.quantity,
            quantityOut: 0,
            reason: entry.reason || "Opening stock",
            createdById: user.id,
            approvedById: user.id,
          },
        }),
      ),
    );

    await tx.shop.update({
      where: { id: shopId },
      data: { openingStockLocked: true },
    });

    return rows;
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId,
    action: "stock.opening_set",
    entityType: "StockLedger",
    newValueJson: { count: result.length },
  });

  return result;
}
