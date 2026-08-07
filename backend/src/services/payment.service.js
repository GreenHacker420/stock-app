import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import {
  applyPayments,
  prisma,
  getBillPaymentStatus,
} from "./transactionHelpers.js";

import { postLedgerEntry, reverseLedgerEntry } from "./customer-ledger.service.js";
import { money, sub, add, isZero } from "../utils/money.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { getOrCreateWalkIn } from "./customer.service.js";
import { createNotification } from "./notification.service.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";

async function getPaymentWithAccess(user, id) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { details: true, sale: true, deliveryMemo: true, order: true, customer: true },
  });
  if (!payment) throw new ApiError(404, "Payment not found");
  await assertShopAccess(user, payment.shopId);
  if (user.role === "STAFF" && payment.receivedById !== user.id) {
    throw new ApiError(403, "You can view only your own payments");
  }
  return payment;
}

export async function listPayments(user, { shopId, customerId, paymentMode, status, unlinked, page = 1, limit = 50 }) {
  await assertShopAccess(user, shopId);
  const take = Math.min(Number(limit) || 50, 200);
  const skip = (Math.max(Number(page), 1) - 1) * take;

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
    include: {
      details: true,
      customer: true,
      receivedBy: { select: { id: true, name: true } },
      sale: { select: { id: true, saleNumber: true } },
      order: { select: { id: true, orderNumber: true } }
    },
    orderBy: { receivedAt: "desc" },
    skip,
    take,
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
      if (dm.lifecycleStatus !== "DISPATCHED") {
        throw new ApiError(409, "Payments can be collected only for a dispatched delivery memo", { code: "INVALID_STATE_TRANSITION" });
      }
      if (money(data.amount).gt(money(dm.balanceAmount))) {
        throw new ApiError(400, "Payment exceeds the delivery memo balance", { code: "PAYMENT_EXCEEDS_BALANCE" });
      }
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

    const payment = await tx.payment.findFirst({
      where: {
        shopId: data.shopId,
        receivedById: user.id,
      },
      include: { details: true },
      orderBy: { createdAt: "desc" },
    });

    if (payment) {
      await enqueueManyDomainEvents(tx, [
        createDomainEvent({
          shopId: data.shopId,
          entity: "payment",
          action: "created",
          entityId: payment.id,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
          notification: user.role === "STAFF"
            ? {
                sendPush: true,
                title: "Payment recorded",
                body: `A payment of ₹${Number(payment.amount).toLocaleString("en-IN")} was recorded.`,
                severity: "info",
                deepLink: `stock://payments/${payment.id}`,
              }
            : undefined,
        }),
        createDomainEvent({
          shopId: data.shopId,
          entity: "customer",
          action: "updated",
          entityId: customerId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }),
        createDomainEvent({
          shopId: data.shopId,
          entity: "cashSession",
          action: "updated",
          entityId: data.shopId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }),
        createDomainEvent({
          shopId: data.shopId,
          entity: "dashboard",
          action: "updated",
          entityId: data.shopId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }),
      ]);
    }

    return payment;
  });
}

