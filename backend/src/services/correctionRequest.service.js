import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { createNotification, notifyShopOwner } from "./notification.service.js";

const entityLoaders = {
  SALE: (id) => prisma.sale.findUnique({ where: { id }, select: { id: true, shopId: true, saleNumber: true } }),
  DM: (id) => prisma.deliveryMemo.findUnique({ where: { id }, select: { id: true, shopId: true, dmNumber: true } }),
  ORDER: (id) => prisma.order.findUnique({ where: { id }, select: { id: true, shopId: true, orderNumber: true } }),
  STOCK: async (id) => {
    const ledger = await prisma.stockLedger.findUnique({ where: { id }, select: { id: true, shopId: true } });
    if (ledger) return ledger;
    const shop = await prisma.shop.findUnique({ where: { id }, select: { id: true } });
    if (shop) return { id, shopId: id };
    return null;
  },
  PAYMENT: (id) => prisma.payment.findUnique({ where: { id }, select: { id: true, shopId: true } }),
};

async function resolveEntity(entityType, entityId) {
  const loader = entityLoaders[entityType];
  if (!loader) throw new ApiError(400, "Unsupported correction entity type");
  const entity = await loader(entityId);
  if (!entity) throw new ApiError(404, "Correction entity not found");
  return entity;
}

async function getRequestWithAccess(user, id) {
  const request = await prisma.correctionRequest.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!request) throw new ApiError(404, "Correction request not found");
  const entity = await resolveEntity(request.entityType, request.entityId);
  await assertShopAccess(user, entity.shopId);
  return { request, entity };
}

export async function createRequest(user, { entityType, entityId, requestedChangeJson, reason }) {
  const normalizedType = entityType.toUpperCase();
  const entity = await resolveEntity(normalizedType, entityId);
  await assertShopAccess(user, entity.shopId);

  return prisma.$transaction(async (tx) => {
    const request = await tx.correctionRequest.create({
      data: {
        entityType: normalizedType,
        entityId,
        requestedChangeJson,
        reason,
        requestedById: user.id,
      },
      include: { requestedBy: { select: { id: true, name: true } } },
    });

    await notifyShopOwner(tx, {
      shopId: entity.shopId,
      triggerEvent: "correction_request.submitted",
      entityType: "CorrectionRequest",
      entityId: request.id,
      message: `${user.name} requested correction on ${normalizedType}`,
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        shopId: entity.shopId,
        action: "correction.requested",
        entityType: "CorrectionRequest",
        entityId: request.id,
        newValueJson: request,
        reason,
      },
    });

    return { ...request, shopId: entity.shopId };
  });
}

export async function listRequests(user, { shopId, status, entityType }) {
  if (shopId) await assertShopAccess(user, shopId);

  const requests = await prisma.correctionRequest.findMany({
    where: {
      status: status || undefined,
      entityType: entityType?.toUpperCase() || undefined,
      requestedById: user.role === "STAFF" ? user.id : undefined,
    },
    include: {
      requestedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!shopId) return requests;

  const filtered = [];
  for (const request of requests) {
    const entity = await resolveEntity(request.entityType, request.entityId);
    if (entity.shopId === shopId) filtered.push({ ...request, shopId });
  }
  return filtered;
}

export async function approveRequest(user, id) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const { request: existing, entity } = await getRequestWithAccess(user, id);
  if (existing.status !== "PENDING") throw new ApiError(400, "Only pending requests can be approved");

  return prisma.$transaction(async (tx) => {
    const request = await tx.correctionRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
      },
      include: {
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    // Apply the bulk stock entry changes if it is a STOCK request
    if (existing.entityType === "STOCK") {
      const change = existing.requestedChangeJson;
      if (change && Array.isArray(change.entries)) {
        for (const entry of change.entries) {
          await tx.stockLedger.create({
            data: {
              shopId: entity.shopId,
              itemId: entry.itemId,
              movementType: "STOCK_IN",
              quantityIn: entry.quantity,
              quantityOut: 0,
              reason: change.notes || "Bulk stock entry approved",
              createdById: existing.requestedById,
              approvedById: user.id,
            },
          });
        }
      }
    }

    await createNotification(tx, {
      userId: existing.requestedById,
      shopId: entity.shopId,
      triggerEvent: "correction_request.approved",
      entityType: "CorrectionRequest",
      entityId: id,
      message: `Correction request approved for ${existing.entityType}`,
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: entity.shopId,
      action: "correction.approved",
      entityType: "CorrectionRequest",
      entityId: id,
      oldValueJson: existing,
      newValueJson: request,
    });

    return { ...request, shopId: entity.shopId };
  });
}

export async function rejectRequest(user, id, { reason }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const { request: existing, entity } = await getRequestWithAccess(user, id);
  if (existing.status !== "PENDING") throw new ApiError(400, "Only pending requests can be rejected");

  return prisma.$transaction(async (tx) => {
    const request = await tx.correctionRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectedReason: reason,
      },
      include: {
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    await createNotification(tx, {
      userId: existing.requestedById,
      shopId: entity.shopId,
      triggerEvent: "correction_request.rejected",
      entityType: "CorrectionRequest",
      entityId: id,
      message: `Correction request rejected for ${existing.entityType}`,
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: entity.shopId,
      action: "correction.rejected",
      entityType: "CorrectionRequest",
      entityId: id,
      oldValueJson: existing,
      newValueJson: request,
      reason,
    });

    return { ...request, shopId: entity.shopId };
  });
}
