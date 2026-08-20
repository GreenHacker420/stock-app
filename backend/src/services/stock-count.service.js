import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { qty, ZERO } from "../utils/money.js";
import { createApprovalRequest } from "./approval.service.js";
import { createDomainEvent, enqueueDomainEvent } from "./domain-event.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";

function asNumber(value) {
  return Number(value?.toString?.() ?? value ?? 0);
}

async function lockPhysicalItem(tx, shopId, itemId) {
  await tx.$queryRawUnsafe(
    'SELECT id FROM "Item" WHERE id = $1 FOR UPDATE',
    itemId,
  );

  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: { id: true, shopId: true, name: true, status: true },
  });

  if (!item || item.shopId !== shopId) {
    throw new ApiError(400, "Item does not belong to this shop");
  }
  if (item.status !== "ACTIVE") {
    throw new ApiError(400, "Inactive products cannot be physically counted");
  }

  const bundleCount = await tx.itemBundleComponent.count({
    where: { parentItemId: itemId },
  });
  if (bundleCount > 0) {
    throw new ApiError(
      400,
      "Virtual bundle products do not hold direct stock. Count their component products instead.",
    );
  }

  return item;
}

async function getLockedStockSnapshot(tx, shopId, itemId) {
  const [ledger, reservation] = await Promise.all([
    tx.stockLedger.aggregate({
      where: { shopId, itemId },
      _sum: { quantityIn: true, quantityOut: true },
    }),
    tx.stockReservation.aggregate({
      where: { shopId, itemId, status: "ACTIVE" },
      _sum: { reservedQty: true },
    }),
  ]);

  const physical = qty(ledger._sum.quantityIn || 0).minus(
    qty(ledger._sum.quantityOut || 0),
  );
  const reserved = qty(reservation._sum.reservedQty || 0);
  const rawAvailable = physical.minus(reserved);

  return {
    physical,
    reserved,
    available: rawAvailable.lt(ZERO) ? ZERO : rawAvailable,
  };
}

export async function reconcilePhysicalStock(
  user,
  { shopId, itemId, countedPhysical, reason },
) {
  await assertShopAccess(user, shopId);

  const countedNumber = Number(countedPhysical);
  if (!Number.isFinite(countedNumber) || countedNumber < 0) {
    throw new ApiError(400, "Counted physical stock must be zero or greater");
  }
  const counted = qty(countedNumber);

  const adjustmentReason = String(reason || "").trim();
  if (!adjustmentReason) {
    throw new ApiError(400, "Reason is required for a physical stock count");
  }

  return prisma.$transaction(async (tx) => {
    const item = await lockPhysicalItem(tx, shopId, itemId);
    const snapshot = await getLockedStockSnapshot(tx, shopId, itemId);
    const variance = counted.minus(snapshot.physical);
    const rawResultingAvailable = counted.minus(snapshot.reserved);
    const resultingAvailable = rawResultingAvailable.lt(ZERO)
      ? ZERO
      : rawResultingAvailable;
    const reservationShortage = snapshot.reserved.gt(counted)
      ? snapshot.reserved.minus(counted)
      : ZERO;

    if (user.role === "STAFF") {
      const request = await createApprovalRequest(tx, {
        shopId,
        type: "STOCK_ADJUSTMENT",
        entityType: EntityType.ITEM,
        entityId: itemId,
        payloadJson: {
          itemId,
          countedPhysical: asNumber(counted),
          expectedPhysical: asNumber(snapshot.physical),
          expectedReserved: asNumber(snapshot.reserved),
          reason: adjustmentReason,
        },
        reason: adjustmentReason,
        requestedById: user.id,
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          shopId,
          action: AuditAction.ENTRY_REQUESTED,
          entityType: EntityType.APPROVAL_REQUEST,
          entityId: request.id,
          newValueJson: request,
          reason: adjustmentReason,
        },
      });

      return {
        isRequest: true,
        requestId: request.id,
        status: request.status,
        message: "Physical stock count submitted for owner approval.",
        item: { id: item.id, name: item.name },
        currentPhysical: asNumber(snapshot.physical),
        countedPhysical: asNumber(counted),
        reservedStock: asNumber(snapshot.reserved),
        resultingAvailableStock: asNumber(resultingAvailable),
        variance: asNumber(variance),
        reservationShortage: asNumber(reservationShortage),
      };
    }

    let movement = null;
    if (!variance.eq(ZERO)) {
      const addsStock = variance.gt(ZERO);
      movement = await tx.stockLedger.create({
        data: {
          shopId,
          itemId,
          movementType: "MANUAL_ADJUSTMENT",
          quantityIn: addsStock ? variance : ZERO,
          quantityOut: addsStock ? ZERO : variance.abs(),
          reason: adjustmentReason,
          createdById: user.id,
          approvedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          shopId,
          action: AuditAction.MOVEMENT_CREATED,
          entityType: EntityType.STOCK_LEDGER,
          entityId: movement.id,
          newValueJson: movement,
          reason: adjustmentReason,
        },
      });

      await enqueueDomainEvent(
        tx,
        createDomainEvent({
          shopId,
          entity: "stock",
          action: "updated",
          entityId: itemId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }),
      );
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId,
        action: AuditAction.RECONCILED,
        entityType: EntityType.ITEM,
        entityId: itemId,
        newValueJson: {
          previousPhysical: asNumber(snapshot.physical),
          countedPhysical: asNumber(counted),
          reservedStock: asNumber(snapshot.reserved),
          variance: asNumber(variance),
        },
        reason: adjustmentReason,
      },
    });

    return {
      isRequest: false,
      item: { id: item.id, name: item.name },
      currentPhysical: asNumber(snapshot.physical),
      countedPhysical: asNumber(counted),
      physicalStock: asNumber(counted),
      reservedStock: asNumber(snapshot.reserved),
      availableStock: asNumber(resultingAvailable),
      variance: asNumber(variance),
      reservationShortage: asNumber(reservationShortage),
      movement,
    };
  });
}
