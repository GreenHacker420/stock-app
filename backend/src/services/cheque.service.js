import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { notifyShopOwner } from "./notification.service.js";

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

  const dateFieldByStatus = {
    DEPOSITED: { chequeDepositDate: new Date() },
    CLEARED: { chequeClearDate: new Date() },
    BOUNCED: { chequeClearDate: new Date() },
    RETURNED: {},
  };

  return prisma.$transaction(async (tx) => {
    const details = await tx.paymentDetail.upsert({
      where: { paymentId: id },
      update: {
        chequeStatus: status,
        ...(dateFieldByStatus[status] || {}),
      },
      create: {
        paymentId: id,
        chequeStatus: status,
        ...(dateFieldByStatus[status] || {}),
      },
    });

    const payment = await tx.payment.update({
      where: { id },
      data: {
        verificationStatus: status === "CLEARED" ? "VERIFIED" : status === "BOUNCED" ? "MISMATCH" : existing.verificationStatus,
        verifiedById: ["CLEARED", "BOUNCED"].includes(status) ? user.id : existing.verifiedById,
        verifiedAt: ["CLEARED", "BOUNCED"].includes(status) ? new Date() : existing.verifiedAt,
        notes: reason || existing.notes,
      },
      include: { details: true, customer: true },
    });

    if (status === "BOUNCED" && existing.customerId) {
      await tx.creditOutstanding.create({
        data: {
          shopId: existing.shopId,
          customerId: existing.customerId,
          saleId: existing.saleId,
          dmId: existing.dmId,
          orderId: existing.orderId,
          pendingAmount: existing.amount,
          note: reason || "Cheque bounced",
          status: "PENDING",
          createdById: user.id,
        },
      });

      await notifyShopOwner(tx, {
        shopId: existing.shopId,
        triggerEvent: "cheque.bounced",
        entityType: "Payment",
        entityId: id,
        message: `Cheque bounced for ₹${existing.amount}`,
      });
    }

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: existing.shopId,
      action: `cheque.${status.toLowerCase()}`,
      entityType: "Payment",
      entityId: id,
      oldValueJson: existing.details,
      newValueJson: details,
      reason,
    });

    return payment;
  });
}
