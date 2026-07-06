import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";

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
  if (request.status !== "PENDING") throw new ApiError(400, "Request is already processed");
  if (request.type !== "STOCK_ENTRY") {
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
        const payload = request.payloadJson;
        const entries = payload.entries || [];
        const stockEvents = [];
        for (const entry of entries) {
          const movement = await tx.stockLedger.create({
            data: {
              shopId: request.shopId,
              itemId: entry.itemId,
              movementType: "STOCK_IN",
              quantityIn: entry.quantity,
              quantityOut: 0,
              reason: payload.notes || "Approved Bulk stock entry",
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
              reason: payload.notes || "Approved Bulk stock entry",
            },
          });
          stockEvents.push(createDomainEvent({
            shopId: request.shopId,
            entity: "stock",
            action: "updated",
            entityId: entry.itemId,
            actorUserId: user.id,
            actorRole: user.role,
            visibility: { owners: true, staff: true },
          }));
        }
        if (stockEvents.length > 0) await enqueueManyDomainEvents(tx, stockEvents);
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