export async function verifyPayment(user, id, { note }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const payment = await getPaymentWithAccess(user, id);
  if (payment.status === "VERIFIED") return payment;
  if (["REJECTED", "CANCELLED"].includes(payment.status)) {
    throw new ApiError(400, `Cannot verify a ${payment.status.toLowerCase()} payment`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.payment.update({
      where: { id },
      data: {
        status: "VERIFIED",
        verifiedById: user.id,
        verifiedAt: new Date(),
        notes: note || payment.notes,
      },
      include: { details: true },
    });

    if (payment.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: payment.customerId } });
      if (customer && customer.type !== "WALK_IN") {
        await postLedgerEntry(tx, {
          shopId: payment.shopId,
          customerId: payment.customerId,
          sourceType: "PAYMENT",
          sourceId: payment.id,
          entryType: "PAYMENT_RECEIVED",
          direction: "CREDIT",
          amount: payment.amount,
          createdById: user.id,
          effectiveAt: payment.receivedAt || new Date(),
          notes: note || payment.notes || `Verified payment of ₹${payment.amount} via ${payment.paymentMode}`,
        });
      }
    }

    // Update linked Sale paidAmount/paymentStatus
    if (payment.saleId) {
      const sale = await tx.sale.findUnique({ where: { id: payment.saleId } });
      if (sale) {
        const verifiedPayments = await tx.payment.aggregate({
          where: { saleId: payment.saleId, status: "VERIFIED" },
          _sum: { amount: true },
        });
        const newPaid = money(verifiedPayments._sum.amount || 0);
        const newBalance = money(Math.max(0, Number(sale.totalAmount) - Number(newPaid)));
        const newStatus = newPaid.gte(money(sale.totalAmount)) ? "PAID" : newPaid.gt(0) ? "PARTIALLY_PAID" : "UNPAID";
        await tx.sale.update({
          where: { id: payment.saleId },
          data: {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            paymentStatus: newStatus,
            saleStatus: newStatus === "PAID" ? "PAID" : "CONFIRMED",
          },
        });
      }
    }

    // Update linked DeliveryMemo paidAmount/paymentStatus
    if (payment.dmId) {
      const dm = await tx.deliveryMemo.findUnique({ where: { id: payment.dmId } });
      if (dm) {
        const verifiedDmPayments = await tx.payment.aggregate({
          where: { dmId: payment.dmId, status: "VERIFIED" },
          _sum: { amount: true },
        });
        const newDmPaid = money(verifiedDmPayments._sum.amount || 0);
        const newDmBalance = money(Math.max(0, Number(dm.estimatedAmount) - Number(newDmPaid)));
        const newDmStatus = newDmPaid.gte(money(dm.estimatedAmount)) ? "FULLY_PAID" : newDmPaid.gt(0) ? "PARTIALLY_PAID" : "CREATED";
        await tx.deliveryMemo.update({
          where: { id: payment.dmId },
          data: {
            paidAmount: newDmPaid,
            balanceAmount: newDmBalance,
            status: newDmStatus,
          },
        });
      }
    }

    return row;
  });

  await enqueueDomainEvent(prisma, createDomainEvent({
    shopId: payment.shopId,
    entity: "payment",
    action: "verified",
    entityId: id,
    actorUserId: user.id,
    actorRole: user.role,
    visibility: { owners: true, staff: true, targetUserIds: [payment.receivedById] },
    notification: {
      sendPush: true,
      title: "Payment verified",
      body: `Payment of ₹${payment.amount} collected by you from customer ${payment.customer?.name || "Walk-In"} has been verified by the owner.`,
      severity: "success",
      deepLink: `stock://payments/${id}`,
    },
  }));

  return updated;
}

