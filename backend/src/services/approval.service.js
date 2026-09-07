import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import * as rateChangeService from "./rateChange.service.js";
import * as correctionService from "./correction.service.js";
import { readThroughDomainCache, invalidateDomainReadCache } from "../cache/domain-read-cache.js";

export async function createApprovalRequest(tx, { shopId, type, entityType, entityId, payloadJson, reason, requestedById, targetAdminId }) {
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

  const visibility = targetAdminId
    ? { owners: false, staff: false, targetUserIds: [targetAdminId] }
    : { owners: true, staff: false };

  await enqueueDomainEvent(tx, createDomainEvent({
    shopId,
    entity: "approval",
    action: "created",
    entityId: request.id,
    actorUserId: requestedById,
    actorRole: "STAFF",
    visibility,
    notification: {
      sendPush: true,
      title: "New approval request",
      body: `New approval request (${type}) from ${request.requestedBy.name}`,
      severity: "warning",
      deepLink: `stock://approvals/${request.id}`,
    },
  }));

  await invalidateDomainReadCache({ shopId, domains: ["approvals"] });

  return request;
}

export async function listApprovalRequests(user, { shopId, status, type }) {
  await assertShopAccess(user, shopId);
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  return readThroughDomainCache({
    shopId,
    domain: "approvals",
    query: { status, type },
    loader: () =>
      prisma.approvalRequest.findMany({
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
      }),
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

  if (request.type === "RATE_CHANGE") {
    const res = status === "APPROVED"
      ? await rateChangeService.approveRateChangeRequest(user, id)
      : await rateChangeService.rejectRateChangeRequest(user, id);
    await invalidateDomainReadCache({ shopId: request.shopId, domains: ["approvals"] });
    return res;
  }

  if (
    request.type === "SALE_CORRECTION" ||
    request.type === "SALE_CANCELLATION" ||
    request.type === "DM_CANCELLATION" ||
    request.type === "STOCK_ADJUSTMENT" ||
    request.type === "PAYMENT_CORRECTION"
  ) {
    const res = status === "APPROVED"
      ? await correctionService.approveCorrectionRequest(user, id)
      : await correctionService.rejectCorrectionRequest(user, id, rejectedReason);
    await invalidateDomainReadCache({ shopId: request.shopId, domains: ["approvals"] });
    return res;
  }

  if (request.type !== "STOCK_ENTRY") {
    throw new ApiError(400, `Unsupported approval type: ${request.type}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.approvalRequest.update({
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
      visibility: { owners: false, staff: false, targetUserIds: [request.requestedById] },
      requestedById: request.requestedById,
      notification: {
        sendPush: true,
        title: status === "APPROVED" ? "Approval request approved" : "Approval request rejected",
        body: status === "APPROVED"
          ? `Your approval request for (${request.type}) has been approved.`
          : `Your approval request for (${request.type}) was rejected${rejectedReason ? `: ${rejectedReason}` : ""}.`,
        severity: status === "APPROVED" ? "success" : "warning",
        deepLink: `stock://approvals/${request.id}`,
      },
    }));

    if (status === "APPROVED") {
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

    await writeAuditLog({
      userId: user.id,
      shopId: request.shopId,
      action: status,
      entityType: EntityType.APPROVAL_REQUEST,
      entityId: id,
      oldValueJson: request,
      newValueJson: result,
      reason: rejectedReason,
    });

    return result;
  });

  await invalidateDomainReadCache({ shopId: request.shopId, domains: ["approvals"] });

  return updated;
}

export async function bulkRespondToRequests(user, { ids, status, rejectedReason }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, "At least one approval ID must be provided");
  }

  const results = {
    processed: 0,
    successIds: [],
    failed: [],
  };

  const shopIdsToInvalidate = new Set();

  for (const id of ids) {
    try {
      const updated = await respondToRequest(user, id, { status, rejectedReason });
      results.successIds.push(id);
      results.processed += 1;
      if (updated?.shopId) shopIdsToInvalidate.add(updated.shopId);
    } catch (err) {
      results.failed.push({ id, error: err.message || "Failed to process request" });
    }
  }

  for (const shopId of shopIdsToInvalidate) {
    await invalidateDomainReadCache({ shopId, domains: ["approvals"] });
  }

  return results;
}
