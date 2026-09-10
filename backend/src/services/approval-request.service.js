import { createDomainEvent, enqueueDomainEvent } from "./domain-event.service.js";
import { invalidateDomainReadCache } from "../cache/domain-read-cache.js";

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
