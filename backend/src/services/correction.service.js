import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { EntityType, ApprovalType, AuditAction } from "../generated/prisma/index.js";
import { createApprovalRequest } from "./approval.service.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { decreaseCustomerDebt } from "./transactionHelpers.js";
import { createDomainEvent, enqueueManyDomainEvents, enqueueDomainEvent } from "./domain-event.service.js";

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

async function accessibleShopIds(user) {
  if (user.role === "OWNER") {
    const shops = await prisma.shop.findMany({ where: { ownerId: user.id }, select: { id: true } });
    return shops.map((shop) => shop.id);
  }
  const accesses = await prisma.staffShopAccess.findMany({ where: { staffId: user.id }, select: { shopId: true } });
  return accesses.map((access) => access.shopId);
}

async function resolveCorrectionTarget(entityType, entityId, clientEntityType = entityType, db = prisma) {
  if (entityType === EntityType.SALE) {
    const record = await db.sale.findUnique({ where: { id: entityId } });
    if (!record) throw new ApiError(404, "Sale not found");
    return { shopId: record.shopId, record };
  }
  if (entityType === EntityType.DELIVERY_MEMO) {
    const record = await db.deliveryMemo.findUnique({ where: { id: entityId } });
    if (!record) throw new ApiError(404, "Delivery Memo not found");
    return { shopId: record.shopId, record };
  }
  if (entityType === EntityType.ORDER) {
    const record = await db.order.findUnique({ where: { id: entityId } });
    if (!record) throw new ApiError(404, "Order not found");
    return { shopId: record.shopId, record };
  }
  if (entityType === EntityType.PAYMENT) {
    const record = await db.payment.findUnique({ where: { id: entityId } });
    if (!record) throw new ApiError(404, "Payment not found");
    return { shopId: record.shopId, record };
  }
  if (entityType === EntityType.SHOP || clientEntityType === "STOCK") {
    const record = await db.shop.findUnique({ where: { id: entityId } });
    if (!record) throw new ApiError(404, "Shop not found");
    return { shopId: record.id, record };
  }
  throw new ApiError(400, "Unsupported entity type for correction");
}

async function assertOwnerApprovalAccess(user, approval) {
  await assertShopAccess(user, approval.shopId);
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
}

