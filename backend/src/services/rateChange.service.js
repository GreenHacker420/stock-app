import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { EntityType } from "../generated/prisma/index.js";
import { createApprovalRequest } from "./approval.service.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";

async function accessibleShopIds(user) {
  if (user.role === "OWNER") {
    const shops = await prisma.shop.findMany({ where: { ownerId: user.id }, select: { id: true } });
    return shops.map((shop) => shop.id);
  }
  const accesses = await prisma.staffShopAccess.findMany({ where: { staffId: user.id }, select: { shopId: true } });
  return accesses.map((access) => access.shopId);
}

async function assertOwnerApprovalAccess(user, approval) {
  await assertShopAccess(user, approval.shopId);
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
}

export async function createRateChangeRequest(user, { orderItemId, suggestedRate, reason }) {
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: true }
  });

  if (!orderItem) {
    throw new ApiError(404, "Order item not found");
  }
  await assertShopAccess(user, orderItem.order.shopId);

  const approval = await prisma.$transaction(async (tx) => {
    return createApprovalRequest(tx, {
      shopId: orderItem.order.shopId,
      type: "RATE_CHANGE",
      entityType: EntityType.ORDER,
      entityId: orderItem.order.id,
      payloadJson: {
        orderItemId,
        suggestedRate,
        reason,
      },
      reason,
      requestedById: user.id,
    });
  });

  return {
    id: approval.id,
    orderItemId,
    suggestedRate,
    reason,
    status: approval.status,
    createdAt: approval.createdAt,
  };
}

export async function listRateChangeRequests(user, { shopId, status }) {
  if (shopId) await assertShopAccess(user, shopId);
  const shopIds = shopId ? [shopId] : await accessibleShopIds(user);

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      shopId: { in: shopIds },
      type: "RATE_CHANGE",
      status: status || undefined,
    },
    include: {
      requestedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return approvals.map((app) => ({
    id: app.id,
    orderItemId: app.payloadJson.orderItemId,
    suggestedRate: app.payloadJson.suggestedRate,
    reason: app.reason,
    status: app.status,
    createdAt: app.createdAt,
  }));
}

export async function approveRateChangeRequest(user, id) {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findUnique({ where: { id } });
    if (!approval || approval.type !== "RATE_CHANGE") {
      throw new ApiError(404, "Rate change request not found");
    }
    await assertOwnerApprovalAccess(user, approval);
    if (approval.status !== "PENDING") {
      throw new ApiError(400, "Request is already processed");
    }

    const { orderItemId, suggestedRate } = approval.payloadJson;

    const orderItem = await tx.orderItem.findUnique({
      where: { id: orderItemId },
      include: { order: true },
    });

    if (!orderItem) {
      throw new ApiError(404, "Order item not found");
    }
    if (orderItem.order.shopId !== approval.shopId) {
      throw new ApiError(400, "Approval target no longer belongs to this shop");
    }

    const rateVal = Number(suggestedRate);
    const qtyOrdered = Number(orderItem.quantityOrdered);
    const discountAmount = Number(orderItem.discountAmount || 0);
    const lineTotal = qtyOrdered * rateVal - discountAmount;

    await tx.orderItem.update({
      where: { id: orderItemId },
      data: {
        rate: rateVal,
        lineTotal,
      },
    });

    const allItems = await tx.orderItem.findMany({ where: { orderId: orderItem.orderId } });
    const subtotal = allItems.reduce((sum, item) => sum + Number(item.quantityOrdered) * Number(item.rate), 0);
    const totalDiscount = allItems.reduce((sum, item) => sum + Number(item.discountAmount), 0);
    const totalAmount = subtotal - totalDiscount;

    await tx.order.update({
      where: { id: orderItem.orderId },
      data: {
        subtotal,
        discountAmount: totalDiscount,
        totalAmount,
        balanceAmount: totalAmount - Number(orderItem.order.paidAmount),
      },
    });

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
      orderItemId,
      suggestedRate,
      status: "APPROVED",
      createdAt: updated.createdAt,
    };
  });
}

export async function rejectRateChangeRequest(user, id, reason) {
  const approval = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!approval || approval.type !== "RATE_CHANGE") {
    throw new ApiError(404, "Rate change request not found");
  }
  await assertOwnerApprovalAccess(user, approval);
  if (approval.status !== "PENDING") {
    throw new ApiError(400, "Request is already processed");
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

  return {
    id: updated.id,
    orderItemId: updated.payloadJson.orderItemId,
    suggestedRate: updated.payloadJson.suggestedRate,
    status: "REJECTED",
    createdAt: updated.createdAt,
  };
}
