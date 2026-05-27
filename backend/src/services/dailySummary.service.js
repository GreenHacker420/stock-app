import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";

export async function getSummary(user, { shopId, date }) {
  await assertShopAccess(user, shopId);
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
  await assertShopAccess(user, shopId);
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

export async function generateSummary(user, { shopId, date }) {
  await assertShopAccess(user, shopId);
  const summaryDate = new Date(date);
  summaryDate.setHours(0, 0, 0, 0);

  await prisma.dailySummary.deleteMany({
    where: {
      shopId,
      summaryDate,
      status: { not: "LOCKED" },
    },
  });

  const existingLocked = await prisma.dailySummary.findUnique({
    where: { shopId_summaryDate: { shopId, summaryDate } },
  });
  if (existingLocked?.status === "LOCKED") return existingLocked;

  return generateSummaryInternal(shopId, summaryDate);
}

export async function listSummaries(user, { shopId, dateFrom, dateTo, status }) {
  if (shopId) await assertShopAccess(user, shopId);

  const summaryDate = {};
  if (dateFrom) summaryDate.gte = new Date(dateFrom);
  if (dateTo) summaryDate.lte = new Date(dateTo);

  return prisma.dailySummary.findMany({
    where: {
      shopId: shopId || undefined,
      status: status || undefined,
      summaryDate: Object.keys(summaryDate).length ? summaryDate : undefined,
    },
    include: { shop: { select: { id: true, name: true, city: true } } },
    orderBy: { summaryDate: "desc" },
  });
}

export async function getSummaryById(user, id) {
  const summary = await prisma.dailySummary.findUnique({
    where: { id },
    include: { shop: true, reviewedBy: { select: { id: true, name: true } }, exports: true },
  });
  if (!summary) throw new ApiError(404, "Daily summary not found");
  await assertShopAccess(user, summary.shopId);
  return summary;
}

export async function lockSummaryById(user, id) {
  const summary = await getSummaryById(user, id);
  if (summary.status === "LOCKED") return summary;

  return prisma.dailySummary.update({
    where: { id },
    data: {
      status: "LOCKED",
      lockedAt: new Date(),
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });
}

export async function exportSummary(user, id, format) {
  const summary = await getSummaryById(user, id);
  const normalizedFormat = format.toUpperCase();

  await prisma.dailySummaryExport.create({
    data: {
      dailySummaryId: id,
      format: normalizedFormat,
      status: "DONE",
      exportedById: user.id,
    },
  });

  if (normalizedFormat === "CSV") {
    return {
      contentType: "text/csv",
      filename: `daily-summary-${summary.summaryDate.toISOString().slice(0, 10)}.csv`,
      body: toSummaryCsv(summary),
    };
  }

  return {
    contentType: "application/json",
    filename: `daily-summary-${summary.summaryDate.toISOString().slice(0, 10)}.json`,
    body: JSON.stringify(summary, null, 2),
  };
}

async function generateSummaryInternal(shopId, date) {
  const startOfDay = new Date(date);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const [sales, orders, payments, cashSession, dms, stockMovements, correctionRequests, rateChangeRequests] = await Promise.all([
    prisma.sale.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.order.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.payment.findMany({ where: { shopId, receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.cashSession.findFirst({ where: { shopId, openedAt: { gte: startOfDay, lte: endOfDay } }, orderBy: { openedAt: 'desc' } }),
    prisma.deliveryMemo.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.stockLedger.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.correctionRequest.findMany({ where: { createdAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.rateChangeRequest.findMany({ where: { createdAt: { gte: startOfDay, lte: endOfDay } } }),
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
      dmCreatedCount: dms.length,
      paymentMismatchCount: payments.filter(p => p.verificationStatus === "MISMATCH").length,
      correctionRequestCount: correctionRequests.length,
      rateChangeRequestCount: rateChangeRequests.length,
      stockMovementCount: stockMovements.length,
      payloadJson: {
        generatedAt: new Date().toISOString(),
        paymentBreakdown,
      },
    }
  });
}

function toSummaryCsv(summary) {
  const rows = [
    ["Date", summary.summaryDate.toISOString().slice(0, 10)],
    ["Status", summary.status],
    ["Total Sales", summary.totalSales],
    ["Walk-in Sales", summary.walkinSales],
    ["Sales Count", summary.salesCount],
    ["Orders Created", summary.ordersCreatedCount],
    ["Orders Dispatched", summary.ordersDispatchedCount],
    ["DM Created", summary.dmCreatedCount],
    ["Cash Collected", summary.totalCashCollected],
    ["UPI Collected", summary.totalUpiCollected],
    ["Card Collected", summary.totalCardCollected],
    ["Bank Collected", summary.totalBankCollected],
    ["Cheque Received", summary.totalChequeReceived],
    ["Credit Pending", summary.totalCreditPending],
    ["Expected Cash", summary.expectedCash],
    ["Actual Cash", summary.actualCash ?? ""],
    ["Cash Difference", summary.cashDifference ?? ""],
  ];
  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
}
