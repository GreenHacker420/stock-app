import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { applyPayments, prisma, increaseCustomerDebt } from "./transactionHelpers.js";
import { money, sub, add, isZero } from "../utils/money.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { getOrCreateWalkIn } from "./customer.service.js";

async function getPaymentWithAccess(user, id) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { details: true, sale: true, deliveryMemo: true, order: true },
  });
  if (!payment) throw new ApiError(404, "Payment not found");
  await assertShopAccess(user, payment.shopId);
  if (user.role === "STAFF" && payment.receivedById !== user.id) {
    throw new ApiError(403, "You can view only your own payments");
  }
  return payment;
}

export async function listPayments(user, { shopId, customerId, paymentMode, status, unlinked }) {
  await assertShopAccess(user, shopId);

  return prisma.payment.findMany({
    where: {
      shopId,
      customerId: customerId || undefined,
      paymentMode: paymentMode || undefined,
      status: status || undefined,
      receivedById: user.role === "STAFF" ? user.id : undefined,
      ...(unlinked ? {
        saleId: null,
        dmId: null,
        orderId: null
      } : {})
    },
    include: { details: true, customer: true, receivedBy: { select: { id: true, name: true } } },
    orderBy: { receivedAt: "desc" },
  });
}

export async function getPayment(user, id) {
  return getPaymentWithAccess(user, id);
}

export async function addPayment(user, data) {
  await assertShopAccess(user, data.shopId);

  return prisma.$transaction(async (tx) => {
    let customerId = data.customerId;

    if (data.saleId) {
      const sale = await tx.sale.findUnique({ where: { id: data.saleId } });
      if (!sale || sale.shopId !== data.shopId) throw new ApiError(400, "Sale does not belong to this shop");
      customerId = sale.customerId || customerId;
    }

    if (data.dmId) {
      const dm = await tx.deliveryMemo.findUnique({ where: { id: data.dmId } });
      if (!dm || dm.shopId !== data.shopId) throw new ApiError(400, "DM does not belong to this shop");
      customerId = dm.customerId || customerId;
    }

    if (data.orderId) {
      const order = await tx.order.findUnique({ where: { id: data.orderId } });
      if (!order || order.shopId !== data.shopId) throw new ApiError(400, "Order does not belong to this shop");
      customerId = order.customerId || customerId;
    }

    if (!customerId) {
      const walkin = await getOrCreateWalkIn(data.shopId, user.id);
      customerId = walkin.id;
    }

    await applyPayments(tx, {
      user,
      shopId: data.shopId,
      saleId: data.saleId,
      dmId: data.dmId,
      orderId: data.orderId,
      customerId,
      totalAmount: money(0),
      payments: [data],
    });

    return tx.payment.findFirst({
      where: {
        shopId: data.shopId,
        receivedById: user.id,
      },
      include: { details: true },
      orderBy: { createdAt: "desc" },
    });
  });
}

export async function verifyPayment(user, id, { note }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const payment = await getPaymentWithAccess(user, id);

  return prisma.payment.update({
    where: { id },
    data: {
      status: "VERIFIED",
      verifiedById: user.id,
      verifiedAt: new Date(),
      notes: note || payment.notes,
    },
    include: { details: true },
  });
}

export async function rejectPayment(user, id, { note }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const payment = await getPaymentWithAccess(user, id);

  return prisma.payment.update({
    where: { id },
    data: {
      status: "REJECTED",
      verifiedById: user.id,
      verifiedAt: new Date(),
      notes: note || payment.notes,
    },
    include: { details: true },
  });
}

export async function voidPayment(user, id, { reason } = {}) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const existing = await getPaymentWithAccess(user, id);
  if (existing.status === "CANCELLED") throw new ApiError(400, "Payment is already cancelled");

  return prisma.$transaction(async (tx) => {
    // 1. Mark Payment as cancelled
    const payment = await tx.payment.update({
      where: { id },
      data: {
        status: "CANCELLED",
        notes: reason || existing.notes
      },
      include: { details: true }
    });

    // 2. Adjust Customer balance
    // Cancelling a payment means their debt increases back.
    await increaseCustomerDebt(tx, existing.customerId, existing.amount);

    await writeAuditLog({
      userId: user.id,
      shopId: existing.shopId,
      action: "VOIDED",
      entityType: "PAYMENT",
      entityId: id,
      oldValueJson: existing,
      newValueJson: payment,
      reason
    });

    return payment;
  });
}

export async function attachPayment(user, id, { saleId, dmId, orderId }) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new ApiError(404, "Payment not found");
  
  await assertShopAccess(user, payment.shopId);

  if (payment.saleId || payment.dmId || payment.orderId) {
    throw new ApiError(400, "Payment is already attached to an invoice");
  }

  const refs = [saleId, dmId, orderId].filter(Boolean);
  if (refs.length !== 1) {
    throw new ApiError(400, "Must provide exactly one target (saleId, dmId, or orderId)");
  }

  return prisma.$transaction(async (tx) => {
    // 1. Update the payment with the reference
    const updatedPayment = await tx.payment.update({
      where: { id },
      data: {
        saleId: saleId || undefined,
        dmId: dmId || undefined,
        orderId: orderId || undefined,
      }
    });

    // 2. If it is a Sale, recalculate paidAmount, balanceAmount, paymentStatus, and saleStatus
    if (saleId) {
      const sale = await tx.sale.findUnique({
        where: { id: saleId }
      });
      if (!sale) throw new ApiError(404, "Sale not found");

      const allPayments = await tx.payment.findMany({
        where: { saleId, status: { not: "CANCELLED" } }
      });
      const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Number(sale.totalAmount) - totalPaid;
      const status = balance <= 0 ? "PAID" : (totalPaid > 0 ? "PARTIALLY_PAID" : "UNPAID");

      await tx.sale.update({
        where: { id: saleId },
        data: {
          paidAmount: totalPaid,
          balanceAmount: balance,
          paymentStatus: status,
          saleStatus: status === "PAID" ? "PAID" : sale.saleStatus
        }
      });
    }

    // 3. If it is a DeliveryMemo, recalculate paidAmount and balanceAmount
    if (dmId) {
      const dm = await tx.deliveryMemo.findUnique({
        where: { id: dmId }
      });
      if (!dm) throw new ApiError(404, "DM not found");

      const allPayments = await tx.payment.findMany({
        where: { dmId, status: { not: "CANCELLED" } }
      });
      const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Number(dm.estimatedAmount) - totalPaid;
      const status = balance <= 0 ? "PAID" : (totalPaid > 0 ? "PARTIALLY_PAID" : "UNPAID");

      await tx.deliveryMemo.update({
        where: { id: dmId },
        data: {
          paidAmount: totalPaid,
          balanceAmount: balance,
          paymentStatus: status,
          status: status === "PAID" ? "PAID" : dm.status
        }
      });
    }

    return updatedPayment;
  });
}
