import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { formatRecordNumber } from "../utils/recordNumber.js";
import { getDayRange } from "../utils/dateRange.js";
import { money, add, sub, mul, div, isZero } from "../utils/money.js";

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
  const total = money(totalAmount);
  const paid = money(paidAmount);
  if (paid.lte(0)) return "UNPAID";
  if (paid.gte(total)) return "PAID";
  return "PARTIALLY_PAID";
}

/**
 * Apply payments simply by summing them and adjusting the customer's balance.
 */
export async function applyPayments(tx, { user, shopId, saleId, dmId, orderId, customerId, totalAmount, existingPaidAmount = 0, payments }) {
  let newPaid = money(existingPaidAmount);
  let totalVal = money(totalAmount);
  
  if (!payments || payments.length === 0) {
    return {
      paidAmount: newPaid,
      balanceAmount: sub(totalVal, newPaid),
      paymentStatus: getBillPaymentStatus(totalVal, newPaid),
    };
  }

  for (const payment of payments) {
    if (payment.paymentMode === "CREDIT") continue; // Credit just means they didn't pay it now
    
    const amt = money(payment.amount);
    if (amt.lte(0)) continue;

    newPaid = add(newPaid, amt);

    // Create the payment record
    const createdPayment = await tx.payment.create({
      data: {
        shopId,
        saleId,
        dmId,
        orderId,
        customerId,
        paymentMode: payment.paymentMode,
        amount: amt,
        verificationStatus: payment.paymentMode === "CASH" ? "VERIFIED" : "PENDING_VERIFICATION",
        receivedById: user.id,
        notes: payment.notes,
        details: payment.details ? {
          create: payment.details
        } : undefined
      }
    });

    // Update Customer outstanding or advance balance if there's a customer
    if (customerId) {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (customer) {
        // Simple logic: a payment reduces outstanding. 
        // If outstanding becomes negative, it becomes advance.
        let outAmt = money(customer.outstandingAmount);
        let advAmt = money(customer.advanceBalance);

        if (outAmt.gte(amt)) {
          outAmt = sub(outAmt, amt);
        } else {
          const remainder = sub(amt, outAmt);
          outAmt = money(0);
          advAmt = add(advAmt, remainder);
        }

        await tx.customer.update({
          where: { id: customerId },
          data: {
            outstandingAmount: outAmt,
            advanceBalance: advAmt
          }
        });
      }
    }
  }

  return {
    paidAmount: newPaid,
    balanceAmount: sub(totalVal, newPaid),
    paymentStatus: getBillPaymentStatus(totalVal, newPaid),
  };
}

/**
 * Update Customer Balance when a Sale/DM increases debt.
 */
export async function increaseCustomerDebt(tx, customerId, amount) {
  if (!customerId) return;
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) return;
  
  const amt = money(amount);
  let outAmt = money(customer.outstandingAmount);
  let advAmt = money(customer.advanceBalance);

  if (advAmt.gte(amt)) {
    advAmt = sub(advAmt, amt);
  } else {
    const remainder = sub(amt, advAmt);
    advAmt = money(0);
    outAmt = add(outAmt, remainder);
  }

  await tx.customer.update({
    where: { id: customerId },
    data: {
      outstandingAmount: outAmt,
      advanceBalance: advAmt
    }
  });
}

/**
 * Update Customer Balance when a Return decreases debt.
 */
export async function decreaseCustomerDebt(tx, customerId, amount) {
  if (!customerId) return;
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) return;

  const amt = money(amount);
  let outAmt = money(customer.outstandingAmount);
  let advAmt = money(customer.advanceBalance);

  if (outAmt.gte(amt)) {
    outAmt = sub(outAmt, amt);
  } else {
    const remainder = sub(amt, outAmt);
    outAmt = money(0);
    advAmt = add(advAmt, remainder);
  }

  await tx.customer.update({
    where: { id: customerId },
    data: {
      outstandingAmount: outAmt,
      advanceBalance: advAmt
    }
  });
}

export { prisma };