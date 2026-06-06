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

export async function ensureSystemUser(tx) {
  let ownerRole = await tx.role.findFirst({
    where: { name: "OWNER" }
  });
  if (!ownerRole) {
    ownerRole = await tx.role.create({
      data: { name: "OWNER" }
    });
  }
  return tx.user.upsert({
    where: { id: "SYSTEM" },
    update: {},
    create: {
      id: "SYSTEM",
      name: "SYSTEM_USER",
      mobile: "0000000000",
      passwordHash: "SYSTEM_NO_PASSWORD",
      roleId: ownerRole.id,
      status: "ACTIVE"
    }
  });
}

export async function syncInvoiceBalances(tx, debtId) {
  const debt = await tx.creditOutstanding.findUnique({
    where: { id: debtId }
  });

  if (!debt) return;

  const pending = money(debt.pendingAmount);
  const original = money(debt.originalAmount);
  const paid = sub(original, pending);

  if (debt.saleId) {
    const paymentStatus = getBillPaymentStatus(original, paid);
    await tx.sale.update({
      where: { id: debt.saleId },
      data: {
        paidAmount: paid,
        balanceAmount: pending,
        paymentStatus,
        saleStatus: paymentStatus === "PAID" ? "PAID" : "PENDING_PAYMENT"
      }
    });
  }

  if (debt.dmId) {
    const paymentStatus = getBillPaymentStatus(original, paid);
    await tx.deliveryMemo.update({
      where: { id: debt.dmId },
      data: {
        paidAmount: paid,
        balanceAmount: pending,
        paymentStatus,
        status: paymentStatus === "PAID" ? "FULLY_PAID" : "PARTIALLY_PAID"
      }
    });
  }

  if (debt.orderId) {
    const paymentStatus = getBillPaymentStatus(original, paid);
    await tx.order.update({
      where: { id: debt.orderId },
      data: {
        paidAmount: paid,
        balanceAmount: pending,
        paymentStatus
      }
    });
  }
}

export async function autoAllocateCustomerAdvances(tx, { customerId, shopId, userId }) {
  const advances = await tx.customerAdvance.findMany({
    where: {
      customerId,
      shopId,
      status: { notIn: ["PAID", "CANCELLED"] },
      pendingAmount: { gt: 0 }
    },
    orderBy: { createdAt: "asc" }
  });

  if (advances.length === 0) return;

  const debts = await tx.creditOutstanding.findMany({
    where: {
      customerId,
      shopId,
      status: { notIn: ["PAID", "CANCELLED"] },
      pendingAmount: { gt: 0 }
    },
    orderBy: { createdAt: "asc" }
  });

  if (debts.length === 0) return;

  for (const advance of advances) {
    let advPending = money(advance.pendingAmount);
    if (advPending.lte(0)) continue;

    for (const debt of debts) {
      let debtPending = money(debt.pendingAmount);
      if (debtPending.lte(0)) continue;

      const amountToAllocate = advPending.lt(debtPending) ? advPending : debtPending;

      // Allocate
      advPending = sub(advPending, amountToAllocate);
      debtPending = sub(debtPending, amountToAllocate);

      // Update CustomerAdvance
      const newAdvPaid = add(advance.paidAmount, amountToAllocate);
      const newAdvPending = sub(advance.originalAmount, newAdvPaid);
      let advStatus = "PARTIALLY_PAID";
      if (isZero(newAdvPending)) {
        advStatus = "PAID";
      } else if (newAdvPaid.eq(0)) {
        advStatus = "PENDING";
      }
      
      await tx.customerAdvance.update({
        where: { id: advance.id },
        data: {
          pendingAmount: newAdvPending,
          paidAmount: newAdvPaid,
          status: advStatus
        }
      });

      // Update CreditOutstanding
      const newDebtPaid = add(debt.paidAmount, amountToAllocate);
      const newDebtPending = sub(debt.originalAmount, newDebtPaid);
      let debtStatus = "PARTIALLY_PAID";
      if (isZero(newDebtPending)) {
        debtStatus = "PAID";
      } else if (newDebtPaid.eq(0)) {
        debtStatus = "PENDING";
      }

      await tx.creditOutstanding.update({
        where: { id: debt.id },
        data: {
          pendingAmount: newDebtPending,
          paidAmount: newDebtPaid,
          status: debtStatus
        }
      });

      // Create PaymentAllocation
      await tx.paymentAllocation.create({
        data: {
          paymentId: advance.paymentId || "",
          creditOutstandingId: debt.id,
          customerAdvanceId: advance.id,
          amount: amountToAllocate,
          allocationType: "ADVANCE_APPLIED",
          status: "ACTIVE"
        }
      });

      // Sync parent invoices
      await syncInvoiceBalances(tx, debt.id);

      if (advPending.lte(0)) break;
    }
  }
}

