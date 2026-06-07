import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { EntityType, ApprovalType, AuditAction } from "../generated/prisma/index.js";
import { createApprovalRequest } from "./approval.service.js";

function mapEntityType(clientType) {
  switch (clientType) {
    case "SALE": return EntityType.SALE;
    case "DM": return EntityType.DELIVERY_MEMO;
    case "ORDER": return EntityType.ORDER;
    case "STOCK": return EntityType.SHOP;
    case "PAYMENT": return EntityType.PAYMENT;
    default: throw new ApiError(400, `Unsupported entity type: ${clientType}`);
  }
}

function mapApprovalType(clientType, requestedChangeJson) {
  const isCancel = requestedChangeJson?.action === "CANCEL" || requestedChangeJson?.status === "CANCELLED";
  switch (clientType) {
    case "SALE": return isCancel ? ApprovalType.SALE_CANCELLATION : ApprovalType.SALE_CORRECTION;
    case "DM": return ApprovalType.DM_CANCELLATION;
    case "ORDER": return ApprovalType.SALE_CORRECTION;
    case "STOCK": return ApprovalType.STOCK_ADJUSTMENT;
    case "PAYMENT": return ApprovalType.PAYMENT_CORRECTION;
    default: throw new ApiError(400, `Unsupported entity type: ${clientType}`);
  }
}

export async function createCorrectionRequest(user, { entityType, entityId, requestedChangeJson, reason }) {
  const pEntityType = mapEntityType(entityType);
  const pApprovalType = mapApprovalType(entityType, requestedChangeJson);

  let shopId;
  if (pEntityType === EntityType.SALE) {
    const record = await prisma.sale.findUnique({ where: { id: entityId } });
    if (!record) throw new ApiError(404, "Sale not found");
    shopId = record.shopId;
  } else if (pEntityType === EntityType.DELIVERY_MEMO) {
    const record = await prisma.deliveryMemo.findUnique({ where: { id: entityId } });
    if (!record) throw new ApiError(404, "Delivery Memo not found");
    shopId = record.shopId;
  } else if (pEntityType === EntityType.ORDER) {
    const record = await prisma.order.findUnique({ where: { id: entityId } });
    if (!record) throw new ApiError(404, "Order not found");
    shopId = record.shopId;
  } else if (pEntityType === EntityType.PAYMENT) {
    const record = await prisma.payment.findUnique({ where: { id: entityId } });
    if (!record) throw new ApiError(404, "Payment not found");
    shopId = record.shopId;
  } else if (pEntityType === EntityType.SHOP) {
    shopId = entityId;
  } else {
    throw new ApiError(400, "Unsupported entity type for correction");
  }

  const approval = await prisma.$transaction(async (tx) => {
    return createApprovalRequest(tx, {
      shopId,
      type: pApprovalType,
      entityType: pEntityType,
      entityId,
      payloadJson: {
        requestedChangeJson,
        reason,
      },
      reason,
      requestedById: user.id,
    });
  });

  return {
    id: approval.id,
    entityType,
    entityId,
    requestedChangeJson,
    reason,
    status: approval.status,
    createdAt: approval.createdAt,
  };
}

export async function listCorrectionRequests(user, { shopId, status, entityType }) {
  const where = {
    shopId: shopId || undefined,
    status: status || undefined,
    type: {
      in: [
        ApprovalType.SALE_CORRECTION,
        ApprovalType.SALE_CANCELLATION,
        ApprovalType.DM_CANCELLATION,
        ApprovalType.STOCK_ADJUSTMENT,
        ApprovalType.PAYMENT_CORRECTION,
      ],
    },
    entityType: entityType ? mapEntityType(entityType) : undefined,
  };

  const approvals = await prisma.approvalRequest.findMany({
    where,
    include: {
      requestedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return approvals.map((app) => ({
    id: app.id,
    entityType: app.entityType,
    entityId: app.entityId,
    requestedChangeJson: app.payloadJson.requestedChangeJson,
    reason: app.reason,
    status: app.status,
    createdAt: app.createdAt,
  }));
}

export async function approveCorrectionRequest(user, id) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  return prisma.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findUnique({ where: { id } });
    if (!approval) throw new ApiError(404, "Correction request not found");
    if (approval.status !== "PENDING") throw new ApiError(400, "Request is already processed");

    if (approval.type === ApprovalType.SALE_CANCELLATION) {
      await tx.sale.update({
        where: { id: approval.entityId },
        data: {
          saleStatus: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: approval.reason,
        },
      });

      const saleItems = await tx.saleItem.findMany({ where: { saleId: approval.entityId } });
      for (const item of saleItems) {
        await tx.stockLedger.create({
          data: {
            shopId: approval.shopId,
            itemId: item.itemId,
            movementType: "RETURN",
            quantityIn: item.quantity,
            quantityOut: 0,
            referenceType: "Sale",
            referenceId: approval.entityId,
            reason: "Sale cancelled",
            createdById: approval.requestedById,
            approvedById: user.id,
          },
        });
      }
    } else if (approval.type === ApprovalType.DM_CANCELLATION) {
      await tx.deliveryMemo.update({
        where: { id: approval.entityId },
        data: {
          status: "CANCELLED",
        },
      });

      const dmItems = await tx.deliveryMemoItem.findMany({ where: { dmId: approval.entityId } });
      for (const item of dmItems) {
        await tx.stockLedger.create({
          data: {
            shopId: approval.shopId,
            itemId: item.itemId,
            movementType: "RETURN",
            quantityIn: item.quantity,
            quantityOut: 0,
            referenceType: "DeliveryMemo",
            referenceId: approval.entityId,
            reason: "Delivery memo cancelled",
            createdById: approval.requestedById,
            approvedById: user.id,
          },
        });
      }
    }

    const updated = await tx.approvalRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });

    return {
      id: updated.id,
      entityType: approval.entityType,
      entityId: approval.entityId,
      status: "APPROVED",
      createdAt: updated.createdAt,
    };
  });
}

export async function rejectCorrectionRequest(user, id, reason) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      approvedById: user.id,
      approvedAt: new Date(),
      rejectedReason: reason,
    },
  });

  return {
    id: updated.id,
    entityType: updated.entityType,
    entityId: updated.entityId,
    status: "REJECTED",
    createdAt: updated.createdAt,
  };
}
