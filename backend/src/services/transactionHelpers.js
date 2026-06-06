import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { formatRecordNumber } from "../utils/recordNumber.js";
import { getDayRange } from "../utils/dateRange.js";

export async function generateRecordNumber(tx, { shopId, model, field, prefix, date = new Date() }) {
  const { start, end } = getDayRange(date);
  const count = await tx[model].count({
    where: {
      shopId,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
  });

  return formatRecordNumber(prefix, date, count + 1);
}

export async function getCurrentQuantity(tx, shopId, itemId) {
  const result = await tx.stockLedger.aggregate({
    where: { shopId, itemId },
    _sum: {
      quantityIn: true,
      quantityOut: true,
    },
  });

  return Number(result._sum.quantityIn || 0) - Number(result._sum.quantityOut || 0);
}

export async function assertStockAvailable(tx, shopId, itemId, quantity) {
  const currentQuantity = await getCurrentQuantity(tx, shopId, itemId);
  if (currentQuantity < Number(quantity)) {
    throw new ApiError(400, "Insufficient stock for one or more items");
  }
}

export async function createStockOut(tx, { shopId, itemId, quantity, movementType, referenceType, referenceId, reason, userId }) {
  await assertStockAvailable(tx, shopId, itemId, quantity);

  return tx.stockLedger.create({
    data: {
      shopId,
      itemId,
      movementType,
      quantityIn: 0,
      quantityOut: quantity,
      referenceType,
      referenceId,
      reason,
      createdById: userId,
    },
  });
}

export function calculateItemTotals(items) {
  const normalizedItems = items.map((item) => {
    const quantity = Number(item.quantity ?? item.quantityOrdered);
    const rate = Number(item.rate);
    const discountAmount = Number(item.discountAmount || 0);
    const lineTotal = quantity * rate - discountAmount;

    if (quantity <= 0 || rate <= 0 || lineTotal < 0) {
      throw new ApiError(400, "Invalid item quantity, rate, or discount");
    }

    return {
      ...item,
      quantity,
      rate,
      discountAmount,
      lineTotal,
    };
  });

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const discountAmount = normalizedItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const totalAmount = subtotal - discountAmount;

  return { items: normalizedItems, subtotal, discountAmount, totalAmount };
}

export function getBillPaymentStatus(totalAmount, paidAmount) {
  const tolerance = 0.001;
  if (paidAmount <= tolerance) return "UNPAID";
  if (Math.abs(paidAmount - totalAmount) < tolerance) return "PAID";
  if (paidAmount < totalAmount) return "PARTIALLY_PAID";
  return "OVERPAID";
}

export async function applyPayments(tx, { user, shopId, saleId, dmId, orderId, customerId, totalAmount, existingPaidAmount = 0, payments = [] }) {
  if (!payments.length) {
    return {
      paidAmount: existingPaidAmount,
      balanceAmount: totalAmount - existingPaidAmount,
      paymentStatus: getBillPaymentStatus(totalAmount, existingPaidAmount),
    };
  }

  const paymentTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const paidAmount = Number(existingPaidAmount) + paymentTotal;

  if (paidAmount > Number(totalAmount) + 0.001) {
    throw new ApiError(400, "Overpayment is not allowed");
  }

  for (const payment of payments) {
    if (Number(payment.amount) <= 0) {
      throw new ApiError(400, "Payment amount must be greater than zero");
    }

    let cashSessionId = null;
    let verificationStatus = "RECORDED";

    if (payment.paymentMode === "CASH") {
      const session = await tx.cashSession.findFirst({
        where: { shopId, status: "OPEN" },
        orderBy: { openedAt: "desc" },
      });

      if (!session) {
        throw new ApiError(400, "Cash payment requires an open cash session");
      }

      cashSessionId = session.id;
      verificationStatus = "VERIFIED";
    } else if (["UPI", "CARD", "BANK_TRANSFER", "CHEQUE"].includes(payment.paymentMode)) {
      verificationStatus = "PENDING_VERIFICATION";
    }

    if (payment.paymentMode === "CHEQUE") {
      const details = payment.details || {};
      if (!details.chequeNumber || !details.chequeBankName || !details.chequeDate) {
        throw new ApiError(400, "Cheque number, bank name, and cheque date are required");
      }
    }

    await tx.payment.create({
      data: {
        shopId,
        saleId,
        dmId,
        orderId,
        customerId,
        paymentMode: payment.paymentMode,
        amount: payment.amount,
        verificationStatus,
        cashSessionId,
        receivedById: user.id,
        referenceNumber: payment.referenceNumber,
        proofImageUrl: payment.proofImageUrl,
        notes: payment.notes,
        details: payment.details
          ? {
              create: {
                ...payment.details,
                chequeStatus: payment.paymentMode === "CHEQUE" ? "RECEIVED" : payment.details.chequeStatus,
              },
            }
          : undefined,
      },
    });
  }

  return {
    paidAmount,
    balanceAmount: Number(totalAmount) - paidAmount,
    paymentStatus: getBillPaymentStatus(Number(totalAmount), paidAmount),
  };
}

export { prisma };
