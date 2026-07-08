import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { deleteS3Object } from "../lib/s3-storage.js";

function dayRange(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function countLowStockFromLedger(shopIds) {
  if (shopIds.length === 0) return 0;

  const [items, rows] = await Promise.all([
    prisma.item.findMany({
      where: { shopId: { in: shopIds }, status: "ACTIVE" },
      select: { id: true, minimumStock: true },
    }),
    prisma.stockLedger.groupBy({
      by: ["itemId"],
      where: { shopId: { in: shopIds } },
      _sum: {
        quantityIn: true,
        quantityOut: true,
      },
    }),
  ]);

  const ledgerByItem = new Map(
    rows.map((row) => [
      row.itemId,
      Number(row._sum.quantityIn || 0) - Number(row._sum.quantityOut || 0),
    ]),
  );

  return items.filter((item) => {
    const currentQuantity = ledgerByItem.get(item.id) ?? 0;
    return currentQuantity <= Number(item.minimumStock || 0);
  }).length;
}

export async function getOwnerDashboard(user, { shopId, date }) {
  if (shopId) await assertShopAccess(user, shopId);
  const ownedShopIds = shopId
    ? [shopId]
    : (await prisma.shop.findMany({ where: { ownerId: user.id }, select: { id: true } })).map((shop) => shop.id);
  const { start, end } = dayRange(date ? new Date(date) : new Date());

  const whereShop = { shopId: { in: ownedShopIds } };
  
  const [
    salesTotal,
    walkinSalesTotal,
    salesCount,
    ordersCreated,
    ordersToPack,
    ordersDispatched,
    pendingDmTotal,
    paymentTotals,
    paymentVerificationPending,
    cashMismatch,
    approvalCounts,
    expensesTotal,
    gstPending,
    lowStockCount,
    newCustomersToday,
    outstandingCustomersCount,
    topCustomersRaw
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { ...whereShop, createdAt: { gte: start, lte: end } },
      _sum: { totalAmount: true },
    }),
    prisma.sale.aggregate({
      where: { ...whereShop, isWalkin: true, createdAt: { gte: start, lte: end } },
      _sum: { totalAmount: true },
    }),
    prisma.sale.count({ where: { ...whereShop, createdAt: { gte: start, lte: end } } }),
    prisma.order.count({ where: { ...whereShop, createdAt: { gte: start, lte: end } } }),
    prisma.order.count({ where: { ...whereShop, status: { in: ["CONFIRMED", "PACKING", "PARTIALLY_PACKED"] }, createdAt: { gte: start, lte: end } } }),
    prisma.order.count({ where: { ...whereShop, status: "DISPATCHED", createdAt: { gte: start, lte: end } } }),
    prisma.deliveryMemo.aggregate({
      where: { ...whereShop, status: { notIn: ["FULLY_PAID", "CANCELLED", "RETURNED"] } },
      _sum: { balanceAmount: true },
    }),
    prisma.payment.groupBy({
      by: ["paymentMode"],
      where: { ...whereShop, receivedAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.payment.count({
      where: {
        ...whereShop,
        receivedAt: { gte: start, lte: end },
        paymentMode: { in: ["UPI", "CARD", "BANK_TRANSFER", "CHEQUE"] },
        status: "RECORDED",
      },
    }),
    prisma.cashSession.count({
      where: { ...whereShop, openedAt: { gte: start, lte: end }, difference: { not: 0 } },
    }),
    prisma.approvalRequest.groupBy({
      by: ["type"],
      where: { ...whereShop, status: "PENDING" },
      _count: { id: true },
    }),
    prisma.expense.aggregate({
      where: { ...whereShop, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.sale.aggregate({
      where: { ...whereShop, gstRequired: true, gstInvoiceStatus: "PENDING" },
      _count: { id: true },
      _sum: { totalAmount: true },
    }),
    countLowStockFromLedger(ownedShopIds),
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

  const paymentTotal = (mode) => Number(paymentTotals.find((row) => row.paymentMode === mode)?._sum.amount || 0);
  const pendingApprovalRequests = approvalCounts.reduce((sum, row) => sum + row._count.id, 0);
  const approvalCount = (type) => approvalCounts.find((row) => row.type === type)?._count.id ?? 0;

  return {
    date: start.toISOString().slice(0, 10),
    todaySales: Number(salesTotal._sum.totalAmount || 0),
    walkinSales: Number(walkinSalesTotal._sum.totalAmount || 0),
    salesCount,
    ordersCreated,
    ordersToPack,
    ordersDispatched,
    pendingDmAmount: Number(pendingDmTotal._sum.balanceAmount || 0),
    cashCollected: paymentTotal("CASH"),
    upiCollected: paymentTotal("UPI"),
    cardCollected: paymentTotal("CARD"),
    bankCollected: paymentTotal("BANK_TRANSFER"),
    chequeReceived: paymentTotal("CHEQUE"),
    paymentVerificationPending,
    cashMismatch,
    pendingApprovalRequests,
    pendingVerifications: pendingApprovalRequests,
    cashSessionDifferencesCount: cashMismatch,
    rateChangeRequests: approvalCount("RATE_CHANGE"),
    correctionRequests: approvalCount("SALE_CORRECTION") + approvalCount("SALE_CANCELLATION") + approvalCount("DM_CANCELLATION") + approvalCount("PAYMENT_CORRECTION"),
    lowStockAlerts: lowStockCount,
    todayExpenses: Number(expensesTotal._sum.amount || 0),
    gstInvoicesPendingCount: gstPending._count.id,
    gstInvoicesPendingAmount: Number(gstPending._sum.totalAmount || 0),
    
    // New Customer Widgets
    newCustomersToday,
    outstandingCustomersCount,
    inactiveCustomersCount,
    topCustomers
  };
}

export async function getStaffTodaySummary(user, { shopId, date, staffId, dateFrom, dateTo }) {
  await assertShopAccess(user, shopId);

  let targetStaffId = user.id;
  if (staffId && staffId !== user.id) {
    if (user.role !== "OWNER") {
      throw new ApiError(403, "Only owners can view other staff summaries");
    }
    targetStaffId = staffId;
  }

  let start, end;
  if (dateFrom && dateTo) {
    start = new Date(dateFrom);
    start.setHours(0, 0, 0, 0);
    end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
  } else {
    const range = dayRange(date ? new Date(date) : new Date());
    start = range.start;
    end = range.end;
  }

  const [sales, dms, payments, orders, stockMovements, cashSession] = await Promise.all([
    prisma.sale.findMany({ where: { shopId, staffId: targetStaffId, createdAt: { gte: start, lte: end } } }),
    prisma.deliveryMemo.findMany({ where: { shopId, staffId: targetStaffId, createdAt: { gte: start, lte: end } } }),
    prisma.payment.findMany({ where: { shopId, receivedById: targetStaffId, receivedAt: { gte: start, lte: end } } }),
    prisma.order.findMany({ where: { shopId, assignedStaffId: targetStaffId, updatedAt: { gte: start, lte: end } } }),
    prisma.stockLedger.findMany({ where: { shopId, createdById: targetStaffId, createdAt: { gte: start, lte: end } } }),
    prisma.cashSession.findFirst({ where: { shopId, staffId: targetStaffId, openedAt: { gte: start, lte: end } }, orderBy: { openedAt: "desc" } }),
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

export async function listStorageObjects(user, { shopId, filter }) {
  await assertShopAccess(user, shopId);
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Access restricted to owners");
  }

  const assets = await prisma.asset.findMany({
    where: {
      shopId,
      deletedAt: null,
    },
    include: {
      _count: {
        select: { waMessages: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  let mapped = assets.map((a) => ({
    id: a.id,
    fileName: a.fileName || (a.storageKey ? a.storageKey.split("/").pop() : "Unnamed File"),
    storageKey: a.storageKey || "",
    sizeBytes: a.sizeBytes ? Number(a.sizeBytes) : 0,
    mimeType: a.mimeType || "application/octet-stream",
    createdAt: a.createdAt,
    url: a.storageKey && a.storageBucket ? `https://${a.storageBucket}.s3.amazonaws.com/${a.storageKey}` : (a.remoteUrl || ""),
    waMessagesCount: a._count.waMessages,
  }));

  if (filter === "ORPHANED") {
    const activeItems = await prisma.item.findMany({
      where: { shopId, status: "ACTIVE", imageUrl: { not: null } },
      select: { imageUrl: true },
    });

    const referencedKeys = new Set();
    activeItems.forEach((it) => {
      if (it.imageUrl) {
        it.imageUrl.split(",").forEach((url) => {
          const trimmed = url.trim();
          if (trimmed.includes(".amazonaws.com/")) {
            const key = trimmed.split(".amazonaws.com/")[1];
            if (key) referencedKeys.add(key);
          } else {
            referencedKeys.add(trimmed);
          }
        });
      }
    });

    mapped = mapped.filter((a) => {
      if (!a.storageKey) return true;
      return !referencedKeys.has(a.storageKey) && a.waMessagesCount === 0;
    });
  }

  return mapped;
}

export async function deleteStorageObject(user, id) {
  const asset = await prisma.asset.findUnique({
    where: { id },
  });
  if (!asset) {
    throw new ApiError(404, "Asset not found");
  }

  await assertShopAccess(user, asset.shopId);
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Access restricted to owners");
  }

  // Delete from S3
  if (asset.storageKey) {
    await deleteS3Object(asset.storageKey);
  }

  // Delete from Database
  await prisma.asset.delete({
    where: { id },
  });

  return { success: true };
}

export async function bulkDeleteOrphanedAssets(user, { shopId }) {
  await assertShopAccess(user, shopId);
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Access restricted to owners");
  }

  const assets = await prisma.asset.findMany({
    where: {
      shopId,
      deletedAt: null,
    },
    include: {
      _count: {
        select: { waMessages: true },
      },
    },
  });

  const activeItems = await prisma.item.findMany({
    where: { shopId, status: "ACTIVE", imageUrl: { not: null } },
    select: { imageUrl: true },
  });

  const referencedKeys = new Set();
  activeItems.forEach((it) => {
    if (it.imageUrl) {
      it.imageUrl.split(",").forEach((url) => {
        const trimmed = url.trim();
        if (trimmed.includes(".amazonaws.com/")) {
          const key = trimmed.split(".amazonaws.com/")[1];
          if (key) referencedKeys.add(key);
        } else {
          referencedKeys.add(trimmed);
        }
      });
    }
  });

  const orphans = assets.filter((a) => {
    if (!a.storageKey) return false;
    return !referencedKeys.has(a.storageKey) && a._count.waMessages === 0;
  });

  let deletedCount = 0;
  let sizeBytesFreed = 0;

  for (const asset of orphans) {
    try {
      if (asset.storageKey) {
        await deleteS3Object(asset.storageKey);
      }
      await prisma.asset.delete({
        where: { id: asset.id },
      });
      deletedCount++;
      sizeBytesFreed += Number(asset.sizeBytes || 0);
    } catch (err) {
      console.error(`Failed to delete orphaned asset ${asset.id}:`, err);
    }
  }

  return { success: true, count: deletedCount, sizeBytesFreed };
}
