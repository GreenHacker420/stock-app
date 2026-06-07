import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";

function dayRange(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function getOwnerDashboard(user, { shopId, date }) {
  if (shopId) await assertShopAccess(user, shopId);
  const ownedShopIds = shopId
    ? [shopId]
    : (await prisma.shop.findMany({ where: { ownerId: user.id }, select: { id: true } })).map((shop) => shop.id);
  const { start, end } = dayRange(date ? new Date(date) : new Date());

  const whereShop = { shopId: { in: ownedShopIds } };
  
  const [
    sales, 
    orders, 
    dms, 
    payments, 
    stockLevels, 
    cashSessions, 
    approvalRequests,
    expenses,
    gstPendingSales,
    newCustomersToday,
    outstandingCustomersCount,
    topCustomersRaw
  ] = await Promise.all([
    prisma.sale.findMany({ where: { ...whereShop, createdAt: { gte: start, lte: end } } }),
    prisma.order.findMany({ where: { ...whereShop, createdAt: { gte: start, lte: end } } }),
    prisma.deliveryMemo.findMany({ where: { ...whereShop } }),
    prisma.payment.findMany({ where: { ...whereShop, receivedAt: { gte: start, lte: end } } }),
    prisma.stockLedger.groupBy({ by: ["itemId"], where: whereShop, _sum: { quantityIn: true, quantityOut: true } }),
    prisma.cashSession.findMany({ where: { ...whereShop, openedAt: { gte: start, lte: end } } }),
    prisma.approvalRequest.findMany({ where: { status: "PENDING" } }),
    prisma.expense.findMany({ where: { ...whereShop, createdAt: { gte: start, lte: end } } }),
    prisma.sale.findMany({ where: { ...whereShop, gstRequired: true, gstInvoiceStatus: "PENDING" } }),
    prisma.customer.count({ where: { ...whereShop, createdAt: { gte: start, lte: end }, type: { not: "WALK_IN" } } }),
    prisma.customer.count({ where: { ...whereShop, outstandingAmount: { gt: 0 } } }),
    prisma.sale.groupBy({
      by: ["customerId"],
      where: { ...whereShop, saleStatus: { not: "CANCELLED" } },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 5
    })
  ]);

  // Enrich top customers
  const topCustomerIds = topCustomersRaw.map(tc => tc.customerId).filter(Boolean);
  const topCustomersDetailed = await prisma.customer.findMany({
    where: { id: { in: topCustomerIds } },
    select: { id: true, name: true, phone: true }
  });
  const topCustomers = topCustomersRaw.map(tc => ({
    ...tc,
    customer: topCustomersDetailed.find(c => c.id === tc.customerId)
  })).filter(tc => tc.customer);

  // Inactive customers (no purchase in 30 days) - Approximation
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const inactiveCustomersCount = await prisma.customer.count({
    where: {
      ...whereShop,
      type: { not: "WALK_IN" },
      sales: {
        none: {
          createdAt: { gte: thirtyDaysAgo }
        }
      }
    }
  });

  const paymentTotal = (mode) => payments.filter((payment) => payment.paymentMode === mode).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const todaySales = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
  const pendingDmAmount = dms.filter((dm) => !["FULLY_PAID", "CANCELLED", "RETURNED"].includes(dm.status)).reduce((sum, dm) => sum + Number(dm.balanceAmount), 0);
  const lowStockCount = stockLevels.filter((row) => Number(row._sum.quantityIn || 0) - Number(row._sum.quantityOut || 0) <= 0).length;

  return {
    date: start.toISOString().slice(0, 10),
    todaySales,
    walkinSales: sales.filter((sale) => sale.isWalkin).reduce((sum, sale) => sum + Number(sale.totalAmount), 0),
    salesCount: sales.length,
    ordersCreated: orders.length,
    ordersToPack: orders.filter((order) => ["CONFIRMED", "PACKING", "PARTIALLY_PACKED"].includes(order.status)).length,
    ordersDispatched: orders.filter((order) => order.status === "DISPATCHED").length,
    pendingDmAmount,
    cashCollected: paymentTotal("CASH"),
    upiCollected: paymentTotal("UPI"),
    cardCollected: paymentTotal("CARD"),
    bankCollected: paymentTotal("BANK_TRANSFER"),
    chequeReceived: paymentTotal("CHEQUE"),
    paymentVerificationPending: payments.filter((payment) => ["UPI", "CARD", "BANK_TRANSFER", "CHEQUE"].includes(payment.paymentMode) && payment.status === "RECORDED").length,
    cashMismatch: cashSessions.filter((session) => Number(session.difference || 0) !== 0).length,
    pendingApprovalRequests: approvalRequests.length,
    lowStockAlerts: lowStockCount,
    todayExpenses: expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    gstInvoicesPendingCount: gstPendingSales.length,
    gstInvoicesPendingAmount: gstPendingSales.reduce((sum, s) => sum + Number(s.totalAmount), 0),
    
    // New Customer Widgets
    newCustomersToday,
    outstandingCustomersCount,
    inactiveCustomersCount,
    topCustomers
  };
}

export async function getStaffTodaySummary(user, { shopId, date }) {
  await assertShopAccess(user, shopId);
  const { start, end } = dayRange(date ? new Date(date) : new Date());

  const [sales, dms, payments, orders, stockMovements, cashSession] = await Promise.all([
    prisma.sale.findMany({ where: { shopId, staffId: user.id, createdAt: { gte: start, lte: end } } }),
    prisma.deliveryMemo.findMany({ where: { shopId, staffId: user.id, createdAt: { gte: start, lte: end } } }),
    prisma.payment.findMany({ where: { shopId, receivedById: user.id, receivedAt: { gte: start, lte: end } } }),
    prisma.order.findMany({ where: { shopId, assignedStaffId: user.id, updatedAt: { gte: start, lte: end } } }),
    prisma.stockLedger.findMany({ where: { shopId, createdById: user.id, createdAt: { gte: start, lte: end } } }),
    prisma.cashSession.findFirst({ where: { shopId, staffId: user.id, openedAt: { gte: start, lte: end } }, orderBy: { openedAt: "desc" } }),
  ]);

  const total = (rows, field = "totalAmount") => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
  const paymentTotal = (mode) => payments.filter((payment) => payment.paymentMode === mode).reduce((sum, payment) => sum + Number(payment.amount), 0);

  return {
    date: start.toISOString().slice(0, 10),
    salesCount: sales.length,
    salesTotal: total(sales),
    walkinSalesCount: sales.filter((sale) => sale.isWalkin).length,
    walkinSalesTotal: total(sales.filter((sale) => sale.isWalkin)),
    dmsCreated: dms.length,
    dmTotal: total(dms, "estimatedAmount"),
    cashCollected: paymentTotal("CASH"),
    upiRecorded: paymentTotal("UPI"),
    chequesReceived: payments.filter((payment) => payment.paymentMode === "CHEQUE").length,
    ordersPacked: orders.filter((order) => ["PACKED", "PARTIALLY_PACKED", "DISPATCHED"].includes(order.status)).length,
    ordersDispatched: orders.filter((order) => order.status === "DISPATCHED").length,
    stockEntries: stockMovements.length,
    dayCloseStatus: cashSession?.status ?? "NOT_OPENED",
  };
}