export async function createCorrectionRequest(user, { entityType, entityId, requestedChangeJson, reason }) {
  const pEntityType = mapEntityType(entityType);
  const pApprovalType = mapApprovalType(entityType, requestedChangeJson);

  const { shopId, record } = await resolveCorrectionTarget(pEntityType, entityId, entityType);
  await assertShopAccess(user, shopId);

  if (entityType === "DM") {
    if (record.lifecycleStatus !== "DISPATCHED") {
      throw new ApiError(409, "Only a dispatched delivery memo can be cancelled", { code: "INVALID_STATE_TRANSITION" });
    }
    if (record.invoicingStatus !== "NOT_INVOICED") {
      throw new ApiError(409, "An invoiced delivery memo cannot be cancelled", { code: "DM_ALREADY_INVOICED" });
    }
    const [paymentCount, returnCount] = await Promise.all([
      prisma.payment.count({ where: { dmId: entityId, status: { not: "CANCELLED" } } }),
      prisma.inventoryReturn.count({ where: { dmId: entityId, status: { not: "CANCELLED" } } }),
    ]);
    if (paymentCount > 0) throw new ApiError(409, "Reverse or refund linked payments before cancellation", { code: "DM_HAS_PAYMENTS" });
    if (returnCount > 0) throw new ApiError(409, "Complete the return workflow instead of cancelling this memo", { code: "DM_HAS_RETURNS" });
  }

  const approval = await prisma.$transaction(async (tx) => {
    const created = await createApprovalRequest(tx, {
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
    if (entityType === "DM") {
      await tx.deliveryMemo.update({
        where: { id: entityId },
        data: { lifecycleStatus: "CANCELLATION_PENDING", version: { increment: 1 } },
      });
    }
    return created;
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
  if (shopId) await assertShopAccess(user, shopId);
  const shopIds = shopId ? [shopId] : await accessibleShopIds(user);
  const where = {
    shopId: { in: shopIds },
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
  return prisma.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findUnique({ where: { id } });
    if (!approval) throw new ApiError(404, "Correction request not found");
    await assertOwnerApprovalAccess(user, approval);
    if (approval.status !== "PENDING") throw new ApiError(400, "Request is already processed");
    const { shopId } = await resolveCorrectionTarget(approval.entityType, approval.entityId, approval.entityType, tx);
    if (shopId !== approval.shopId) {
      throw new ApiError(400, "Approval target no longer belongs to this shop");
    }

    if (approval.type === ApprovalType.SALE_CANCELLATION) {
      const sale = await tx.sale.findUnique({ where: { id: approval.entityId } });
      if (!sale) throw new ApiError(404, "Sale not found");
      if (sale.saleStatus === "CANCELLED") {
        throw new ApiError(400, "Sale is already cancelled");
      }

      await tx.sale.update({
        where: { id: approval.entityId },
        data: {
          saleStatus: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: approval.reason,
        },
      });

      await decreaseCustomerDebt(tx, sale.customerId, sale.balanceAmount);

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
      const dm = await tx.deliveryMemo.findUnique({ where: { id: approval.entityId } });
      if (!dm) throw new ApiError(404, "Delivery memo not found");
      if (dm.status === "CANCELLED") {
        throw new ApiError(400, "Delivery memo is already cancelled");
      }

      await tx.deliveryMemo.update({
        where: { id: approval.entityId },
        data: {
          status: "CANCELLED",
          lifecycleStatus: "CANCELLED",
          version: { increment: 1 },
        },
      });

      await decreaseCustomerDebt(tx, dm.customerId, dm.balanceAmount);

      await tx.customerLedgerEntry.create({
        data: {
          shopId: dm.shopId,
          customerId: dm.customerId,
          sourceType: "DELIVERY_MEMO",
          sourceId: dm.id,
          entryType: "DM_CANCELLED",
          direction: "CREDIT",
          amount: dm.balanceAmount,
          createdById: user.id,
          notes: approval.reason,
        },
      });

      await tx.deliveryMemoSerialAssignment.updateMany({
        where: { dmId: dm.id, status: "ACTIVE" },
        data: {
          status: "RELEASED",
          activeKey: null,
          releasedAt: new Date(),
          releaseReason: "DM_CANCELLED",
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

    const events = [
      createDomainEvent({
        shopId: approval.shopId,
        entity: "approval",
        action: "approved",
        entityId: approval.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true, targetUserIds: [approval.requestedById] },
      }),
      createDomainEvent({
        shopId: approval.shopId,
        entity: "dashboard",
        action: "updated",
        entityId: approval.shopId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
    ];
    if (approval.type === ApprovalType.SALE_CANCELLATION) {
      const sale = await tx.sale.findUnique({ where: { id: approval.entityId }, select: { customerId: true } });
      events.push(
        createDomainEvent({
          shopId: approval.shopId,
          entity: "sale",
          action: "updated",
          entityId: approval.entityId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }),
        createDomainEvent({
          shopId: approval.shopId,
          entity: "stock",
          action: "updated",
          entityId: approval.entityId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }),
      );
      if (sale?.customerId) {
        events.push(createDomainEvent({
          shopId: approval.shopId,
          entity: "customer",
          action: "updated",
          entityId: sale.customerId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }));
      }
    }
    if (approval.type === ApprovalType.DM_CANCELLATION) {
      const dm = await tx.deliveryMemo.findUnique({ where: { id: approval.entityId }, select: { customerId: true } });
      events.push(
        createDomainEvent({
          shopId: approval.shopId,
          entity: "deliveryMemo",
          action: "updated",
          entityId: approval.entityId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }),
        createDomainEvent({
          shopId: approval.shopId,
          entity: "stock",
          action: "updated",
          entityId: approval.entityId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }),
      );
      if (dm?.customerId) {
        events.push(createDomainEvent({
          shopId: approval.shopId,
          entity: "customer",
          action: "updated",
          entityId: dm.customerId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }));
      }
    }
    await enqueueManyDomainEvents(tx, events);

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
  const approval = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!approval) throw new ApiError(404, "Correction request not found");
  await assertOwnerApprovalAccess(user, approval);
  if (approval.status !== "PENDING") throw new ApiError(400, "Request is already processed");
  const { shopId } = await resolveCorrectionTarget(approval.entityType, approval.entityId, approval.entityType);
  if (shopId !== approval.shopId) {
    throw new ApiError(400, "Approval target no longer belongs to this shop");
  }

  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      approvedById: user.id,
      approvedAt: new Date(),
      rejectedReason: reason,
    },
  });

  await enqueueDomainEvent(prisma, createDomainEvent({
    shopId: approval.shopId,
    entity: "approval",
    action: "rejected",
    entityId: approval.id,
    actorUserId: user.id,
    actorRole: user.role,
    visibility: { owners: true, staff: true, targetUserIds: [approval.requestedById] },
  }));

  return {
    id: updated.id,
    entityType: updated.entityType,
    entityId: updated.entityId,
    status: "REJECTED",
    createdAt: updated.createdAt,
  };
}
