import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { IS_DATE_REGEX } from "../lib/validate.js";

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
  const shopIds = shopId ? [shopId] : await accessibleShopIds(user);

  const summaryDate = {};
  if (dateFrom) summaryDate.gte = new Date(dateFrom);
  if (dateTo) summaryDate.lte = new Date(dateTo);

  return prisma.dailySummary.findMany({
    where: {
      shopId: { in: shopIds },
      status: status || undefined,
      summaryDate: Object.keys(summaryDate).length ? summaryDate : undefined,
    },
    include: { shop: { select: { id: true, name: true, city: true } } },
    orderBy: { summaryDate: "desc" },
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

export async function getSummaryById(user, id, shopIdQuery) {
  // Check if ID is a valid date string (YYYY-MM-DD)
  const isDate = IS_DATE_REGEX.test(id);
  
  let summary = null;

  // 1. If it doesn't look like a date, try fetching by ID (CUID/UUID)
  if (!isDate) {
    summary = await prisma.dailySummary.findUnique({
      where: { id },
      include: { shop: true, reviewedBy: { select: { id: true, name: true } }, exports: true },
    });
  }

  // 2. Fallback: If not found by ID, or if it is a date, try fetching by composite key [shopId, summaryDate]
  if (!summary) {
    // We need a shopId for the composite key lookup
    let effectiveShopId = shopIdQuery;
    
    // If shopId not provided in query, and user is STAFF, use their first accessible shop
    if (!effectiveShopId && user.role === "STAFF") {
      const access = await prisma.staffShopAccess.findFirst({ where: { staffId: user.id } });
      effectiveShopId = access?.shopId;
    }

    if (effectiveShopId) {
      const summaryDate = new Date(id);
      if (!isNaN(summaryDate.getTime())) {
        summaryDate.setHours(0, 0, 0, 0);
        summary = await prisma.dailySummary.findUnique({
          where: { 
            shopId_summaryDate: { 
              shopId: effectiveShopId, 
              summaryDate 
            } 
          },
          include: { shop: true, reviewedBy: { select: { id: true, name: true } }, exports: true },
        });
      }
    }
  }

  if (!summary) throw new ApiError(404, "Daily summary not found");
  
  // Final security check: Ensure user has access to this shop
  await assertShopAccess(user, summary.shopId);
  
  return summary;
}

export async function lockSummaryById(user, id) {
  const summary = await getSummaryById(user, id);
  if (summary.status === "LOCKED") return summary;

  return prisma.dailySummary.update({
    where: { id: summary.id },
    data: {
      status: "LOCKED",
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
      dailySummaryId: summary.id,
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

  const [sales, orders, payments, cashSession, dms, approvedExpenses, nonRejectedSessionExpenses] = await Promise.all([
    prisma.sale.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay }, saleStatus: { notIn: ["DRAFT", "CANCELLED", "RETURNED"] } } }),
    prisma.order.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay }, status: { not: "CANCELLED" } } }),
    prisma.payment.findMany({ where: { shopId, receivedAt: { gte: startOfDay, lte: endOfDay }, status: { notIn: ["CANCELLED", "REJECTED"] } } }),
    prisma.cashSession.findFirst({ where: { shopId, openedAt: { gte: startOfDay, lte: endOfDay } }, orderBy: { openedAt: 'desc' } }),
    prisma.deliveryMemo.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay }, status: { notIn: ["CANCELLED", "RETURNED"] } } }),
    prisma.expense.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay }, status: "APPROVED" } }),
    prisma.expense.findMany({ where: { shopId, createdAt: { gte: startOfDay, lte: endOfDay }, status: { not: "REJECTED" } } }),
  ]);

  const paymentBreakdown = payments.reduce((acc, p) => {
    const mode = p.paymentMode;
    acc[mode] = (acc[mode] || 0) + Number(p.amount);
    return acc;
  }, {});

  const totalSales = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const walkinSales = sales.filter(s => s.isWalkin).reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const totalCreditPending =
    sales.reduce((sum, sale) => sum + Number(sale.balanceAmount || 0), 0) +
    dms.reduce((sum, dm) => sum + Number(dm.balanceAmount || 0), 0) +
    orders.reduce((sum, order) => sum + Number(order.balanceAmount || 0), 0);
  const totalExpenses = approvedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const sessionExpenses = cashSession
    ? nonRejectedSessionExpenses.filter((expense) => expense.cashSessionId === cashSession.id).reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    : 0;
  const sessionCashCollected = cashSession
    ? payments
        .filter((payment) => payment.paymentMode === "CASH" && payment.cashSessionId === cashSession.id)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    : 0;
  const expectedCash = cashSession
    ? Number(cashSession.openingCash || 0) + sessionCashCollected - sessionExpenses - Number(cashSession.cashHandover || 0)
    : 0;

  return prisma.dailySummary.create({
    data: {
      shopId,
      summaryDate: date,
      status: "GENERATED",
      openingCash: cashSession?.openingCash || 0,
      expectedCash,
      actualCash: cashSession?.actualCash,
      cashDifference: cashSession?.difference,
      totalSales,
      walkinSales,
      totalCashCollected: paymentBreakdown['CASH'] || 0,
      totalUpiCollected: paymentBreakdown['UPI'] || 0,
      totalBankCollected: paymentBreakdown['BANK_TRANSFER'] || 0,
      totalCreditPending,
      salesCount: sales.length,
      ordersCreatedCount: orders.length,
      dmCreatedCount: dms.length,
      expenseCount: approvedExpenses.length,
      payloadJson: {
        generatedAt: new Date().toISOString(),
        paymentBreakdown,
        totalCardCollected: paymentBreakdown["CARD"] || 0,
        totalChequeReceived: paymentBreakdown["CHEQUE"] || 0,
        totalExpenses,
        sessionCashCollected,
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
    ["DM Created", summary.dmCreatedCount],
    ["Cash Collected", summary.totalCashCollected],
    ["UPI Collected", summary.totalUpiCollected],
    ["Bank Collected", summary.totalBankCollected],
    ["Expected Cash", summary.expectedCash],
    ["Actual Cash", summary.actualCash ?? ""],
    ["Cash Difference", summary.cashDifference ?? ""],
  ];
  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
}
