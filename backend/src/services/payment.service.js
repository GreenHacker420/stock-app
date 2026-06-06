import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { applyPayments, prisma, syncInvoiceBalances } from "./transactionHelpers.js";
import { money, sub, add, isZero } from "../utils/money.js";
import { writeAuditLog } from "../utils/auditLog.js";

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

export async function voidPayment(user, id, { reason } = {}) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const existing = await getPaymentWithAccess(user, id);
  if (existing.isVoided) throw new ApiError(400, "Payment is already voided");

  return prisma.$transaction(async (tx) => {
    // 1. Mark Payment as voided
    const payment = await tx.payment.update({
      where: { id },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidedById: user.id,
        verificationStatus: "CANCELLED",
        notes: reason || existing.notes
      },
      include: { details: true }
    });

    // 2. Revert active PAYMENT allocations
    const allocations = await tx.paymentAllocation.findMany({
      where: { paymentId: id, status: "ACTIVE", allocationType: "PAYMENT" }
    });

    for (const allocation of allocations) {
      await tx.paymentAllocation.update({
        where: { id: allocation.id },
        data: { status: "REVERSED" }
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId: id,
          creditOutstandingId: allocation.creditOutstandingId,
          customerAdvanceId: allocation.customerAdvanceId,
          amount: allocation.amount,
          allocationType: "REVERSAL",
          status: "REVERSED",
          reversalOfId: allocation.id
        }
      });

      if (allocation.creditOutstandingId) {
        const debt = await tx.creditOutstanding.findUnique({
          where: { id: allocation.creditOutstandingId }
        });
        if (debt) {
          const newPaid = sub(debt.paidAmount, allocation.amount);
          const newPending = add(debt.pendingAmount, allocation.amount);
          let debtStatus = "PARTIALLY_PAID";
          if (isZero(newPending)) {
            debtStatus = "PAID";
          } else if (newPaid.eq(0)) {
            debtStatus = "PENDING";
          }

          await tx.creditOutstanding.update({
            where: { id: debt.id },
            data: {
              pendingAmount: newPending,
              paidAmount: newPaid,
              status: debtStatus
            }
          });

          await syncInvoiceBalances(tx, debt.id);
        }
      }
    }

    // 3. Cancel the advance if one was generated by this payment
    const advance = await tx.customerAdvance.findUnique({
      where: { paymentId: id }
    });
    if (advance) {
      const advAllocations = await tx.paymentAllocation.findMany({
        where: { customerAdvanceId: advance.id, status: "ACTIVE", allocationType: "ADVANCE_APPLIED" }
      });

      for (const allocation of advAllocations) {
        await tx.paymentAllocation.update({
          where: { id: allocation.id },
          data: { status: "REVERSED" }
        });

        await tx.paymentAllocation.create({
          data: {
            paymentId: allocation.paymentId,
            creditOutstandingId: allocation.creditOutstandingId,
            customerAdvanceId: advance.id,
            amount: allocation.amount,
            allocationType: "REVERSAL",
            status: "REVERSED",
            reversalOfId: allocation.id
          }
        });

        if (allocation.creditOutstandingId) {
          const debt = await tx.creditOutstanding.findUnique({
            where: { id: allocation.creditOutstandingId }
          });
          if (debt) {
            const newPaid = sub(debt.paidAmount, allocation.amount);
            const newPending = add(debt.pendingAmount, allocation.amount);
            let debtStatus = "PARTIALLY_PAID";
            if (isZero(newPending)) {
              debtStatus = "PAID";
            } else if (newPaid.eq(0)) {
              debtStatus = "PENDING";
            }

            await tx.creditOutstanding.update({
              where: { id: debt.id },
              data: {
                pendingAmount: newPending,
                paidAmount: newPaid,
                status: debtStatus
              }
            });

            await syncInvoiceBalances(tx, debt.id);
          }
        }
      }

      await tx.customerAdvance.update({
        where: { id: advance.id },
        data: {
          pendingAmount: money(0),
          paidAmount: money(0),
          status: "CANCELLED",
          isVoided: true,
          voidedAt: new Date(),
          voidedById: user.id
        }
      });
    }

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: existing.shopId,
      action: "payment.voided",
      entityType: "Payment",
      entityId: id,
      oldValueJson: existing,
      newValueJson: payment,
      reason
    });

    return payment;
  });
}
