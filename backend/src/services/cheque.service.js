import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { notifyShopOwner, createNotification } from "./notification.service.js";
import { money, add, sub, isZero } from "../utils/money.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { increaseCustomerDebt } from "./transactionHelpers.js";
import { createDomainEvent, enqueueDomainEvent } from "./domain-event.service.js";

async function getChequePayment(user, id) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { details: true, customer: true, sale: true, deliveryMemo: true, order: true },
  });
  if (!payment || payment.paymentMode !== "CHEQUE") throw new ApiError(404, "Cheque payment not found");
  await assertShopAccess(user, payment.shopId);
  return payment;
}

export async function listCheques(user, { shopId, status }) {
  if (shopId) await assertShopAccess(user, shopId);
  const shopIds = shopId ? [shopId] : await accessibleShopIds(user);

  return prisma.payment.findMany({
    where: {
      shopId: { in: shopIds },
      paymentMode: "CHEQUE",
      details: { chequeStatus: status || undefined },
    },
    include: { details: true, customer: true, receivedBy: { select: { id: true, name: true } } },
    orderBy: { receivedAt: "desc" },
  });
}

async function accessibleShopIds(user) {
  if (user.role === "OWNER") {
    const shops = await prisma.shop.findMany({ where: { ownerId: user.id }, select: { id: true } });
    return shops.map((shop) => shop.id);
  }
  const accesses = await prisma.staffShopAccess.findMany({ where: { staffId: user.id }, select: { shopId: true } });
  return accesses.map((access) => access.shopId);
}

export async function getCheque(user, id) {
  return getChequePayment(user, id);
}

export async function updateChequeStatus(user, id, status, { reason } = {}) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const existing = await getChequePayment(user, id);

  return prisma.$transaction(async (tx) => {
    const details = await tx.paymentDetail.upsert({
      where: { paymentId: id },
      update: {
        chequeStatus: status,
      },
      create: {
        paymentId: id,
        chequeStatus: status,
      },
    });

    const payment = await tx.payment.update({
      where: { id },
      data: {
        status: status === "CLEARED" ? "VERIFIED" : status === "BOUNCED" ? "REJECTED" : existing.status,
        verifiedById: ["CLEARED", "BOUNCED"].includes(status) ? user.id : existing.verifiedById,
        verifiedAt: ["CLEARED", "BOUNCED"].includes(status) ? new Date() : existing.verifiedAt,
        notes: reason || existing.notes,
      },
      include: { details: true, customer: true },
    });

    if (status === "BOUNCED" && existing.customerId) {
      await increaseCustomerDebt(tx, existing.customerId, existing.amount);

      const msg = `Cheque bounced for customer ${existing.customer?.name || "Walk-In"} for ₹${existing.amount}`;
      await notifyShopOwner(tx, {
        shopId: existing.shopId,
        triggerEvent: "CHEQUE_BOUNCED",
        entityType: EntityType.PAYMENT,
        entityId: id,
        message: msg,
      });

      if (existing.receivedById) {
        await createNotification(tx, {
          userId: existing.receivedById,
          shopId: existing.shopId,
          triggerEvent: "CHEQUE_BOUNCED",
          entityType: EntityType.PAYMENT,
          entityId: id,
          message: `${msg}. Please follow up for payment.`,
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: existing.shopId,
        action: status,
        entityType: EntityType.PAYMENT,
        entityId: id,
        oldValueJson: existing.details,
        newValueJson: details,
        reason,
      }
    });
    await enqueueDomainEvent(tx, {
      shopId: existing.shopId,
      entity: "payment",
      action: "updated",
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });

    return payment;
  });
}
