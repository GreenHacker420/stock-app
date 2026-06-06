import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { notifyShopOwner } from "./notification.service.js";

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

  await notifyShopOwner(tx, {
    shopId,
    triggerEvent: "approval_request.submitted",
    entityType: "ApprovalRequest",
    entityId: request.id,
    message: `New approval request (${type}) from ${request.requestedBy.name}`,
  });

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

// NOTE: The actual application of the approved change should be handled by 
// specialized handlers in each module (Sale, Stock, etc.)
// This service provides the generic approval/rejection wrapper.
export async function respondToRequest(user, id, { status, rejectedReason }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) throw new ApiError(404, "Request not found");
  if (request.status !== "PENDING") throw new ApiError(400, "Request is already processed");

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

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: request.shopId,
      action: `approval.${status.toLowerCase()}`,
      entityType: "ApprovalRequest",
      entityId: id,
      oldValueJson: request,
      newValueJson: updated,
      reason: rejectedReason,
    });

    return updated;
  });
}
