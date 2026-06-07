import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";

export async function listShops(user) {
  const includeStaff = {
    staffAccesses: {
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            mobile: true,
            email: true,
          },
        },
      },
    },
  };

  if (user.role === "OWNER") {
    return prisma.shop.findMany({
      where: { ownerId: user.id },
      include: includeStaff,
      orderBy: { createdAt: "desc" },
    });
  }

  const accesses = await prisma.staffShopAccess.findMany({
    where: { staffId: user.id },
    include: {
      shop: {
        include: includeStaff,
      },
    },
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
      ownerId: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      shopId: shop.id,
      action: AuditAction.CREATED,
      entityType: EntityType.SHOP,
      entityId: shop.id,
      newValueJson: shop,
    }
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

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      shopId,
      action: AuditAction.UPDATED,
      entityType: EntityType.SHOP,
      entityId: shopId,
      oldValueJson: existing,
      newValueJson: shop,
    }
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
  });

  if (!staff || staff.role !== "STAFF" || staff.status !== "ACTIVE") {
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

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      shopId,
      action: AuditAction.STAFF_ASSIGNED,
      entityType: EntityType.STAFF_SHOP_ACCESS,
      entityId: access.id,
      newValueJson: access,
    }
  });

  return access;
}

export async function setOpeningStock(user, shopId, entries) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.ownerId !== user.id) {
    throw new ApiError(404, "Shop not found");
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

    return rows;
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      shopId,
      action: AuditAction.OPENING_SET,
      entityType: EntityType.STOCK_LEDGER,
      newValueJson: { count: result.length },
    }
  });

  return result;
}
