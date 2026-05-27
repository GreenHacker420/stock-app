import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { createNotification, notifyShopOwner } from "./notification.service.js";

async function getRequestWithAccess(user, id) {
  const request = await prisma.rateChangeRequest.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { id: true, name: true } },
      orderItem: { include: { item: true, order: true } },
    },
  });
  if (!request) throw new ApiError(404, "Rate change request not found");
  await assertShopAccess(user, request.orderItem.order.shopId);
  return request;
}

export async function createRequest(user, { orderItemId, suggestedRate, reason }) {
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { item: true, order: true },
  });
  if (!orderItem) throw new ApiError(404, "Order item not found");
  await assertShopAccess(user, orderItem.order.shopId);

  if (Number(suggestedRate) <= 0) throw new ApiError(400, "Suggested rate must be greater than zero");
  if (Number(suggestedRate) === Number(orderItem.rate)) throw new ApiError(400, "Suggested rate must differ from current rate");

  return prisma.$transaction(async (tx) => {
    const request = await tx.rateChangeRequest.create({
      data: {
        orderItemId,
        currentRate: orderItem.rate,
        suggestedRate,
        reason,
        requestedById: user.id,
      },
      include: { orderItem: { include: { item: true, order: true } }, requestedBy: { select: { id: true, name: true } } },
    });

    await notifyShopOwner(tx, {
      shopId: orderItem.order.shopId,
      triggerEvent: "rate_change_request.submitted",
      entityType: "RateChangeRequest",
      entityId: request.id,
      message: `${user.name} requested rate change for ${orderItem.item.name}`,
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        shopId: orderItem.order.shopId,
        action: "rate_change.requested",
        entityType: "RateChangeRequest",
        entityId: request.id,
        newValueJson: request,
        reason,
      },
    });

    return request;
  });
}

export async function listRequests(user, { shopId, status }) {
  if (shopId) await assertShopAccess(user, shopId);

  return prisma.rateChangeRequest.findMany({
    where: {
      status: status || undefined,
      requestedById: user.role === "STAFF" ? user.id : undefined,
      orderItem: {
        order: {
          shopId: shopId || undefined,
        },
      },
    },
    include: {
      requestedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      orderItem: { include: { item: true, order: { include: { customer: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function approveRequest(user, id) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const existing = await getRequestWithAccess(user, id);
  if (existing.status !== "PENDING") throw new ApiError(400, "Only pending requests can be approved");

  return prisma.$transaction(async (tx) => {
    const quantity = Number(existing.orderItem.quantityOrdered);
    const discount = Number(existing.orderItem.discountAmount || 0);
    const lineTotal = quantity * Number(existing.suggestedRate) - discount;

    await tx.orderItem.update({
      where: { id: existing.orderItemId },
      data: {
        rate: existing.suggestedRate,
        lineTotal,
      },
    });

    const orderItems = await tx.orderItem.findMany({ where: { orderId: existing.orderItem.orderId } });
    const subtotal = orderItems.reduce((sum, item) => sum + Number(item.rate) * Number(item.quantityOrdered), 0);
    const discountAmount = orderItems.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);
    const totalAmount = subtotal - discountAmount;

    await tx.order.update({
      where: { id: existing.orderItem.orderId },
      data: {
        subtotal,
        discountAmount,
        totalAmount,
        balanceAmount: Math.max(totalAmount - Number(existing.orderItem.order.paidAmount || 0), 0),
      },
    });

    const request = await tx.rateChangeRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
      },
      include: { orderItem: { include: { item: true, order: true } }, requestedBy: { select: { id: true, name: true } } },
    });

    await createNotification(tx, {
      userId: existing.requestedById,
      shopId: existing.orderItem.order.shopId,
      triggerEvent: "rate_change_request.approved",
      entityType: "RateChangeRequest",
      entityId: id,
      message: `Rate change approved for ${existing.orderItem.item.name}`,
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: existing.orderItem.order.shopId,
      action: "rate_change.approved",
      entityType: "RateChangeRequest",
      entityId: id,
      oldValueJson: existing,
      newValueJson: request,
    });

    return request;
  });
}

export async function rejectRequest(user, id, { reason }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const existing = await getRequestWithAccess(user, id);
  if (existing.status !== "PENDING") throw new ApiError(400, "Only pending requests can be rejected");

  return prisma.$transaction(async (tx) => {
    const request = await tx.rateChangeRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectedReason: reason,
      },
      include: { orderItem: { include: { item: true, order: true } }, requestedBy: { select: { id: true, name: true } } },
    });

    await createNotification(tx, {
      userId: existing.requestedById,
      shopId: existing.orderItem.order.shopId,
      triggerEvent: "rate_change_request.rejected",
      entityType: "RateChangeRequest",
      entityId: id,
      message: `Rate change rejected for ${existing.orderItem.item.name}`,
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: existing.orderItem.order.shopId,
      action: "rate_change.rejected",
      entityType: "RateChangeRequest",
      entityId: id,
      oldValueJson: existing,
      newValueJson: request,
      reason,
    });

    return request;
  });
}