export async function applyPayments(tx, { user, shopId, saleId, dmId, orderId, customerId, totalAmount, existingPaidAmount = 0, payments = [] }) {
  if (!payments.length) {
    let targetDebt = null;
    if (saleId) {
      targetDebt = await tx.creditOutstanding.findUnique({ where: { saleId } });
    } else if (dmId) {
      targetDebt = await tx.creditOutstanding.findUnique({ where: { dmId } });
    } else if (orderId) {
      targetDebt = await tx.creditOutstanding.findFirst({ where: { orderId } });
    }

    if (targetDebt) {
      const pending = money(targetDebt.pendingAmount);
      const original = money(targetDebt.originalAmount);
      const paid = sub(original, pending);
      return {
        paidAmount: paid,
        balanceAmount: pending,
        paymentStatus: getBillPaymentStatus(original, paid)
      };
    } else {
      const paidAmount = money(existingPaidAmount);
      const balanceAmount = sub(totalAmount, paidAmount);
      return {
        paidAmount,
        balanceAmount,
        paymentStatus: getBillPaymentStatus(totalAmount, paidAmount)
      };
    }
  }

  for (const payment of payments) {
    const paymentAmount = money(payment.amount);
    if (paymentAmount.lte(0)) {
      throw new ApiError(400, "Payment amount must be greater than zero");
    }

    // Guard precision
    assertMoney(paymentAmount);

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

    const createdPayment = await tx.payment.create({
      data: {
        shopId,
        saleId,
        dmId,
        orderId,
        customerId,
        paymentMode: payment.paymentMode,
        amount: paymentAmount,
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

    let remaining = paymentAmount;

    // 1. Targeted Allocation
    if (customerId) {
      let targetDebt = null;
      if (saleId) {
        targetDebt = await tx.creditOutstanding.findUnique({ where: { saleId } });
      } else if (dmId) {
        targetDebt = await tx.creditOutstanding.findUnique({ where: { dmId } });
      } else if (orderId) {
        targetDebt = await tx.creditOutstanding.findFirst({ where: { orderId } });
      }

      if (targetDebt && targetDebt.pendingAmount.gt(0)) {
        const allocated = remaining.lt(targetDebt.pendingAmount) ? remaining : money(targetDebt.pendingAmount);
        
        // Update CreditOutstanding
        const newPaid = add(targetDebt.paidAmount, allocated);
        const newPending = sub(targetDebt.originalAmount, newPaid);
        let debtStatus = "PARTIALLY_PAID";
        if (isZero(newPending)) {
          debtStatus = "PAID";
        } else if (newPaid.eq(0)) {
          debtStatus = "PENDING";
        }

        await tx.creditOutstanding.update({
          where: { id: targetDebt.id },
          data: {
            pendingAmount: newPending,
            paidAmount: newPaid,
            status: debtStatus
          }
        });

        // Create PaymentAllocation
        await tx.paymentAllocation.create({
          data: {
            paymentId: createdPayment.id,
            creditOutstandingId: targetDebt.id,
            amount: allocated,
            allocationType: "PAYMENT",
            status: "ACTIVE"
          }
        });

        // Sync parent invoices
        await syncInvoiceBalances(tx, targetDebt.id);

        remaining = sub(remaining, allocated);
      }
    }

    // 2. FIFO Allocation
    if (remaining.gt(0) && customerId) {
      const debts = await tx.creditOutstanding.findMany({
        where: {
          customerId,
          shopId,
          status: { notIn: ["PAID", "CANCELLED"] },
          pendingAmount: { gt: 0 }
        },
        orderBy: { createdAt: "asc" }
      });

      for (const debt of debts) {
        const allocated = remaining.lt(debt.pendingAmount) ? remaining : money(debt.pendingAmount);

        // Update CreditOutstanding
        const newPaid = add(debt.paidAmount, allocated);
        const newPending = sub(debt.originalAmount, newPaid);
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

        // Create PaymentAllocation
        await tx.paymentAllocation.create({
          data: {
            paymentId: createdPayment.id,
            creditOutstandingId: debt.id,
            amount: allocated,
            allocationType: "PAYMENT",
            status: "ACTIVE"
          }
        });

        if (!createdPayment.saleId && !createdPayment.dmId && !createdPayment.orderId) {
          await tx.payment.update({
            where: { id: createdPayment.id },
            data: {
              saleId: debt.saleId,
              dmId: debt.dmId,
              orderId: debt.orderId
            }
          });
          createdPayment.saleId = debt.saleId;
          createdPayment.dmId = debt.dmId;
          createdPayment.orderId = debt.orderId;
        }

        // Sync parent invoices
        await syncInvoiceBalances(tx, debt.id);

        remaining = sub(remaining, allocated);
        if (remaining.lte(0)) break;
      }
    }

    // 3. Overpayment (Advance)
    if (remaining.gt(0) && customerId) {
      await tx.customerAdvance.create({
        data: {
          shopId,
          customerId,
          paymentId: createdPayment.id,
          originalAmount: remaining,
          pendingAmount: remaining,
          paidAmount: money(0),
          status: "PENDING",
          createdById: user.id
        }
      });
    }
  }

  // Return the dynamic balances for the targeted invoice
  let finalTargetDebt = null;
  if (saleId) {
    finalTargetDebt = await tx.creditOutstanding.findUnique({ where: { saleId } });
  } else if (dmId) {
    finalTargetDebt = await tx.creditOutstanding.findUnique({ where: { dmId } });
  } else if (orderId) {
    finalTargetDebt = await tx.creditOutstanding.findFirst({ where: { orderId } });
  }

  if (finalTargetDebt) {
    const pending = money(finalTargetDebt.pendingAmount);
    const original = money(finalTargetDebt.originalAmount);
    const paid = sub(original, pending);
    return {
      paidAmount: paid,
      balanceAmount: pending,
      paymentStatus: getBillPaymentStatus(original, paid)
    };
  } else {
    const paymentSum = payments.reduce((sum, p) => add(sum, p.amount), money(0));
    const paidAmount = add(existingPaidAmount, paymentSum);
    const balanceAmount = sub(totalAmount, paidAmount);
    return {
      paidAmount,
      balanceAmount,
      paymentStatus: getBillPaymentStatus(totalAmount, paidAmount)
    };
  }
}

export async function cancelCreditOutstanding(tx, { creditId, userId }) {
  const debt = await tx.creditOutstanding.findUnique({
    where: { id: creditId },
    include: { allocations: { where: { status: "ACTIVE" } } }
  });

  if (!debt) throw new ApiError(404, "Credit outstanding record not found");

  for (const allocation of debt.allocations) {
    // Update original allocation status to REVERSED
    await tx.paymentAllocation.update({
      where: { id: allocation.id },
      data: { status: "REVERSED" }
    });

    // Create a new REVERSAL allocation
    await tx.paymentAllocation.create({
      data: {
        paymentId: allocation.paymentId,
        creditOutstandingId: creditId,
        customerAdvanceId: allocation.customerAdvanceId,
        amount: allocation.amount,
        allocationType: "REVERSAL",
        status: "REVERSED",
        reversalOfId: allocation.id
      }
    });

    if (allocation.allocationType === "PAYMENT") {
      // Convert paid amount into a CustomerAdvance
      await tx.customerAdvance.create({
        data: {
          shopId: debt.shopId,
          customerId: debt.customerId,
          paymentId: allocation.paymentId,
          originalAmount: allocation.amount,
          pendingAmount: allocation.amount,
          paidAmount: money(0),
          status: "PENDING",
          createdById: userId
        }
      });
    } else if (allocation.allocationType === "ADVANCE_APPLIED" && allocation.customerAdvanceId) {
      // Restore advance balance
      const advance = await tx.customerAdvance.findUnique({
        where: { id: allocation.customerAdvanceId }
      });
      if (advance) {
        const newAdvPaid = sub(advance.paidAmount, allocation.amount);
        const newAdvPending = sub(advance.originalAmount, newAdvPaid);
        let advStatus = "PARTIALLY_PAID";
        if (isZero(newAdvPending)) {
          advStatus = "PAID";
        } else if (newAdvPaid.eq(0)) {
          advStatus = "PENDING";
        }
        await tx.customerAdvance.update({
          where: { id: advance.id },
          data: {
            pendingAmount: newAdvPending,
            paidAmount: newAdvPaid,
            status: advStatus
          }
        });
      }
    }
  }

  // Update CreditOutstanding status to CANCELLED
  await tx.creditOutstanding.update({
    where: { id: creditId },
    data: {
      pendingAmount: money(0),
      paidAmount: money(0),
      status: "CANCELLED"
    }
  });

  // Re-sync parent invoices
  await syncInvoiceBalances(tx, creditId);

  // Auto-allocate any new/restored advances
  await autoAllocateCustomerAdvances(tx, {
    customerId: debt.customerId,
    shopId: debt.shopId,
    userId
  });
}

export { prisma };
