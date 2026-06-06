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

import { money, add, sub, mul, div, isZero } from "../utils/money.js";
import { assertMoney } from "../utils/assertMoney.js";
import { Prisma } from "../generated/prisma/index.js";

export function getBillPaymentStatus(totalAmount, paidAmount) {
  const total = money(totalAmount);
  const paid = money(paidAmount);
  if (paid.lte(0)) return "UNPAID";
  if (paid.gte(total)) return "PAID";
  return "PARTIALLY_PAID";
}

export { prisma };
