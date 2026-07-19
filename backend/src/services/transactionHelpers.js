import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { formatRecordNumber } from "../utils/recordNumber.js";
import { getDayRange } from "../utils/dateRange.js";
import { money, add, sub, mul, div, isZero } from "../utils/money.js";
import { createNotification, notifyShopOwner } from "./notification.service.js";

export async function generateRecordNumber(tx, { shopId, model, field, prefix, date = new Date() }) {
  const { start, end } = getDayRange(date);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`record-number:${shopId}:${model}`}))`;
  const datePrefix = formatRecordNumber(prefix, date, 0).replace(/000$/, "");
  const rows = await tx[model].findMany({
    where: {
      shopId,
      createdAt: {
        gte: start,
        lt: end,
      },
      [field]: { startsWith: datePrefix },
    },
    select: { [field]: true },
  });
  const maxCounter = rows.reduce((max, row) => {
    const counter = Number(String(row[field] || "").slice(datePrefix.length));
    return Number.isFinite(counter) ? Math.max(max, counter) : max;
  }, 0);
  return formatRecordNumber(prefix, date, maxCounter + 1);
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

  const movement = await tx.stockLedger.create({
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

  // Check low stock alert status
  try {
    const item = await tx.item.findUnique({
      where: { id: itemId },
      select: { name: true, minimumStock: true, unit: true }
    });
    if (item && item.minimumStock !== null) {
      const currentQuantity = await getCurrentQuantity(tx, shopId, itemId);
      if (currentQuantity <= Number(item.minimumStock)) {
        const msg = `Low stock alert: ${item.name} is down to ${currentQuantity} ${item.unit || ""} (Minimum: ${item.minimumStock}).`;
        
        // Notify all owners
        await notifyShopOwner(tx, {
          shopId,
          triggerEvent: "LOW_STOCK",
          entityType: "ITEM",
          entityId: itemId,
          message: msg,
        });

        // Notify active staff member who triggered the stockout if they are not the primary owner
        const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { ownerId: true } });
        if (userId && shop && userId !== shop.ownerId) {
          await createNotification(tx, {
            userId,
            shopId,
            triggerEvent: "LOW_STOCK",
            entityType: "ITEM",
            entityId: itemId,
            message: msg,
          });
        }
      }
    }
  } catch (err) {
    console.error(`[LowStockAlert] Error triggering low stock check for item ${itemId}:`, err.message);
  }

  return movement;
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

async function resolveCashSessionForPayment(tx, shopId, paymentMode) {
  if (paymentMode !== "CASH") return null;

  const session = await tx.cashSession.findFirst({
    where: {
      shopId,
      status: "OPEN",
    },
    orderBy: { openedAt: "desc" },
    select: { id: true },
  });

  if (!session) {
    throw new ApiError(400, "Open cash session required to record cash payment");
  }

  return session.id;
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
    const amt = money(payment.amount);
    if (amt.lte(0)) continue;

    newPaid = add(newPaid, amt);
    const cashSessionId = await resolveCashSessionForPayment(tx, shopId, payment.paymentMode);

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
        status: payment.paymentMode === "CASH" ? "VERIFIED" : "RECORDED",
        receivedById: user.id,
        cashSessionId,
        notes: payment.notes,
        details: payment.details ? {
          create: payment.details
        } : undefined
      }
    });

    if (cashSessionId) {
      await tx.cashSession.update({
        where: { id: cashSessionId },
        data: { expectedCash: { increment: amt } },
      });
    }

    // Update Customer outstanding (reduces with payment)
    if (customerId) {
      await decreaseCustomerDebt(tx, customerId, amt);
      if (dmId) {
        await tx.customerLedgerEntry.create({
          data: {
            shopId,
            customerId,
            sourceType: "PAYMENT",
            sourceId: createdPayment.id,
            entryType: "PAYMENT_RECEIVED",
            direction: "CREDIT",
            amount: amt,
            createdById: user.id,
            notes: `Payment allocated to delivery memo ${dmId}`,
          },
        });
      }
    }

    // Alert the owner for non-cash payments pending verification
    if (payment.paymentMode !== "CASH") {
      try {
        const customer = customerId ? await tx.customer.findUnique({ where: { id: customerId }, select: { name: true } }) : null;
        const customerName = customer?.name || "Walk-In";
        await notifyShopOwner(tx, {
          shopId,
          triggerEvent: "APPROVAL_REQUESTED",
          entityType: "PAYMENT",
          entityId: createdPayment.id,
          message: `New payment of ₹${amt} via ${payment.paymentMode} from ${customerName} received by ${user.name || "staff"} pending verification.`,
        });
      } catch (err) {
        console.error(`[NonCashPaymentAlert] Error triggering verification alert:`, err.message);
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
  if (!customer || customer.type === "WALK_IN") return;
  
  const amt = money(amount);
  const outAmt = add(customer.outstandingAmount, amt);

  await tx.customer.update({
    where: { id: customerId },
    data: {
      outstandingAmount: outAmt
    }
  });
}

export async function postCustomerReceivable(tx, customerId, amount) {
  if (!customerId) return { advanceApplied: money(0), outstandingCreated: money(0) };
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.type === "WALK_IN") {
    return { advanceApplied: money(0), outstandingCreated: money(0) };
  }
  const total = money(amount);
  const availableAdvance = money(customer.advanceBalance || 0);
  const advanceApplied = availableAdvance.lt(total) ? availableAdvance : total;
  const outstandingCreated = sub(total, advanceApplied);
  await tx.customer.update({
    where: { id: customerId },
    data: {
      advanceBalance: sub(availableAdvance, advanceApplied),
      outstandingAmount: add(customer.outstandingAmount, outstandingCreated),
    },
  });
  return { advanceApplied, outstandingCreated };
}

/**
 * Update Customer Balance when a Return/Payment decreases debt.
 */
export async function decreaseCustomerDebt(tx, customerId, amount) {
  if (!customerId) return;
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.type === "WALK_IN") return;

  const amt = money(amount);
  const outAmt = sub(customer.outstandingAmount, amt);

  await tx.customer.update({
    where: { id: customerId },
    data: {
      outstandingAmount: outAmt
    }
  });
}

export { prisma };