export async function rejectPayment(user, id, { note }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const payment = await getPaymentWithAccess(user, id);
  if (payment.status === "REJECTED") return payment;
  if (["VERIFIED", "CANCELLED"].includes(payment.status)) {
    throw new ApiError(400, `Cannot reject a ${payment.status.toLowerCase()} payment`);
  }

  // A RECORDED payment has never been posted to the ledger, so we ONLY update the
  // payment status. No ledger mutation. No balance change.
  const updated = await prisma.$transaction(async (tx) => {
    return tx.payment.update({
      where: { id },
      data: {
        status: "REJECTED",
        verifiedById: user.id,
        verifiedAt: new Date(),
        notes: note || payment.notes,
      },
      include: { details: true },
    });
  });

  await enqueueDomainEvent(prisma, createDomainEvent({
    shopId: payment.shopId,
    entity: "payment",
    action: "rejected",
    entityId: id,
    actorUserId: user.id,
    actorRole: user.role,
    visibility: { owners: true, staff: true, targetUserIds: [payment.receivedById] },
    notification: {
      sendPush: true,
      title: "Payment rejected",
      body: `Payment of ₹${payment.amount} collected by you from customer ${payment.customer?.name || "Walk-In"} has been rejected by the owner: ${note || "No reason specified"}.`,
      severity: "critical",
      deepLink: `stock://payments/${id}`,
    },
  }));

  return updated;
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

    // 2. Adjust Customer balance via single-use reversal if payment was VERIFIED
    if (existing.status === "VERIFIED" && existing.customerId) {
      const ledgerEntry = await tx.customerLedgerEntry.findFirst({
        where: { shopId: existing.shopId, sourceType: "PAYMENT", sourceId: id, entryType: "PAYMENT_RECEIVED" },
      });
      if (!ledgerEntry) {
        throw new ApiError(409, "Cannot void payment: PAYMENT_RECEIVED ledger entry not found. Data integrity issue — contact support.", { code: "LEDGER_ENTRY_MISSING" });
      }
      await reverseLedgerEntry(tx, {
        shopId: existing.shopId,
        entryId: ledgerEntry.id,
        reversalReason: reason || "Payment voided/cancelled",
        createdById: user.id,
      });
    }

    if (existing.paymentMode === "CASH" && existing.cashSessionId) {
      await tx.cashSession.update({
        where: { id: existing.cashSessionId },
        data: { expectedCash: { decrement: existing.amount } },
      });
    }

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

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: existing.shopId,
        entity: "payment",
        action: "voided",
        entityId: id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: existing.shopId,
        entity: "customer",
        action: "updated",
        entityId: existing.customerId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: existing.shopId,
        entity: "dashboard",
        action: "updated",
        entityId: existing.shopId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      })
    ]);

    return payment;
  });
}

