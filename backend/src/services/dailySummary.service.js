import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";

export async function getSummary(user, { shopId, date }) {
  const summaryDate = new Date(date);
  summaryDate.setHours(0, 0, 0, 0);

  let summary = await prisma.dailySummary.findUnique({
    where: { shopId_summaryDate: { shopId, summaryDate } },
    include: { reviewedBy: { select: { name: true } } }
  });

  if (!summary) {
    summary = await generateSummaryInternal(shopId, summaryDate);
  }

  return summary;
}

export async function lockSummary(user, { shopId, date }) {
  const summaryDate = new Date(date);
  summaryDate.setHours(0, 0, 0, 0);

  const summary = await prisma.dailySummary.findUnique({
    where: { shopId_summaryDate: { shopId, summaryDate } }
  });

  if (!summary) throw new ApiError(404, "Summary not found for this date");
  if (summary.status === "LOCKED") return summary;

  return prisma.dailySummary.update({
    where: { id: summary.id },
    data: {
      status: "LOCKED",
      lockedAt: new Date(),
      reviewedById: user.id,
      reviewedAt: new Date(),
    }
  });
}

async function generateSummaryInternal(shopId, date) {
  const startOfDay = new Date(date);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const [sales, orders, payments, cashSession] = await Promise.all([
    prisma.sale.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.order.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.payment.findMany({ where: { shopId, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.cashSession.findFirst({ where: { shopId, openedAt: { gte: startOfDay, lte: endOfDay } }, orderBy: { openedAt: 'desc' } })
  ]);

  const paymentBreakdown = payments.reduce((acc, p) => {
    const mode = p.paymentMode;
    acc[mode] = (acc[mode] || 0) + Number(p.amount);
    return acc;
  }, {});

  const totalSales = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const walkinSales = sales.filter(s => s.isWalkin).reduce((sum, s) => sum + Number(s.totalAmount), 0);

  return prisma.dailySummary.create({
    data: {
      shopId,
      summaryDate: date,
      status: "GENERATED",
      openingCash: cashSession?.openingCash || 0,
      expectedCash: cashSession?.expectedCash || 0,
      actualCash: cashSession?.actualCash,
      cashDifference: cashSession?.difference,
      totalSales,
      walkinSales,
      totalCashCollected: paymentBreakdown['CASH'] || 0,
      totalUpiCollected: paymentBreakdown['UPI'] || 0,
      totalCardCollected: paymentBreakdown['CARD'] || 0,
      totalBankCollected: paymentBreakdown['BANK_TRANSFER'] || 0,
      totalChequeReceived: paymentBreakdown['CHEQUE'] || 0,
      totalCreditPending: paymentBreakdown['CREDIT'] || 0,
      salesCount: sales.length,
      ordersCreatedCount: orders.length,
      ordersDispatchedCount: orders.filter(o => o.status === 'DISPATCHED').length,
    }
  });
}
