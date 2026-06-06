import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { notifyShopOwner } from "./notification.service.js";
import { money, add, sub, isZero } from "../utils/money.js";
import { syncInvoiceBalances } from "./transactionHelpers.js";

async function getChequePayment(user, id) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { details: true, customer: true, sale: true, deliveryMemo: true, order: true },
  });
  if (!payment || payment.paymentMode !== "CHEQUE") throw new ApiError(404, "Cheque payment not found");
  await assertShopAccess(user, payment.shopId);
  return payment;
}

export async function listCheques(user, { shopId, status }) {
  if (shopId) await assertShopAccess(user, shopId);
  const shopIds = shopId ? [shopId] : await accessibleShopIds(user);

  return prisma.payment.findMany({
    where: {
      shopId: { in: shopIds },
      paymentMode: "CHEQUE",
      details: { chequeStatus: status || undefined },
    },
    include: { details: true, customer: true, receivedBy: { select: { id: true, name: true } } },
    orderBy: { receivedAt: "desc" },
  });
}

async function accessibleShopIds(user) {
  if (user.role === "OWNER") {
    const shops = await prisma.shop.findMany({ where: { ownerId: user.id }, select: { id: true } });
    return shops.map((shop) => shop.id);
  }
  const accesses = await prisma.staffShopAccess.findMany({ where: { staffId: user.id }, select: { shopId: true } });
  return accesses.map((access) => access.shopId);
}

export async function getCheque(user, id) {
  return getChequePayment(user, id);
}

export async function updateChequeStatus(user, id, status, { reason } = {}) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const existing = await getChequePayment(user, id);

  const dateFieldByStatus = {
    DEPOSITED: { chequeDepositDate: new Date() },
    CLEARED: { chequeClearDate: new Date() },
    BOUNCED: { chequeClearDate: new Date() },
    RETURNED: {},
  };

  return prisma.$transaction(async (tx) => {
    const details = await tx.paymentDetail.upsert({
      where: { paymentId: id },
      update: {
        chequeStatus: status,
        ...(dateFieldByStatus[status] || {}),
      },
      create: {
        paymentId: id,
        chequeStatus: status,
        ...(dateFieldByStatus[status] || {}),
      },
    });

    const payment = await tx.payment.update({
      where: { id },
      data: {
        verificationStatus: status === "CLEARED" ? "VERIFIED" : status === "BOUNCED" ? "MISMATCH" : existing.verificationStatus,
        verifiedById: ["CLEARED", "BOUNCED"].includes(status) ? user.id : existing.verifiedById,
        verifiedAt: ["CLEARED", "BOUNCED"].includes(status) ? new Date() : existing.verifiedAt,
        notes: reason || existing.notes,
      },
      include: { details: true, customer: true },
    });

    if (status === "BOUNCED" && existing.customerId) {
      // Find all active PAYMENT allocations for this payment
      const allocations = await tx.paymentAllocation.findMany({
        where: { paymentId: id, status: "ACTIVE", allocationType: "PAYMENT" }
      });

      for (const allocation of allocations) {
        // Mark original allocation as REVERSED
        await tx.paymentAllocation.update({
          where: { id: allocation.id },
          data: { status: "REVERSED" }
        });

        // Create REVERSAL allocation
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

        // Revert CreditOutstanding
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

            // Sync parent invoice columns
            await syncInvoiceBalances(tx, debt.id);
          }
        }
      }

      // Check if this payment generated any CustomerAdvance
      const advance = await tx.customerAdvance.findUnique({
        where: { paymentId: id }
      });
      if (advance) {
        // Find all active ADVANCE_APPLIED allocations for this advance
        const advAllocations = await tx.paymentAllocation.findMany({
          where: { customerAdvanceId: advance.id, status: "ACTIVE", allocationType: "ADVANCE_APPLIED" }
        });

        for (const allocation of advAllocations) {
          // Mark original allocation as REVERSED
          await tx.paymentAllocation.update({
            where: { id: allocation.id },
            data: { status: "REVERSED" }
          });

          // Create REVERSAL allocation
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

          // Revert CreditOutstanding
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

              // Sync parent invoice
              await syncInvoiceBalances(tx, debt.id);
            }
          }
        }

        // Cancel the advance completely
        await tx.customerAdvance.update({
          where: { id: advance.id },
          data: {
            pendingAmount: money(0),
            paidAmount: money(0),
            status: "CANCELLED"
          }
        });
      }

      await notifyShopOwner(tx, {
        shopId: existing.shopId,
        triggerEvent: "cheque.bounced",
        entityType: "Payment",
        entityId: id,
        message: `Cheque bounced for ₹${existing.amount}`,
      });
    }

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: existing.shopId,
      action: `cheque.${status.toLowerCase()}`,
      entityType: "Payment",
      entityId: id,
      oldValueJson: existing.details,
      newValueJson: details,
      reason,
    });

    return payment;
  });
}
