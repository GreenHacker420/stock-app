import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { notifyShopOwner } from "./notification.service.js";
import { qty, ZERO } from "../utils/money.js";
import { Prisma } from "../generated/prisma/index.js";

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

export async function bulkStockEntry(user, data) {
  await assertShopAccess(user, data.shopId);

  // Validate all items exist and belong to the shop
  const itemIds = data.entries.map((e) => e.itemId);
  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      shopId: data.shopId,
    },
  });

  if (items.length !== itemIds.length) {
    throw new ApiError(400, "One or more items do not belong to this shop");
  }

  // If user is staff, direct update by the staff should go to the owner approval
  if (user.role === "STAFF") {
    const request = await prisma.$transaction(async (tx) => {
      const correctionReq = await tx.correctionRequest.create({
        data: {
          entityType: "STOCK",
          entityId: data.shopId, // resolves via the STOCK loader
          requestedChangeJson: {
            entries: data.entries,
            notes: data.notes || "Bulk stock entry submission by staff",
          },
          reason: data.notes || "Bulk stock entry submission by staff",
          requestedById: user.id,
        },
        include: { requestedBy: { select: { id: true, name: true } } },
      });

      await notifyShopOwner(tx, {
        shopId: data.shopId,
        triggerEvent: "correction_request.submitted",
        entityType: "CorrectionRequest",
        entityId: correctionReq.id,
        message: `${user.name} submitted a stock update request for approval`,
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          shopId: data.shopId,
          action: "correction.requested",
          entityType: "CorrectionRequest",
          entityId: correctionReq.id,
          newValueJson: correctionReq,
          reason: data.notes || "Bulk stock entry submission by staff",
        },
      });

      return correctionReq;
    });

    return {
      isRequest: true,
      requestId: request.id,
      status: request.status,
      message: "Stock update submitted for owner approval.",
    };
  }

  // Create stock movements inside a transaction for non-staff (owner/admin)
  const movements = await prisma.$transaction(async (tx) => {
    const list = [];
    for (const entry of data.entries) {
      const movement = await tx.stockLedger.create({
        data: {
          shopId: data.shopId,
          itemId: entry.itemId,
          movementType: "STOCK_IN",
          quantityIn: entry.quantity,
          quantityOut: 0,
          reason: data.notes || "Bulk stock entry via app",
          createdById: user.id,
          approvedById: user.role === "OWNER" ? user.id : undefined,
        },
      });
      list.push(movement);
    }
    return list;
  });

  // Write audit logs
  for (const movement of movements) {
    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: data.shopId,
      action: "stock.movement_created",
      entityType: "StockLedger",
      entityId: movement.id,
      newValueJson: movement,
      reason: data.notes || "Bulk stock entry via app",
    });
  }

  return movements;
}

export async function reserveStockForOrder(tx, shopId, orderId, orderItems) {
  const itemIds = orderItems.map((item) => item.itemId);
  if (itemIds.length === 0) return;

  // 1. Pessimistic Row Lock on Item rows
  await tx.$queryRawUnsafe(
    `SELECT id FROM "Item" WHERE id IN (${itemIds.map((_, i) => `$${i + 1}`).join(", ")}) FOR UPDATE`,
    ...itemIds
  );

  // 2. Fetch stock levels and active reservations for all items
  for (const orderItem of orderItems) {
    const { itemId, quantityOrdered } = orderItem;

    // A. Physical stock (quantityIn - quantityOut)
    const ledgerSum = await tx.stockLedger.aggregate({
      where: { shopId, itemId },
      _sum: {
        quantityIn: true,
        quantityOut: true,
      }
    });
    const quantityIn = qty(ledgerSum._sum.quantityIn || 0);
    const quantityOut = qty(ledgerSum._sum.quantityOut || 0);
    const physical = quantityIn.minus(quantityOut);

    // B. Active reservations (status = ACTIVE)
    const reservationSum = await tx.stockReservation.aggregate({
      where: {
        shopId,
        itemId,
        status: "ACTIVE"
      },
      _sum: {
        reservedQty: true
      }
    });
    const reserved = qty(reservationSum._sum.reservedQty || 0);

    // C. Available stock
    const available = physical.minus(reserved);
    const needed = qty(quantityOrdered);

    if (available.lt(needed)) {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      throw new ApiError(
        400,
        `Insufficient stock for item "${item?.name || itemId}". Physical: ${physical.toString()}, Reserved: ${reserved.toString()}, Available: ${available.toString()}, Requested: ${needed.toString()}`
      );
    }

    // D. Create stock reservation
    await tx.stockReservation.create({
      data: {
        shopId,
        orderId,
        orderItemId: orderItem.id,
        itemId,
        originalQty: needed,
        reservedQty: needed,
        packedQty: ZERO,
        status: "ACTIVE"
      }
    });
  }
}

export async function checkAndLockStockForWalkin(tx, shopId, items) {
  const itemIds = items.map((item) => item.itemId);
  if (itemIds.length === 0) return;

  // 1. Pessimistic Row Lock
  await tx.$queryRawUnsafe(
    `SELECT id FROM "Item" WHERE id IN (${itemIds.map((_, i) => `$${i + 1}`).join(", ")}) FOR UPDATE`,
    ...itemIds
  );

  // 2. Verify availability
  for (const itemEntry of items) {
    const { itemId, quantity } = itemEntry;

    const ledgerSum = await tx.stockLedger.aggregate({
      where: { shopId, itemId },
      _sum: {
        quantityIn: true,
        quantityOut: true,
      }
    });
    const physical = qty(ledgerSum._sum.quantityIn || 0).minus(qty(ledgerSum._sum.quantityOut || 0));

    const reservationSum = await tx.stockReservation.aggregate({
      where: { shopId, itemId, status: "ACTIVE" },
      _sum: { reservedQty: true }
    });
    const reserved = qty(reservationSum._sum.reservedQty || 0);
    const available = physical.minus(reserved);
    const needed = qty(quantity);

    if (available.lt(needed)) {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      throw new ApiError(
        400,
        `Insufficient stock for walk-in item "${item?.name || itemId}". Available: ${available.toString()}, Requested: ${needed.toString()}`
      );
    }
  }
}

