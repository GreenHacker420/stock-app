import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { applyPayments, getBillPaymentStatus, prisma } from "./transactionHelpers.js";

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

export async function listPayments(user, { shopId, paymentMode, verificationStatus }) {
  await assertShopAccess(user, shopId);

  return prisma.payment.findMany({
    where: {
      shopId,
      paymentMode: paymentMode || undefined,
      verificationStatus: verificationStatus || undefined,
      receivedById: user.role === "STAFF" ? user.id : undefined,
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
    let totalAmount = Number(data.amount);
    let existingPaidAmount = 0;
    let customerId = data.customerId;

    if (data.saleId) {
      const sale = await tx.sale.findUnique({ where: { id: data.saleId } });
      if (!sale || sale.shopId !== data.shopId) throw new ApiError(400, "Sale does not belong to this shop");
      totalAmount = Number(sale.totalAmount);
      existingPaidAmount = Number(sale.paidAmount);
      customerId = sale.customerId || customerId;
    }

    if (data.dmId) {
      const dm = await tx.deliveryMemo.findUnique({ where: { id: data.dmId } });
      if (!dm || dm.shopId !== data.shopId) throw new ApiError(400, "DM does not belong to this shop");
      totalAmount = Number(dm.estimatedAmount);
      existingPaidAmount = Number(dm.paidAmount);
      customerId = dm.customerId || customerId;
    }

    if (data.orderId) {
      const order = await tx.order.findUnique({ where: { id: data.orderId } });
      if (!order || order.shopId !== data.shopId) throw new ApiError(400, "Order does not belong to this shop");
      totalAmount = Number(order.totalAmount);
      existingPaidAmount = Number(order.paidAmount);
      customerId = order.customerId || customerId;
    }

    const result = await applyPayments(tx, {
      user,
      shopId: data.shopId,
      saleId: data.saleId,
      dmId: data.dmId,
      orderId: data.orderId,
      customerId,
      totalAmount,
      existingPaidAmount,
      payments: [data],
    });

    if (data.saleId) {
      await tx.sale.update({
        where: { id: data.saleId },
        data: {
          paidAmount: result.paidAmount,
          balanceAmount: result.balanceAmount,
          paymentStatus: result.paymentStatus,
          saleStatus: result.paymentStatus === "PAID" ? "PAID" : "PENDING_PAYMENT",
        },
      });
    }

    if (data.dmId) {
      await tx.deliveryMemo.update({
        where: { id: data.dmId },
        data: {
          paidAmount: result.paidAmount,
          balanceAmount: result.balanceAmount,
          paymentStatus: result.paymentStatus,
          status: result.paymentStatus === "PAID" ? "FULLY_PAID" : "PARTIALLY_PAID",
        },
      });
    }

    if (data.orderId) {
      await tx.order.update({
        where: { id: data.orderId },
        data: {
          paidAmount: result.paidAmount,
          balanceAmount: result.balanceAmount,
          paymentStatus: getBillPaymentStatus(totalAmount, result.paidAmount),
        },
      });
    }

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
      verificationStatus: "VERIFIED",
      verifiedById: user.id,
      verifiedAt: new Date(),
      notes: note || payment.notes,
    },
    include: { details: true },
  });
}

export async function markMismatch(user, id, { note }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const payment = await getPaymentWithAccess(user, id);

  return prisma.payment.update({
    where: { id },
    data: {
      verificationStatus: "MISMATCH",
      verifiedById: user.id,
      verifiedAt: new Date(),
      notes: note || payment.notes,
    },
    include: { details: true },
  });
}
