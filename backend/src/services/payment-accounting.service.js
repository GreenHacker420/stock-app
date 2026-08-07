import { ApiError } from "../utils/ApiError.js";
import { money, add, sub } from "../utils/money.js";
import { notifyShopOwner } from "./notification.service.js";
import { postLedgerEntry, allocateLedgerCredit } from "./customer-ledger.service.js";
import { getBillPaymentStatus } from "./transactionHelpers.js";
import { legacyDeliveryMemoStatusForPayment } from "./deliveryMemo.domain.js";

function getIndiaDateParts(date = new Date(), includeTime = false) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }
      : {}),
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getIndiaDateKey(date = new Date()) {
  const parts = getIndiaDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function resolvePaymentDate(value) {
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

export async function resolveCashSessionForPayment(tx, shopId, paymentMode, receivedAt) {
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
 * Auto-allocate a verified payment credit to its linked sale/DM debit.
 * Excess credit remains unallocated (customer advance).
 */
export async function allocateVerifiedPayment(tx, {
  shopId,
  customerId,
  paymentId,
  creditEntryId,
  amount,
  createdById,
  saleId,
  dmId,
}) {
  let preferredDebit = null;

  if (saleId) {
    preferredDebit = await tx.customerLedgerEntry.findFirst({
      where: {
        shopId,
        customerId,
        sourceType: "SALE",
        sourceId: saleId,
        entryType: "SALE_POSTED",
        direction: "DEBIT",
        reversalOfId: null,
      },
    });
  } else if (dmId) {
    preferredDebit = await tx.customerLedgerEntry.findFirst({
      where: {
        shopId,
        customerId,
        sourceType: "DELIVERY_MEMO",
        sourceId: dmId,
        entryType: "DELIVERY_MEMO_POSTED",
        direction: "DEBIT",
        reversalOfId: null,
      },
    });
  }

  if (!preferredDebit) return null;

  // Skip if debit already reversed
  const debitReversal = await tx.customerLedgerEntry.findFirst({
    where: { reversalOfId: preferredDebit.id },
  });
  if (debitReversal) return null;

  const existingAlloc = await tx.customerLedgerAllocation.aggregate({
    where: { debitEntryId: preferredDebit.id, reversedAt: null },
    _sum: { amount: true },
  });
  const allocated = money(existingAlloc._sum.amount || 0);
  const remaining = sub(preferredDebit.amount, allocated);
  if (remaining.lte(0)) return null;

  const creditExisting = await tx.customerLedgerAllocation.aggregate({
    where: { creditEntryId, reversedAt: null },
    _sum: { amount: true },
  });
  const creditAllocated = money(creditExisting._sum.amount || 0);
  const creditRemaining = sub(amount, creditAllocated);
  if (creditRemaining.lte(0)) return null;

  const allocAmount = remaining.lt(creditRemaining) ? remaining : creditRemaining;
  if (allocAmount.lte(0)) return null;

  return allocateLedgerCredit(tx, {
    shopId,
    customerId,
    debitEntryId: preferredDebit.id,
    creditEntryId,
    amount: allocAmount,
    createdById,
    clientMutationId: `alloc:payment:${paymentId}:${preferredDebit.id}`,
  });
}

/**
 * Recompute sale/DM/order paidAmount/balance from VERIFIED payments only.
 */
export async function recomputeLinkedDocumentPaymentState(tx, { saleId, dmId, orderId }) {
  const result = {};

  if (saleId) {
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (sale) {
      const verified = await tx.payment.aggregate({
        where: { saleId, status: "VERIFIED" },
        _sum: { amount: true },
      });
      const paidAmount = money(verified._sum.amount || 0);
      const balanceAmount = money(Math.max(0, Number(sale.totalAmount) - Number(paidAmount)));
      const paymentStatus = getBillPaymentStatus(sale.totalAmount, paidAmount);
      result.sale = await tx.sale.update({
        where: { id: saleId },
        data: {
          paidAmount,
          balanceAmount,
          paymentStatus,
          saleStatus: paymentStatus === "PAID" ? "PAID" : sale.saleStatus === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
        },
      });
    }
  }

  if (dmId) {
    const dm = await tx.deliveryMemo.findUnique({ where: { id: dmId } });
    if (dm) {
      const verified = await tx.payment.aggregate({
        where: { dmId, status: "VERIFIED" },
        _sum: { amount: true },
      });
      const paidAmount = money(verified._sum.amount || 0);
      const total = money(dm.estimatedAmount || 0);
      const balanceAmount = money(Math.max(0, Number(total) - Number(paidAmount)));
      const paymentStatus = getBillPaymentStatus(total, paidAmount);
      result.deliveryMemo = await tx.deliveryMemo.update({
        where: { id: dmId },
        data: {
          paidAmount,
          balanceAmount,
          paymentStatus,
          status: legacyDeliveryMemoStatusForPayment(paymentStatus),
        },
      });
    }
  }

  if (orderId) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (order) {
      const verified = await tx.payment.aggregate({
        where: { orderId, status: "VERIFIED" },
        _sum: { amount: true },
      });
      const paidAmount = money(verified._sum.amount || 0);
      const balanceAmount = money(Math.max(0, Number(order.totalAmount || 0) - Number(paidAmount)));
      result.order = await tx.order.update({
        where: { id: orderId },
        data: {
          paidAmount,
          balanceAmount,
        },
      });
    }
  }

  return result;
}

/**
 * Record payments against a bill. Only VERIFIED payments affect paidAmount and ledger.
 */
export async function applyPayments(tx, {
  user,
  shopId,
  saleId,
  dmId,
  orderId,
  customerId,
  totalAmount,
  existingPaidAmount = 0,
  payments,
}) {
  let newPaid = money(existingPaidAmount);
  const totalVal = money(totalAmount);

  if (!payments || payments.length === 0) {
    return {
      paidAmount: newPaid,
      balanceAmount: sub(totalVal, newPaid),
      paymentStatus: getBillPaymentStatus(totalVal, newPaid),
      createdPayments: [],
    };
  }

  const createdPayments = [];

  for (const payment of payments) {
    const rawAmt = money(payment.amount);
    if (rawAmt.lte(0)) continue;

    let amt = rawAmt;
    let paymentNotes = payment.notes;

    if (payment.paymentMode === "CASH" && saleId && totalVal.gt(0)) {
      const remainingBalance = Math.max(0, Number(sub(totalVal, newPaid)));
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

    if (isAutoVerified) {
      newPaid = add(newPaid, amt);
    }

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
        details: payment.details
          ? {
              create: payment.details,
            }
          : undefined,
      },
    });
    createdPayments.push(createdPayment);

    if (cashSessionId) {
      await tx.cashSession.update({
        where: { id: cashSessionId },
        data: { expectedCash: { increment: amt } },
      });
    }

    if (customerId && isAutoVerified) {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (customer && customer.type !== "WALK_IN") {
        const ledgerResult = await postLedgerEntry(tx, {
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

        if (!ledgerResult.isDuplicate) {
          await allocateVerifiedPayment(tx, {
            shopId,
            customerId,
            paymentId: createdPayment.id,
            creditEntryId: ledgerResult.entry.id,
            amount: amt,
            createdById: user.id,
            saleId,
            dmId,
          });
        }
      }
    }

    if (!isAutoVerified) {
      try {
        const customer = customerId
          ? await tx.customer.findUnique({ where: { id: customerId }, select: { name: true } })
          : null;
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
    createdPayments,
  };
}