export async function amendPayment(user, id, { amount, reason, expectedUpdatedAt }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const existing = await getPaymentWithAccess(user, id);

  if (!existing.saleId) {
    throw new ApiError(400, "Only sale payments can be corrected from the sale screen");
  }
  if (!["RECORDED", "VERIFIED"].includes(existing.status)) {
    throw new ApiError(409, `Cannot correct a ${existing.status.toLowerCase()} payment`);
  }

  const nextAmount = money(amount);
  const previousAmount = money(existing.amount);
  if (nextAmount.eq(previousAmount)) {
    throw new ApiError(400, "Enter a different payment amount");
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.payment.findUnique({
      where: { id },
      include: { sale: true },
    });
    if (!current) throw new ApiError(404, "Payment not found");
    if (!current.sale || current.shopId !== existing.shopId) {
      throw new ApiError(409, "The linked sale is no longer available");
    }
    if (!["RECORDED", "VERIFIED"].includes(current.status)) {
      throw new ApiError(409, `Cannot correct a ${current.status.toLowerCase()} payment`);
    }
    if (expectedUpdatedAt && current.updatedAt.toISOString() !== expectedUpdatedAt) {
      throw new ApiError(409, "This payment changed on another device. Refresh and try again.");
    }

    const otherPayments = await tx.payment.aggregate({
      where: {
        saleId: current.saleId,
        id: { not: id },
        status: { in: ["RECORDED", "VERIFIED"] },
      },
      _sum: { amount: true },
    });
    const correctedPaidAmount = add(otherPayments._sum.amount || 0, nextAmount);
    if (correctedPaidAmount.gt(money(current.sale.totalAmount))) {
      throw new ApiError(400, "Corrected payments cannot exceed the sale total");
    }

    const delta = sub(nextAmount, current.amount);
    const updateResult = await tx.payment.updateMany({
      where: {
        id,
        ...(expectedUpdatedAt ? { updatedAt: current.updatedAt } : {}),
      },
      data: {
        amount: nextAmount,
        notes: current.notes
          ? `${current.notes}\nCorrection: ${reason}`
          : `Correction: ${reason}`,
      },
    });
    if (updateResult.count !== 1) {
      throw new ApiError(409, "This payment changed on another device. Refresh and try again.");
    }

    if (current.status === "VERIFIED" && current.customerId && current.customer?.type !== "WALK_IN") {
      if (delta.gt(0)) {
        await postLedgerEntry(tx, {
          shopId: current.shopId,
          customerId: current.customerId,
          sourceType: "PAYMENT_AMENDMENT",
          sourceId: current.id,
          entryType: "PAYMENT_VALUE_INCREASE",
          direction: "CREDIT",
          amount: delta.abs(),
          createdById: user.id,
          notes: `Payment amount increased by ${delta.abs()}: ${reason}`,
        });
      } else if (delta.lt(0)) {
        await postLedgerEntry(tx, {
          shopId: current.shopId,
          customerId: current.customerId,
          sourceType: "PAYMENT_AMENDMENT",
          sourceId: current.id,
          entryType: "PAYMENT_VALUE_DECREASE",
          direction: "DEBIT",
          amount: delta.abs(),
          createdById: user.id,
          notes: `Payment amount decreased by ${delta.abs()}: ${reason}`,
        });
      }
    }


    if (current.paymentMode === "CASH" && current.cashSessionId) {
      await tx.cashSession.update({
        where: { id: current.cashSessionId },
        data: {
          expectedCash: delta.gt(0)
            ? { increment: delta }
            : { decrement: delta.abs() },
        },
      });
    }

    const paymentStatus = getBillPaymentStatus(current.sale.totalAmount, correctedPaidAmount);
    const balanceAmount = money(current.sale.totalAmount).minus(correctedPaidAmount);
    await tx.sale.update({
      where: { id: current.saleId },
      data: {
        paidAmount: correctedPaidAmount,
        balanceAmount,
        paymentStatus,
        saleStatus: paymentStatus === "PAID" ? "PAID" : "CONFIRMED",
        version: { increment: 1 },
      },
    });

    const updated = await tx.payment.findUnique({
      where: { id },
      include: { details: true, sale: true, customer: true },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: current.shopId,
        action: "UPDATED",
        entityType: "PAYMENT",
        entityId: id,
        oldValueJson: {
          amount: current.amount.toString(),
          updatedAt: current.updatedAt.toISOString(),
        },
        newValueJson: {
          amount: nextAmount.toString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
        reason,
      },
    });

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: current.shopId,
        entity: "payment",
        action: "amended",
        entityId: id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: current.shopId,
        entity: "sale",
        action: "updated",
        entityId: current.saleId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: current.shopId,
        entity: "customer",
        action: "updated",
        entityId: current.customerId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: current.shopId,
        entity: "cashSession",
        action: "updated",
        entityId: current.cashSessionId || current.shopId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: current.shopId,
        entity: "dashboard",
        action: "updated",
        entityId: current.shopId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
    ]);

    return updated;
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
      const completedReturns = await tx.inventoryReturn.aggregate({
        where: { dmId, status: "COMPLETED" },
        _sum: { netAmount: true },
      });
      const returnCredit = Number(completedReturns._sum.netAmount || 0);
      const balance = Math.max(0, Number(dm.estimatedAmount) - returnCredit - totalPaid);
      const status = balance <= 0 ? "PAID" : (totalPaid > 0 ? "PARTIALLY_PAID" : "UNPAID");

      await tx.deliveryMemo.update({
        where: { id: dmId },
        data: {
          paidAmount: totalPaid,
          balanceAmount: balance,
          paymentStatus: status,
          status: status === "PAID" ? "FULLY_PAID" : (status === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "CREATED")
        }
      });
    }

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: payment.shopId,
        entity: "payment",
        action: "attached",
        entityId: id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: payment.shopId,
        entity: "customer",
        action: "updated",
        entityId: payment.customerId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: payment.shopId,
        entity: "dashboard",
        action: "updated",
        entityId: payment.shopId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      ...(saleId ? [
        createDomainEvent({
          shopId: payment.shopId,
          entity: "sale",
          action: "updated",
          entityId: saleId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        })
      ] : []),
      ...(dmId ? [
        createDomainEvent({
          shopId: payment.shopId,
          entity: "deliveryMemo",
          action: "updated",
          entityId: dmId,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        })
      ] : [])
    ]);

    return updatedPayment;
  });
}

export { rejectPayment as markMismatch };
