import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { formatRecordNumber } from "../utils/recordNumber.js";
import { getDayRange } from "../utils/dateRange.js";
import { money, add, sub, mul, div, isZero } from "../utils/money.js";
import { createNotification, notifyShopOwner } from "./notification.service.js";
import { postLedgerEntry } from "./customer-ledger.service.js";

export async function generateRecordNumber(tx, { shopId, model, field, prefix, date = new Date(), dateField = "createdAt" }) {
  const { start, end } = getDayRange(date);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`record-number:${shopId}:${model}`}))`;
  const datePrefix = formatRecordNumber(prefix, date, 0).replace(/000$/, "");
  const rows = await tx[model].findMany({
    where: {
      shopId,
      [dateField]: {
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


export async function createStockIn(tx, { shopId, itemId, quantity, movementType, referenceType, referenceId, reason, userId }) {
  const movement = await tx.stockLedger.create({
    data: {
      shopId,
      itemId,
      movementType,
      quantityIn: quantity,
      quantityOut: 0,
      referenceType,
      referenceId,
      reason,
      createdById: userId,
    },
  });

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

async function resolveCashSessionForPayment(tx, shopId, paymentMode, receivedAt) {
  if (paymentMode !== "CASH") return null;

  if (getIndiaDateKey(receivedAt) !== getIndiaDateKey()) return null;

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
 * Apply payments cleanly, recording payments and posting verified ones to customer ledger.
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
    const rawAmt = money(payment.amount);
    if (rawAmt.lte(0)) continue;

    let amt = rawAmt;
    let paymentNotes = payment.notes;

    if (payment.paymentMode === "CASH" && saleId && totalVal.gt(0)) {
      const remainingBalance = Math.max(0, sub(totalVal, newPaid));
      if (remainingBalance > 0 && rawAmt.gt(remainingBalance)) {
        amt = money(remainingBalance);
        const changeReturned = sub(rawAmt, amt);
        const changeNote = `Tendered: ₹${rawAmt.toFixed(2)}, Change Returned: ₹${changeReturned.toFixed(2)}`;
        paymentNotes = paymentNotes ? `${paymentNotes} (${changeNote})` : changeNote;
      }
    }

    const isAutoVerified = user?.role === "OWNER" || payment.paymentMode === "CASH";
    const receivedAt = resolvePaymentDate(payment.paymentDate);
    const cashSessionId = await resolveCashSessionForPayment(tx, shopId, payment.paymentMode, receivedAt);

    // Only verified payments contribute to bill paidAmount immediately
    if (isAutoVerified) {
      newPaid = add(newPaid, amt);
    }

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
        status: isAutoVerified ? "VERIFIED" : "RECORDED",
        receivedById: user.id,
        receivedAt,
        verifiedById: isAutoVerified ? user.id : null,
        verifiedAt: isAutoVerified ? new Date() : null,
        cashSessionId,
        notes: paymentNotes,
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

    // Post to Customer Ledger ONLY if verified and customerId is present (Walk-in check handled inside postLedgerEntry)
    if (customerId && isAutoVerified) {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (customer && customer.type !== "WALK_IN") {
        await postLedgerEntry(tx, {
          shopId,
          customerId,
          sourceType: "PAYMENT",
          sourceId: createdPayment.id,
          entryType: "PAYMENT_RECEIVED",
          direction: "CREDIT",
          amount: amt,
          createdById: user.id,
          effectiveAt: receivedAt,
          notes: paymentNotes || `Payment of ₹${amt} received via ${payment.paymentMode}`,
        });
      }
    }

    // Alert the owner for non-cash payments pending verification (only when recorded by STAFF)
    if (!isAutoVerified) {
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

function resolvePaymentDate(value) {
  if (!value) return new Date();

  const now = new Date();
  const todayParts = getIndiaDateParts(now, true);
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  if (value > today) {
    throw new ApiError(400, "Payment date cannot be in the future");
  }

  const calendarCheck = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(calendarCheck.getTime()) || calendarCheck.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "Invalid payment date");
  }
  return new Date(`${value}T${todayParts.hour}:${todayParts.minute}:${todayParts.second}+05:30`);
}

function getIndiaDateParts(date = new Date(), includeTime = false) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    } : {}),
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getIndiaDateKey(date = new Date()) {
  const parts = getIndiaDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Legacy compatibility wrapper that delegates debt increase to CustomerLedger.
 */
export async function increaseCustomerDebt(tx, customerId, amount, details = {}) {
  if (!customerId) return;
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.type === "WALK_IN") return;
  
  const amt = money(amount);
  if (amt.lte(0)) return;

  if (details.shopId && details.sourceType && details.sourceId && details.createdById) {
    await postLedgerEntry(tx, {
      shopId: details.shopId,
      customerId,
      sourceType: details.sourceType,
      sourceId: details.sourceId,
      entryType: details.entryType || "SALE_POSTED",
      direction: "DEBIT",
      amount: amt,
      createdById: details.createdById,
      effectiveAt: details.effectiveAt || new Date(),
      notes: details.notes || null,
    });
  } else {
    // Basic fallback lock and update
    const currentNet = sub(customer.outstandingAmount, customer.advanceBalance);
    const newNet = add(currentNet, amt);
    await tx.customer.update({
      where: { id: customerId },
      data: {
        outstandingAmount: newNet.gt(0) ? newNet : money(0),
        advanceBalance: newNet.lt(0) ? sub(0, newNet) : money(0),
        ledgerVersion: { increment: 1 },
      },
    });
  }
}

export async function postCustomerReceivable(tx, customerId, amount, details = {}) {
  if (!customerId) return { advanceApplied: money(0), outstandingCreated: money(0) };
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.type === "WALK_IN") {
    return { advanceApplied: money(0), outstandingCreated: money(0) };
  }
  const total = money(amount);
  const availableAdvance = money(customer.advanceBalance || 0);
  const advanceApplied = availableAdvance.lt(total) ? availableAdvance : total;
  const outstandingCreated = sub(total, advanceApplied);

  if (details.shopId && details.sourceType && details.sourceId && details.createdById) {
    await postLedgerEntry(tx, {
      shopId: details.shopId,
      customerId,
      sourceType: details.sourceType,
      sourceId: details.sourceId,
      entryType: details.entryType || "SALE_POSTED",
      direction: "DEBIT",
      amount: total,
      createdById: details.createdById,
      effectiveAt: details.effectiveAt || new Date(),
      notes: details.notes || null,
    });
  } else {
    const currentNet = sub(customer.outstandingAmount, customer.advanceBalance);
    const newNet = add(currentNet, total);
    await tx.customer.update({
      where: { id: customerId },
      data: {
        outstandingAmount: newNet.gt(0) ? newNet : money(0),
        advanceBalance: newNet.lt(0) ? sub(0, newNet) : money(0),
        ledgerVersion: { increment: 1 },
      },
    });
  }

  return { advanceApplied, outstandingCreated };
}

/**
 * Legacy compatibility wrapper that delegates debt decrease to CustomerLedger.
 */
export async function decreaseCustomerDebt(tx, customerId, amount, details = {}) {
  if (!customerId) return;
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.type === "WALK_IN") return;

  const amt = money(amount);
  if (amt.lte(0)) return;

  if (details.shopId && details.sourceType && details.sourceId && details.createdById) {
    await postLedgerEntry(tx, {
      shopId: details.shopId,
      customerId,
      sourceType: details.sourceType,
      sourceId: details.sourceId,
      entryType: details.entryType || "PAYMENT_RECEIVED",
      direction: "CREDIT",
      amount: amt,
      createdById: details.createdById,
      effectiveAt: details.effectiveAt || new Date(),
      notes: details.notes || null,
    });
  } else {
    const currentNet = sub(customer.outstandingAmount, customer.advanceBalance);
    const newNet = sub(currentNet, amt);
    await tx.customer.update({
      where: { id: customerId },
      data: {
        outstandingAmount: newNet.gt(0) ? newNet : money(0),
        advanceBalance: newNet.lt(0) ? sub(0, newNet) : money(0),
        ledgerVersion: { increment: 1 },
      },
    });
  }
}

export { prisma };
