import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { notifyShopOwner } from "./notification.service.js";
import { qty, ZERO } from "../utils/money.js";
import { createApprovalRequest } from "./approval.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";

function addRequirement(requirements, itemId, quantity) {
  const next = qty(quantity);
  if (next.lte(ZERO)) return;
  const current = requirements.get(itemId) || ZERO;
  requirements.set(itemId, current.plus(next));
}

export async function expandStockRequirements(tx, shopId, items) {
  const itemIds = [...new Set(items.map((item) => item.itemId).filter(Boolean))];
  if (itemIds.length === 0) return [];

  const components = await tx.itemBundleComponent.findMany({
    where: { parentItemId: { in: itemIds } },
    include: {
      parentItem: { select: { id: true, shopId: true, name: true, status: true } },
      componentItem: { select: { id: true, shopId: true, name: true, status: true } },
    },
    orderBy: { componentItemId: "asc" },
  });

  const byParent = new Map();
  for (const component of components) {
    if (component.parentItem.shopId !== shopId || component.componentItem.shopId !== shopId) {
      throw new ApiError(400, "Bundle components must belong to the same shop");
    }
    if (component.parentItem.status !== "ACTIVE" || component.componentItem.status !== "ACTIVE") {
      throw new ApiError(400, `Bundle "${component.parentItem.name}" contains an inactive product`);
    }
    const list = byParent.get(component.parentItemId) || [];
    list.push(component);
    byParent.set(component.parentItemId, list);
  }

  const requirements = new Map();
  for (const item of items) {
    const lineQty = qty(item.quantity ?? item.quantityOrdered);
    const bundleComponents = byParent.get(item.itemId);
    if (bundleComponents?.length) {
      for (const component of bundleComponents) {
        addRequirement(requirements, component.componentItemId, lineQty.times(qty(component.quantity)));
      }
    } else {
      addRequirement(requirements, item.itemId, lineQty);
    }
  }

  return Array.from(requirements.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
}

async function assertNoVirtualBundleItems(tx, itemIds, message) {
  const count = await tx.itemBundleComponent.count({ where: { parentItemId: { in: itemIds } } });
  if (count > 0) throw new ApiError(400, message);
}

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

export async function listMovements(user, { shopId, itemId, movementType, page = 1, limit = 50 }) {
  await assertShopAccess(user, shopId);
  const take = Math.min(Number(limit) || 50, 500);
  const skip = (Math.max(Number(page), 1) - 1) * take;

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
    skip,
    take,
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

  if (user.role === "STAFF") {
    throw new ApiError(403, "Direct stock adjustment is restricted to owners. Staff must submit updates via Stock Entry requests.");
  }

  const item = await prisma.item.findUnique({ where: { id: data.itemId } });
  if (!item || item.shopId !== data.shopId) {
    throw new ApiError(400, "Item does not belong to this shop");
  }
  const bundleCount = await prisma.itemBundleComponent.count({ where: { parentItemId: item.id } });
  if (bundleCount > 0) {
    throw new ApiError(400, "Virtual bundle products do not hold direct stock. Adjust component stock instead.");
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
  await assertNoVirtualBundleItems(
    prisma,
    itemIds,
    "Virtual bundle products do not hold direct stock. Add stock to their component products instead."
  );

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
  if (orderItems.length === 0) return;

  // 1. Retrieve component requirements
  const requirements = await expandStockRequirements(tx, shopId, orderItems);
  const componentItemIds = requirements.map((r) => r.itemId);
  const parentItemIds = orderItems.map((item) => item.itemId);
  const allItemIdsToLock = [...new Set([...parentItemIds, ...componentItemIds])];

  // 2. Pessimistic Row Lock on all involved Item rows
  await tx.$queryRawUnsafe(
    `SELECT id FROM "Item" WHERE id IN (${allItemIdsToLock.map((_, i) => `$${i + 1}`).join(", ")}) FOR UPDATE`,
    ...allItemIdsToLock
  );

  // 3. Verify stock availability at the component level
  for (const req of requirements) {
    const { itemId, quantity } = req;

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
    const needed = qty(quantity);

    if (available.lt(needed)) {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      throw new ApiError(
        400,
        `Insufficient stock for item "${item?.name || itemId}". Physical: ${physical.toString()}, Reserved: ${reserved.toString()}, Available: ${available.toString()}, Requested: ${needed.toString()}`
      );
    }
  }

  // 4. Create stock reservations
  for (const orderItem of orderItems) {
    const { itemId, quantityOrdered } = orderItem;

    const bundleComponents = await tx.itemBundleComponent.findMany({
      where: { parentItemId: itemId }
    });

    if (bundleComponents.length > 0) {
      for (const component of bundleComponents) {
        await tx.stockReservation.create({
          data: {
            shopId,
            orderId,
            orderItemId: orderItem.id,
            itemId: component.componentItemId,
            reservedQty: qty(quantityOrdered).times(qty(component.quantity)),
            packedQty: ZERO,
            status: "ACTIVE"
          }
        });
      }
    } else {
      await tx.stockReservation.create({
        data: {
          shopId,
          orderId,
          orderItemId: orderItem.id,
          itemId,
          reservedQty: qty(quantityOrdered),
          packedQty: ZERO,
          status: "ACTIVE"
        }
      });
    }
  }
}

export async function checkAndLockAvailableStock(tx, shopId, items, { excludeOrderId } = {}) {
  const requirements = await expandStockRequirements(tx, shopId, items);
  const itemIds = requirements.map((item) => item.itemId);
  if (itemIds.length === 0) return;

  // 1. Pessimistic Row Lock
  await tx.$queryRawUnsafe(
    `SELECT id FROM "Item" WHERE id IN (${itemIds.map((_, i) => `$${i + 1}`).join(", ")}) FOR UPDATE`,
    ...itemIds
  );

  // 2. Verify availability
  for (const itemEntry of requirements) {
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

export async function transferStock(user, { sourceShopId, targetShopId, itemId, quantity, reason }) {
  // Validate shop accesses
  await assertShopAccess(user, sourceShopId);
  await assertShopAccess(user, targetShopId);

  if (sourceShopId === targetShopId) {
    throw new ApiError(400, "Source and target shops must be different");
  }

  // Find source item
  const sourceItem = await prisma.item.findUnique({
    where: { id: itemId }
  });

  if (!sourceItem || sourceItem.shopId !== sourceShopId) {
    throw new ApiError(400, "Source item not found in the source shop");
  }

  if (sourceItem.status !== "ACTIVE") {
    throw new ApiError(400, "Source item is inactive");
  }
  const bundleCount = await prisma.itemBundleComponent.count({ where: { parentItemId: sourceItem.id } });
  if (bundleCount > 0) {
    throw new ApiError(400, "Virtual bundle products cannot be transferred directly. Transfer component products instead.");
  }

  if (!sourceItem.sku) {
    throw new ApiError(400, "Cannot transfer item without an SKU code");
  }

  const transferReason = reason || `Stock transfer from ${sourceShopId} to ${targetShopId}`;

  // Execute transfer inside transaction
  return prisma.$transaction(async (tx) => {
    // 0. Reject if quantity exceeds available (physical - reserved) stock
    await checkAndLockAvailableStock(tx, sourceShopId, [{ itemId: sourceItem.id, quantity }]);

    let targetItem = await tx.item.findFirst({
      where: { shopId: targetShopId, sku: sourceItem.sku, status: "ACTIVE" }
    });
    let targetItemCreated = false;

    if (!targetItem) {
      targetItem = await tx.item.create({
        data: {
          shopId: targetShopId,
          name: sourceItem.name,
          sku: sourceItem.sku,
          categoryId: sourceItem.categoryId,
          unit: sourceItem.unit,
          defaultSellingPrice: sourceItem.defaultSellingPrice,
          minimumAllowedPrice: sourceItem.minimumAllowedPrice,
          purchasePrice: sourceItem.purchasePrice,
          mrp: sourceItem.mrp,
          minimumStock: sourceItem.minimumStock,
          imageUrl: sourceItem.imageUrl,
          status: "ACTIVE",
        }
      });
      targetItemCreated = true;
    }

    // 1. Stock Out from source shop
    const sourceMovement = await tx.stockLedger.create({
      data: {
        shopId: sourceShopId,
        itemId: sourceItem.id,
        movementType: "STOCK_OUT",
        quantityIn: 0,
        quantityOut: quantity,
        reason: `Transfer to shop ${targetShopId}. ${transferReason}`,
        createdById: user.id,
        approvedById: user.role === "OWNER" ? user.id : undefined,
      }
    });

    // 2. Stock In to target shop
    const targetMovement = await tx.stockLedger.create({
      data: {
        shopId: targetShopId,
        itemId: targetItem.id,
        movementType: "STOCK_IN",
        quantityIn: quantity,
        quantityOut: 0,
        reason: `Transfer from shop ${sourceShopId}. ${transferReason}`,
        createdById: user.id,
        approvedById: user.role === "OWNER" ? user.id : undefined,
      }
    });

    // 3. Write audit log
    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: sourceShopId,
        action: AuditAction.MOVEMENT_CREATED,
        entityType: EntityType.STOCK_LEDGER,
        entityId: sourceMovement.id,
        newValueJson: { sourceMovement, targetMovement },
        reason: transferReason,
      }
    });

    const events = [
      createDomainEvent({
        shopId: sourceShopId,
        entity: "stock",
        action: "updated",
        entityId: sourceItem.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: targetShopId,
        entity: "stock",
        action: "updated",
        entityId: targetItem.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
    ];
    if (targetItemCreated) {
      events.push(createDomainEvent({
        shopId: targetShopId,
        entity: "item",
        action: "created",
        entityId: targetItem.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }));
    }
    await enqueueManyDomainEvents(tx, events);

    return { sourceMovement, targetMovement };
  });
}
