import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";

export async function getCurrentStock(user, { shopId, itemId }) {
  await assertShopAccess(user, shopId);

  const rows = await prisma.stockLedger.groupBy({
    by: ["itemId"],
    where: {
      shopId,
      itemId: itemId || undefined,
    },
    _sum: {
      quantityIn: true,
      quantityOut: true,
    },
  });

  const items = await prisma.item.findMany({
    where: {
      shopId,
      id: { in: rows.map((row) => row.itemId) },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      minimumStock: true,
    },
  });

  const itemMap = new Map(items.map((item) => [item.id, item]));

  return rows.map((row) => {
    const quantityIn = Number(row._sum.quantityIn || 0);
    const quantityOut = Number(row._sum.quantityOut || 0);
    const currentQuantity = quantityIn - quantityOut;
    const item = itemMap.get(row.itemId);

    return {
      item,
      quantityIn,
      quantityOut,
      currentQuantity,
      isLowStock: item ? currentQuantity <= Number(item.minimumStock) : false,
    };
  });
}

export async function listMovements(user, { shopId, itemId, movementType }) {
  await assertShopAccess(user, shopId);

  return prisma.stockLedger.findMany({
    where: {
      shopId,
      itemId: itemId || undefined,
      movementType: movementType || undefined,
    },
    include: {
      item: true,
      createdBy: {
        select: { id: true, name: true, role: true },
      },
      approvedBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMovement(user, data) {
  await assertShopAccess(user, data.shopId);

  const item = await prisma.item.findUnique({ where: { id: data.itemId } });
  if (!item || item.shopId !== data.shopId) {
    throw new ApiError(400, "Item does not belong to this shop");
  }

  if (["DAMAGE_LOSS", "MANUAL_ADJUSTMENT", "STOCK_OUT"].includes(data.movementType) && !data.reason) {
    throw new ApiError(400, "Reason is required for this stock movement");
  }

  const quantityIn = ["STOCK_IN", "RETURN"].includes(data.movementType) ||
    (data.movementType === "MANUAL_ADJUSTMENT" && data.direction === "IN")
    ? data.quantity
    : 0;
  const quantityOut = ["STOCK_OUT", "DAMAGE_LOSS"].includes(data.movementType) ||
    (data.movementType === "MANUAL_ADJUSTMENT" && data.direction === "OUT")
    ? data.quantity
    : 0;

  if (quantityIn > 0 && quantityOut > 0) {
    throw new ApiError(400, "Movement cannot add and remove stock in the same row");
  }

  const movement = await prisma.stockLedger.create({
    data: {
      shopId: data.shopId,
      itemId: data.itemId,
      movementType: data.movementType,
      quantityIn,
      quantityOut,
      reason: data.reason,
      createdById: user.id,
      approvedById: user.role === "OWNER" ? user.id : undefined,
    },
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: data.shopId,
    action: "stock.movement_created",
    entityType: "StockLedger",
    entityId: movement.id,
    newValueJson: movement,
    reason: data.reason,
  });

  return movement;
}
