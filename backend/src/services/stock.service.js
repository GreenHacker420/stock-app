import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { notifyShopOwner } from "./notification.service.js";
import { qty, ZERO } from "../utils/money.js";
import { createApprovalRequest } from "./approval.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";

export async function getCurrentStock(user, { shopId, itemId }) {
  await assertShopAccess(user, shopId);

  // 1. Get active items
  const items = await prisma.item.findMany({
    where: {
      shopId,
      status: "ACTIVE",
      id: itemId || undefined,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      minimumStock: true,
    },
  });

  // 2. Group by stock ledger to get physical stock sums
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

  const ledgerMap = new Map(
    rows.map((row) => [
      row.itemId,
      {
        quantityIn: Number(row._sum.quantityIn || 0),
        quantityOut: Number(row._sum.quantityOut || 0),
      },
    ])
  );

  const reservationRows = await prisma.stockReservation.groupBy({
    by: ["itemId"],
    where: {
      shopId,
      itemId: itemId || undefined,
      status: "ACTIVE",
    },
    _sum: { reservedQty: true },
  });
  const reservationMap = new Map(
    reservationRows.map((row) => [row.itemId, Number(row._sum.reservedQty || 0)])
  );

  return items.map((item) => {
    const ledger = ledgerMap.get(item.id) || { quantityIn: 0, quantityOut: 0 };
    const physicalStock = ledger.quantityIn - ledger.quantityOut;
    const reservedStock = reservationMap.get(item.id) || 0;
    const availableStock = Math.max(0, physicalStock - reservedStock);
    return {
      item,
      quantityIn: ledger.quantityIn,
      quantityOut: ledger.quantityOut,
      currentQuantity: physicalStock,
      physicalStock,
      reservedStock,
      availableStock,
      isLowStock: availableStock <= Number(item.minimumStock),
    };
  });
}

export async function listMovements(user, { shopId, itemId, movementType }) {
  await assertShopAccess(user, shopId);

  const movements = await prisma.stockLedger.findMany({
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

  // Attach reference details manually since Prisma doesn't support polymorphic relations natively
  const results = [];
  for (const m of movements) {
    const movement = { ...m };
    if (m.referenceType === "SALE" && m.referenceId) {
      movement.sale = await prisma.sale.findUnique({
        where: { id: m.referenceId },
        select: { id: true, saleNumber: true },
      });
    } else if (m.referenceType === "DM" && m.referenceId) {
      movement.deliveryMemo = await prisma.deliveryMemo.findUnique({
        where: { id: m.referenceId },
        select: { id: true, dmNumber: true },
      });
    } else if (m.referenceType === "ORDER" && m.referenceId) {
      movement.order = await prisma.order.findUnique({
        where: { id: m.referenceId },
        select: { id: true, orderNumber: true },
      });
    }
    results.push(movement);
  }

  return results;
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

  return prisma.$transaction(async (tx) => {
    const movement = await tx.stockLedger.create({
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

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: data.shopId,
        action: AuditAction.MOVEMENT_CREATED,
        entityType: EntityType.STOCK_LEDGER,
        entityId: movement.id,
        newValueJson: movement,
        reason: data.reason,
      },
    });

    await enqueueDomainEvent(tx, {
      shopId: data.shopId,
      entity: "stock",
      action: "updated",
      entityId: data.itemId,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });

    return movement;
  });
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
      const approvalReq = await createApprovalRequest(tx, {
        shopId: data.shopId,
        type: "STOCK_ENTRY",
        entityType: EntityType.SHOP,
        entityId: data.shopId,
        payloadJson: {
          entries: data.entries,
          notes: data.notes || "Bulk stock entry submission by staff",
        },
        reason: data.notes || "Bulk stock entry submission by staff",
        requestedById: user.id,
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          shopId: data.shopId,
          action: AuditAction.ENTRY_REQUESTED,
          entityType: EntityType.APPROVAL_REQUEST,
          entityId: approvalReq.id,
          newValueJson: approvalReq,
          reason: data.notes || "Bulk stock entry submission by staff",
        },
      });

      return approvalReq;
    });

    return {
      isRequest: true,
      requestId: request.id,
      status: request.status,
      message: "Stock update submitted for owner approval.",
    };
  }

  // Create stock movements inside a transaction for non-staff (owner)
  const movements = await prisma.$transaction(async (tx) => {
    const list = [];
    const events = [];
    for (const entry of data.entries) {
      const isPositive = Number(entry.quantity) > 0;
      const movement = await tx.stockLedger.create({
        data: {
          shopId: data.shopId,
          itemId: entry.itemId,
          movementType: isPositive ? "STOCK_IN" : "MANUAL_ADJUSTMENT",
          quantityIn: isPositive ? Number(entry.quantity) : 0,
          quantityOut: isPositive ? 0 : Math.abs(Number(entry.quantity)),
          reason: data.notes || (isPositive ? "Bulk stock entry via app" : "Manual adjustment via app"),
          createdById: user.id,
          approvedById: user.id,
        },
      });
      list.push(movement);

      events.push(createDomainEvent({
        shopId: data.shopId,
        entity: "stock",
        action: "updated",
        entityId: entry.itemId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }));
    }
    await enqueueManyDomainEvents(tx, events);
    return list;
  });

  // Write audit logs
  for (const movement of movements) {
    await writeAuditLog({
      userId: user.id,
      shopId: data.shopId,
      action: AuditAction.MOVEMENT_CREATED,
      entityType: EntityType.STOCK_LEDGER,
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
        reservedQty: needed,
        packedQty: ZERO,
        status: "ACTIVE"
      }
    });
  }
}

export async function checkAndLockAvailableStock(tx, shopId, items, { excludeOrderId } = {}) {
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
      where: {
        shopId,
        itemId,
        status: "ACTIVE",
        orderId: excludeOrderId ? { not: excludeOrderId } : undefined,
      },
      _sum: { reservedQty: true }
    });
    const reserved = qty(reservationSum._sum.reservedQty || 0);
    const available = physical.minus(reserved);
    const needed = qty(quantity);

    if (available.lt(needed)) {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      throw new ApiError(
        400,
        `Insufficient available stock for item "${item?.name || itemId}". Physical: ${physical.toString()}, Reserved: ${reserved.toString()}, Available: ${available.toString()}, Requested: ${needed.toString()}`
      );
    }
  }
}

export const checkAndLockStockForWalkin = checkAndLockAvailableStock;
