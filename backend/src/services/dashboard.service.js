import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { deleteS3Object } from "../lib/s3-storage.js";
import { deleteOneDriveObject } from "../lib/onedrive-storage.js";
import { getObjectPublicUrl } from "../lib/storage-manager.js";

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
      where: { ...whereShop, saleDate: { gte: start, lte: end } },
      _sum: { totalAmount: true },
    }),
    prisma.sale.aggregate({
      where: { ...whereShop, isWalkin: true, saleDate: { gte: start, lte: end } },
      _sum: { totalAmount: true },
    }),
    prisma.sale.count({ where: { ...whereShop, saleDate: { gte: start, lte: end } } }),
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
    prisma.sale.findMany({ where: { shopId, staffId: targetStaffId, saleDate: { gte: start, lte: end } } }),
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

export async function listStorageObjects(user, { shopId, filter, cursor, limit, search, categoryId, brandId, provider, type, sortBy }) {
  await assertShopAccess(user, shopId);
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Access restricted to owners");
  }

  // We query all active items and ItemAsset entries in the shop to compute referenced keys and metadata
  const [activeItems, itemAssetsList, shopCategories] = await Promise.all([
    prisma.item.findMany({
      where: { shopId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        defaultSellingPrice: true,
        minimumAllowedPrice: true,
        mrp: true,
        categoryId: true,
        brandId: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    }),
    prisma.itemAsset.findMany({
      where: { shopId },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            defaultSellingPrice: true,
            minimumAllowedPrice: true,
            mrp: true,
            categoryId: true,
            brandId: true,
            category: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.itemCategory.findMany({
      where: { shopId },
      select: { id: true, name: true },
    }),
  ]);

  // Build referenced keys set and itemReferenceMap
  const referencedKeys = new Set();
  const itemReferenceMap = new Map();
  const itemAssetMap = new Map();
  const itemMap = new Map();
  const categoryMap = new Map(shopCategories.map((c) => [c.id, c.name]));

  activeItems.forEach((it) => {
    const meta = {
      itemId: it.id,
      productName: it.name,
      categoryId: it.categoryId || null,
      categoryName: it.category?.name || null,
      brandId: it.brandId || null,
      brandName: it.brand?.name || null,
      sellingPrice: it.defaultSellingPrice != null ? String(it.defaultSellingPrice) : null,
      minPrice: it.minimumAllowedPrice != null ? String(it.minimumAllowedPrice) : null,
      mrp: it.mrp != null ? String(it.mrp) : null,
    };
    itemMap.set(it.id, meta);

    if (it.imageUrl) {
      it.imageUrl.split(",").forEach((url) => {
        const trimmed = url.trim();
        itemReferenceMap.set(trimmed, meta);
        if (trimmed.includes(".amazonaws.com/")) {
          const key = trimmed.split(".amazonaws.com/")[1];
          if (key) {
            referencedKeys.add(key);
            itemReferenceMap.set(key, meta);
          }
        } else {
          referencedKeys.add(trimmed);
        }
      });
    }
  });

  itemAssetsList.forEach((ia) => {
    if (ia.item) {
      const it = ia.item;
      const meta = {
        itemId: it.id,
        productName: it.name,
        categoryId: it.categoryId || null,
        categoryName: it.category?.name || null,
        brandId: it.brandId || null,
        brandName: it.brand?.name || null,
        sellingPrice: it.defaultSellingPrice != null ? String(it.defaultSellingPrice) : null,
        minPrice: it.minimumAllowedPrice != null ? String(it.minimumAllowedPrice) : null,
        mrp: it.mrp != null ? String(it.mrp) : null,
      };
      itemAssetMap.set(ia.assetId, meta);
      referencedKeys.add(ia.assetId);
    }
  });

  // Unique categories and brands for filter UI (first page load/no cursor)
  let categories = [];
  let brands = [];
  if (!cursor) {
    const categoriesMap = new Map();
    const brandsMap = new Map();
    activeItems.forEach((it) => {
      if (it.categoryId && it.category) categoriesMap.set(it.categoryId, it.category.name);
      if (it.brandId && it.brand) brandsMap.set(it.brandId, it.brand.name);
    });
    categories = [...categoriesMap.entries()].map(([id, name]) => ({ id, name }));
    brands = [...brandsMap.entries()].map(([id, name]) => ({ id, name }));
  }

  // Find active items matching the category/brand/search filters
  const itemWhere = { shopId, status: "ACTIVE" };
  if (categoryId && categoryId !== "ALL") {
    itemWhere.categoryId = categoryId;
  }
  if (brandId && brandId !== "ALL") {
    itemWhere.brandId = brandId;
  }
  if (search && search.trim()) {
    itemWhere.name = { contains: search.trim(), mode: "insensitive" };
  }

  const needsItemQuery = (categoryId && categoryId !== "ALL") || (brandId && brandId !== "ALL") || (search && search.trim());
  let matchingItemKeys = [];

  if (needsItemQuery) {
    const matchedItems = await prisma.item.findMany({
      where: itemWhere,
      select: { imageUrl: true }
    });
    const keys = new Set();
    matchedItems.forEach((it) => {
      if (it.imageUrl) {
        it.imageUrl.split(",").forEach((url) => {
          const trimmed = url.trim();
          keys.add(trimmed);
          if (trimmed.includes(".amazonaws.com/")) {
            const key = trimmed.split(".amazonaws.com/")[1];
            if (key) keys.add(key);
          }
        });
      }
    });
    matchingItemKeys = Array.from(keys);
  }

  // Build Prisma filter query on the Asset table
  const assetWhere = {
    shopId,
    deletedAt: null,
  };

  if (provider && provider !== "ALL") {
    assetWhere.storageProvider = provider;
  }

  // Type filter
  if (type && type !== "ALL") {
    if (type === "IMAGE") {
      assetWhere.mimeType = { startsWith: "image/" };
    } else if (type === "VIDEO") {
      assetWhere.mimeType = { startsWith: "video/" };
    } else if (type === "AUDIO") {
      assetWhere.mimeType = { startsWith: "audio/" };
    } else if (type === "DOC") {
      assetWhere.AND = [
        { mimeType: { not: { startsWith: "image/" } } },
        { mimeType: { not: { startsWith: "video/" } } },
        { mimeType: { not: { startsWith: "audio/" } } },
      ];
    }
  }

  // Category / Brand / Search filters
  if (needsItemQuery) {
    const isCategoryOrBrandFilter = (categoryId && categoryId !== "ALL") || (brandId && brandId !== "ALL");
    if (isCategoryOrBrandFilter) {
      if (matchingItemKeys.length > 0) {
        assetWhere.storageKey = { in: matchingItemKeys };
      } else {
        assetWhere.id = "force-no-match-non-existent-id";
      }
    } else if (search && search.trim()) {
      const s = search.trim();
      const searchConditions = [
        { fileName: { contains: s, mode: "insensitive" } },
        { storageKey: { contains: s, mode: "insensitive" } },
      ];
      if (matchingItemKeys.length > 0) {
        searchConditions.push({ storageKey: { in: matchingItemKeys } });
      }
      if (assetWhere.AND) {
        assetWhere.AND.push({ OR: searchConditions });
      } else {
        assetWhere.OR = searchConditions;
      }
    }
  }

  // Unused/Orphaned filter
  if (filter === "ORPHANED" || filter === "UNUSED") {
    assetWhere.waMessages = { none: {} };
    assetWhere.ledgerAttachments = { none: {} };
    assetWhere.storageKey = { notIn: Array.from(referencedKeys) };
  }

  // Sort order mapping
  let orderBy = { createdAt: "desc" };
  if (sortBy) {
    if (sortBy === "date_asc") orderBy = { createdAt: "asc" };
    else if (sortBy === "size_desc") orderBy = { sizeBytes: "desc" };
    else if (sortBy === "size_asc") orderBy = { sizeBytes: "asc" };
    else if (sortBy === "name_asc") orderBy = { fileName: "asc" };
  }

  // Execute database query with cursor pagination
  const targetLimit = Math.min(Number(limit) || 30, 100);
  const rawAssets = await prisma.asset.findMany({
    where: assetWhere,
    include: {
      _count: {
        select: { waMessages: true, ledgerAttachments: true },
      },
    },
    orderBy,
    take: targetLimit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rawAssets.length > targetLimit;
  const batch = hasMore ? rawAssets.slice(0, targetLimit) : rawAssets;
  const nextCursor = batch.length > 0 ? batch[batch.length - 1].id : null;

  const assets = await Promise.all(batch.map(async (a) => {
    let meta = itemAssetMap.get(a.id) || (a.storageKey ? itemReferenceMap.get(a.storageKey) : null);
    if (!meta && a.remoteUrl) meta = itemReferenceMap.get(a.remoteUrl);
    if (!meta) meta = itemReferenceMap.get(a.id);

    if (!meta && a.metadata && typeof a.metadata === "object") {
      const metaObj = a.metadata;
      if (metaObj.itemId && itemMap.has(metaObj.itemId)) {
        meta = itemMap.get(metaObj.itemId);
      } else if (metaObj.categoryPath) {
        const catIdMatch = String(metaObj.categoryPath).match(/-(cm[a-z0-9]+)$/);
        if (catIdMatch && categoryMap.has(catIdMatch[1])) {
          const catName = categoryMap.get(catIdMatch[1]);
          meta = {
            categoryId: catIdMatch[1],
            categoryName: catName,
            productName: `Product Asset (${catName})`,
          };
        }
      }
    }

    let url = a.remoteUrl;
    if (!url && a.storageKey) {
      try {
        url = await getObjectPublicUrl({
          key: a.storageKey,
          provider: a.storageProvider,
          externalId: a.externalId,
        });
      } catch (_) {
        url = "";
      }
    }
    return {
      id: a.id,
      fileName: a.fileName || (a.storageKey ? a.storageKey.split("/").pop() : "Unnamed File"),
      storageKey: a.storageKey || "",
      sizeBytes: a.sizeBytes ? Number(a.sizeBytes) : 0,
      mimeType: a.mimeType || "application/octet-stream",
      createdAt: a.createdAt,
      url,
      storageProvider: a.storageProvider || "S3",
      width: a.width ?? null,
      height: a.height ?? null,
      waMessagesCount: a._count.waMessages,
      ledgerAttachmentsCount: a._count.ledgerAttachments,
      itemId: meta?.itemId || null,
      productName: meta?.productName || null,
      categoryId: meta?.categoryId || null,
      categoryName: meta?.categoryName || null,
      brandId: meta?.brandId || null,
      brandName: meta?.brandName || null,
      sellingPrice: meta?.sellingPrice || null,
      minPrice: meta?.minPrice || null,
      mrp: meta?.mrp || null,
    };
  }));

  // Calculate filtered stats/counts for correct tab headings
  const countWhere = { ...assetWhere };
  delete countWhere.waMessages;
  delete countWhere.ledgerAttachments;
  if (countWhere.storageKey && countWhere.storageKey.notIn) {
    delete countWhere.storageKey;
  }
  const totalAllCount = await prisma.asset.count({ where: countWhere });

  const orphanCountWhere = {
    ...countWhere,
    waMessages: { none: {} },
    ledgerAttachments: { none: {} },
    storageKey: { notIn: Array.from(referencedKeys) },
  };
  const totalOrphanedCount = await prisma.asset.count({ where: orphanCountWhere });
  const totalOrphanedBytesAggregate = await prisma.asset.aggregate({
    where: orphanCountWhere,
    _sum: { sizeBytes: true }
  });
  const totalOrphanedBytes = Number(totalOrphanedBytesAggregate._sum.sizeBytes || 0);
  const totalCount = await prisma.asset.count({ where: assetWhere });
  const totalBytesAggregate = await prisma.asset.aggregate({
    where: assetWhere,
    _sum: { sizeBytes: true }
  });
  const totalBytes = Number(totalBytesAggregate._sum.sizeBytes || 0);

  return {
    assets,
    nextCursor,
    hasMore,
    categories,
    brands,
    totalCount,
    totalBytes,
    totalAllCount,
    totalOrphanedCount,
    totalOrphanedBytes,
  };
}

export async function deleteStorageObject(user, id) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: { _count: { select: { ledgerAttachments: true } } },
  });
  if (!asset) {
    throw new ApiError(404, "Asset not found");
  }

  await assertShopAccess(user, asset.shopId);
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Access restricted to owners");
  }
  if (asset._count.ledgerAttachments > 0) {
    throw new ApiError(409, "This file is financial ledger evidence and cannot be deleted");
  }

  // Delete from storage provider (OneDrive or S3)
  if (asset.storageKey) {
    if (asset.storageProvider === "ONEDRIVE") {
      await deleteOneDriveObject(asset.storageKey, asset.externalId);
    } else {
      await deleteS3Object(asset.storageKey);
    }
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
        select: { waMessages: true, ledgerAttachments: true },
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
    return !referencedKeys.has(a.storageKey)
      && a._count.waMessages === 0
      && a._count.ledgerAttachments === 0;
  });

  let deletedCount = 0;
  let sizeBytesFreed = 0;

  for (const asset of orphans) {
    try {
      if (asset.storageKey) {
        if (asset.storageProvider === "ONEDRIVE") {
          await deleteOneDriveObject(asset.storageKey, asset.externalId);
        } else {
          await deleteS3Object(asset.storageKey);
        }
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

function getPeriodKey(dateObj, granularity) {
  const d = new Date(dateObj);
  if (granularity === "MONTH") {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (granularity === "WEEK") {
    const day = d.getDay();
    const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diffToMon));
    return mon.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export async function getOwnerDashboardAnalytics(user, { shopId, dateFrom, dateTo, granularity = "AUTO", topLimit = 5 }) {
  if (shopId) await assertShopAccess(user, shopId);

  const start = new Date(`${dateFrom}T00:00:00.000+05:30`);
  const end = new Date(`${dateTo}T23:59:59.999+05:30`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  if (start > end) {
    throw new ApiError(400, "dateFrom cannot be after dateTo");
  }

  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 366) {
    throw new ApiError(400, "Maximum permitted range is 366 days");
  }

  const ownedShopIds = shopId
    ? [shopId]
    : (await prisma.shop.findMany({ where: { ownerId: user.id }, select: { id: true } })).map((shop) => shop.id);

  if (ownedShopIds.length === 0) {
    return {
      range: { dateFrom, dateTo, granularity: "DAY", timezone: "Asia/Kolkata" },
      totals: { salesAmount: 0, invoiceCount: 0, expensesAmount: 0, salesLessRecordedExpenses: 0, collectedAmount: 0 },
      salesTrend: [],
      paymentMix: [],
      orderStatus: [],
      topItems: [],
      topCustomers: [],
      customerTrend: [],
    };
  }

  let effectiveGranularity = granularity;
  if (!effectiveGranularity || effectiveGranularity === "AUTO") {
    if (diffDays <= 31) effectiveGranularity = "DAY";
    else if (diffDays <= 120) effectiveGranularity = "WEEK";
    else effectiveGranularity = "MONTH";
  }

  const limit = Math.max(3, Math.min(Number(topLimit) || 5, 10));
  const whereShop = { shopId: { in: ownedShopIds } };

  const [
    sales,
    expenses,
    paymentsRaw,
    ordersRaw,
    saleItemsRaw,
    topCustomersRaw,
    newCustomersRaw
  ] = await Promise.all([
    prisma.sale.findMany({
      where: { ...whereShop, saleStatus: { not: "CANCELLED" }, saleDate: { gte: start, lte: end } },
      select: { id: true, totalAmount: true, saleDate: true }
    }),
    prisma.expense.findMany({
      where: { ...whereShop, createdAt: { gte: start, lte: end } },
      select: { id: true, amount: true, createdAt: true }
    }),
    prisma.payment.groupBy({
      by: ["paymentMode"],
      where: { ...whereShop, status: { notIn: ["CANCELLED", "REJECTED"] }, receivedAt: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { ...whereShop, createdAt: { gte: start, lte: end } },
      _count: { id: true },
    }),
    prisma.saleItem.findMany({
      where: {
        sale: { ...whereShop, saleStatus: { not: "CANCELLED" }, saleDate: { gte: start, lte: end } }
      },
      select: {
        itemId: true,
        quantity: true,
        totalAmount: true,
        item: { select: { id: true, name: true } }
      }
    }),
    prisma.sale.groupBy({
      by: ["customerId"],
      where: { ...whereShop, saleStatus: { not: "CANCELLED" }, isWalkin: false, saleDate: { gte: start, lte: end } },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: limit
    }),
    prisma.customer.findMany({
      where: { ...whereShop, type: { not: "WALK_IN" }, createdAt: { gte: start, lte: end } },
      select: { createdAt: true }
    })
  ]);

  // Aggregate Sales Trend & Expenses Trend by Period
  const trendMap = new Map();

  sales.forEach((s) => {
    const key = getPeriodKey(s.saleDate, effectiveGranularity);
    const current = trendMap.get(key) || { period: key, salesAmount: 0, expensesAmount: 0, invoiceCount: 0 };
    current.salesAmount += Number(s.totalAmount || 0);
    current.invoiceCount += 1;
    trendMap.set(key, current);
  });

  expenses.forEach((e) => {
    const key = getPeriodKey(e.createdAt, effectiveGranularity);
    const current = trendMap.get(key) || { period: key, salesAmount: 0, expensesAmount: 0, invoiceCount: 0 };
    current.expensesAmount += Number(e.amount || 0);
    trendMap.set(key, current);
  });

  const salesTrend = Array.from(trendMap.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((item) => ({
      ...item,
      salesAmount: Number(item.salesAmount.toFixed(2)),
      expensesAmount: Number(item.expensesAmount.toFixed(2)),
      salesLessRecordedExpenses: Number((item.salesAmount - item.expensesAmount).toFixed(2)),
    }));

  // Aggregate Customer Trend
  const custTrendMap = new Map();
  newCustomersRaw.forEach((c) => {
    const key = getPeriodKey(c.createdAt, effectiveGranularity);
    custTrendMap.set(key, (custTrendMap.get(key) || 0) + 1);
  });

  const customerTrend = Array.from(custTrendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, newCustomers]) => ({ period, newCustomers }));

  // Aggregate Payment Mix
  const paymentMix = paymentsRaw.map((p) => ({
    paymentMode: p.paymentMode,
    amount: Number((p._sum.amount || 0).toFixed(2)),
    paymentCount: p._count.id,
  }));

  // Aggregate Order Status
  const orderStatus = ordersRaw.map((o) => ({
    status: o.status,
    count: o._count.id,
  }));

  // Aggregate Top Items
  const itemAggMap = new Map();
  saleItemsRaw.forEach((si) => {
    const current = itemAggMap.get(si.itemId) || {
      itemId: si.itemId,
      itemName: si.item?.name || "Unknown Item",
      quantitySold: 0,
      revenue: 0,
    };
    current.quantitySold += Number(si.quantity || 0);
    current.revenue += Number(si.totalAmount || 0);
    itemAggMap.set(si.itemId, current);
  });

  const topItems = Array.from(itemAggMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((it) => ({
      ...it,
      quantitySold: Number(it.quantitySold.toFixed(3)),
      revenue: Number(it.revenue.toFixed(2)),
    }));

  // Aggregate Top Customers
  const customerIds = topCustomersRaw.map((tc) => tc.customerId).filter(Boolean);
  const customerDetails = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true }
  });
  const customerNameMap = new Map(customerDetails.map((c) => [c.id, c.name]));

  const topCustomers = topCustomersRaw.map((tc) => ({
    customerId: tc.customerId,
    customerName: customerNameMap.get(tc.customerId) || "Unknown Customer",
    invoiceCount: tc._count.id,
    salesAmount: Number((tc._sum.totalAmount || 0).toFixed(2)),
  }));

  // Calculate Totals
  const totalSalesAmount = sales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
  const totalExpensesAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalCollectedAmount = paymentMix.reduce((sum, p) => sum + p.amount, 0);

  return {
    range: {
      dateFrom,
      dateTo,
      granularity: effectiveGranularity,
      timezone: "Asia/Kolkata",
    },
    totals: {
      salesAmount: Number(totalSalesAmount.toFixed(2)),
      invoiceCount: sales.length,
      expensesAmount: Number(totalExpensesAmount.toFixed(2)),
      salesLessRecordedExpenses: Number((totalSalesAmount - totalExpensesAmount).toFixed(2)),
      collectedAmount: Number(totalCollectedAmount.toFixed(2)),
    },
    salesTrend,
    paymentMix,
    orderStatus,
    topItems,
    topCustomers,
    customerTrend,
  };
}
