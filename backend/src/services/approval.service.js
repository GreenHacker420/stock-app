import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { qty, ZERO } from "../utils/money.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";

function payloadObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function applyApprovedStockEntry(tx, request, user) {
  const payload = payloadObject(request.payloadJson);
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const stockEvents = [];

  for (const entry of entries) {
    const quantity = Number(entry?.quantity);
    if (!entry?.itemId || !Number.isFinite(quantity) || quantity === 0) {
      throw new ApiError(400, "Stock entry approval contains an invalid quantity");
    }

    const isPositive = quantity > 0;
    const movement = await tx.stockLedger.create({
      data: {
        shopId: request.shopId,
        itemId: entry.itemId,
        movementType: isPositive ? "STOCK_IN" : "MANUAL_ADJUSTMENT",
        quantityIn: isPositive ? quantity : 0,
        quantityOut: isPositive ? 0 : Math.abs(quantity),
        reason:
          payload.notes ||
          (isPositive ? "Approved bulk stock entry" : "Approved manual stock reduction"),
        createdById: request.requestedById,
        approvedById: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: request.shopId,
        action: AuditAction.MOVEMENT_CREATED,
        entityType: EntityType.STOCK_LEDGER,
        entityId: movement.id,
        newValueJson: movement,
        reason:
          payload.notes ||
          (isPositive ? "Approved bulk stock entry" : "Approved manual stock reduction"),
      },
    });

    stockEvents.push(
      createDomainEvent({
        shopId: request.shopId,
        entity: "stock",
        action: "updated",
        entityId: entry.itemId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
    );
  }

  if (stockEvents.length > 0) {
    await enqueueManyDomainEvents(tx, stockEvents);
  }
}

async function applyApprovedPhysicalCount(tx, request, user) {
  const payload = payloadObject(request.payloadJson);
  const itemId = String(payload.itemId || "");
  const countedNumber = Number(payload.countedPhysical);
  const expectedNumber = Number(payload.expectedPhysical);

  if (
    !itemId ||
    !Number.isFinite(countedNumber) ||
    countedNumber < 0 ||
    !Number.isFinite(expectedNumber)
  ) {
    throw new ApiError(400, "Physical stock approval contains an invalid count snapshot");
  }

  await tx.$queryRawUnsafe(
    'SELECT id FROM "Item" WHERE id = $1 FOR UPDATE',
    itemId,
  );

  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: { id: true, shopId: true, status: true },
  });
  if (!item || item.shopId !== request.shopId) {
    throw new ApiError(400, "Physical stock item no longer belongs to this shop");
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

  const ledger = await tx.stockLedger.aggregate({
    where: { shopId: request.shopId, itemId },
    _sum: { quantityIn: true, quantityOut: true },
  });
  const currentPhysical = qty(ledger._sum.quantityIn || 0).minus(
    qty(ledger._sum.quantityOut || 0),
  );
  const expectedPhysical = qty(expectedNumber);

  if (!currentPhysical.eq(expectedPhysical)) {
    throw new ApiError(
      409,
      "Stock changed since this physical count was submitted. Please recount and submit it again.",
    );
  }

  const countedPhysical = qty(countedNumber);
  const variance = countedPhysical.minus(currentPhysical);
  if (variance.eq(ZERO)) return;

  const addsStock = variance.gt(ZERO);
  const reason = String(payload.reason || request.reason || "Approved physical stock count");
  const movement = await tx.stockLedger.create({
    data: {
      shopId: request.shopId,
      itemId,
      movementType: "MANUAL_ADJUSTMENT",
      quantityIn: addsStock ? variance : ZERO,
      quantityOut: addsStock ? ZERO : variance.abs(),
      reason,
      createdById: request.requestedById,
      approvedById: user.id,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: user.id,
      shopId: request.shopId,
      action: AuditAction.MOVEMENT_CREATED,
      entityType: EntityType.STOCK_LEDGER,
      entityId: movement.id,
      newValueJson: movement,
      reason,
    },
  });

  await enqueueDomainEvent(
    tx,
    createDomainEvent({
      shopId: request.shopId,
      entity: "stock",
      action: "updated",
      entityId: itemId,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    }),
  );
}

export async function createApprovalRequest(tx, { shopId, type, entityType, entityId, payloadJson, reason, requestedById }) {
  const request = await tx.approvalRequest.create({
    data: {
      shopId,
      type,
      entityType,
      entityId,
      payloadJson,
      reason,
      requestedById,
      status: "PENDING",
    },
    include: { requestedBy: { select: { id: true, name: true } } },
  });

  await enqueueDomainEvent(tx, createDomainEvent({
    shopId,
    entity: "approval",
    action: "created",
    entityId: request.id,
    actorUserId: requestedById,
    actorRole: "STAFF",
    visibility: { owners: true, staff: false },
    notification: {
      sendPush: true,
      title: "New approval request",
      body: `New approval request (${type}) from ${request.requestedBy.name}`,
      severity: "warning",
      deepLink: `stock://approvals/${request.id}`,
    },
  }));

  return request;
}

export async function listApprovalRequests(user, { shopId, status, type }) {
  await assertShopAccess(user, shopId);
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  return prisma.approvalRequest.findMany({
    where: {
      shopId,
      status: status || undefined,
      type: type || undefined,
    },
    include: {
      requestedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getApprovalRequest(user, id) {
  const request = await prisma.approvalRequest.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  if (!request) throw new ApiError(404, "Approval request not found");
  await assertShopAccess(user, request.shopId);
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  return request;
}

export async function respondToRequest(user, id, { status, rejectedReason }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) throw new ApiError(404, "Request not found");
  await assertShopAccess(user, request.shopId);
  if (request.status !== "PENDING") throw new ApiError(400, "Request is already processed");
  if (!["STOCK_ENTRY", "STOCK_ADJUSTMENT"].includes(request.type)) {
    throw new ApiError(400, "This approval type requires a specialized handler.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.approvalRequest.update({
      where: { id },
      data: {
        status,
        approvedById: user.id,
        approvedAt: new Date(),
        rejectedReason: status === "REJECTED" ? rejectedReason : undefined,
      },
    });

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId: request.shopId,
      entity: "approval",
      action: status.toLowerCase(),
      entityId: request.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true, targetUserIds: [request.requestedById] },
      notification: {
        sendPush: true,
        title: `Approval request ${status.toLowerCase()}`,
        body: `Your approval request for (${request.type}) has been ${status.toLowerCase()}${status === "REJECTED" && rejectedReason ? `: ${rejectedReason}` : ""}.`,
        severity: status === "APPROVED" ? "success" : "critical",
        deepLink: `stock://approvals/${request.id}`,
      },
    }));

    if (status === "APPROVED") {
      if (request.type === "STOCK_ENTRY") {
        await applyApprovedStockEntry(tx, request, user);
      } else if (request.type === "STOCK_ADJUSTMENT") {
        await applyApprovedPhysicalCount(tx, request, user);
      }
    }

    await writeAuditLog({
      userId: user.id,
      shopId: request.shopId,
      action: status,
      entityType: EntityType.APPROVAL_REQUEST,
      entityId: id,
      oldValueJson: request,
      newValueJson: updated,
      reason: rejectedReason,
    });

    return updated;
  });
}
