import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";

export async function listItems(user, { shopId, search, page = 1, limit = 50 }) {
  await assertShopAccess(user, shopId);

  const where = {
    shopId,
    status: "ACTIVE",
    OR: search
      ? [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
        ]
      : undefined,
  };

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.item.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
  };
}

export async function createCategory(user, data) {
  await assertShopAccess(user, data.shopId);
  return prisma.itemCategory.create({
    data: {
      shopId: data.shopId,
      name: data.name,
    },
  });
}

export async function createItem(user, data) {
  await assertShopAccess(user, data.shopId);

  if (data.categoryId) {
    const category = await prisma.itemCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || category.shopId !== data.shopId) {
      throw new ApiError(400, "Category does not belong to this shop");
    }
  }

  const item = await prisma.item.create({
    data,
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: item.shopId,
    action: "item.created",
    entityType: "Item",
    entityId: item.id,
    newValueJson: item,
  });

  return item;
}

export async function updateItem(user, id, data) {
  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Item not found");
  await assertShopAccess(user, existing.shopId);

  if (data.categoryId) {
    const category = await prisma.itemCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || category.shopId !== existing.shopId) {
      throw new ApiError(400, "Category does not belong to this shop");
    }
  }

  const item = await prisma.item.update({
    where: { id },
    data,
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: item.shopId,
    action: "item.updated",
    entityType: "Item",
    entityId: id,
    oldValueJson: existing,
    newValueJson: item,
  });

  return item;
}

export async function getItemStock(user, id) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new ApiError(404, "Item not found");
  await assertShopAccess(user, item.shopId);

  const stock = await prisma.stockLedger.aggregate({
    where: { itemId: id, shopId: item.shopId },
    _sum: { quantityIn: true, quantityOut: true },
  });
  const quantityIn = Number(stock._sum.quantityIn || 0);
  const quantityOut = Number(stock._sum.quantityOut || 0);
  return { item, quantityIn, quantityOut, currentQuantity: quantityIn - quantityOut };
}

export async function getPriceHistory(user, id, { customerId }) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new ApiError(404, "Item not found");
  await assertShopAccess(user, item.shopId);

  const [sales, dms, orders] = await Promise.all([
    prisma.saleItem.findMany({
      where: { itemId: id, sale: { customerId: customerId || undefined } },
      include: { sale: { include: { customer: true, staff: { select: { id: true, name: true } } } } },
      orderBy: { sale: { createdAt: "desc" } },
      take: 100,
    }),
    prisma.deliveryMemoItem.findMany({
      where: { itemId: id, deliveryMemo: { customerId: customerId || undefined } },
      include: { deliveryMemo: { include: { customer: true, staff: { select: { id: true, name: true } } } } },
      orderBy: { deliveryMemo: { createdAt: "desc" } },
      take: 100,
    }),
    prisma.orderItem.findMany({
      where: { itemId: id, order: { customerId: customerId || undefined } },
      include: { order: { include: { customer: true, createdBy: { select: { id: true, name: true } } } } },
      orderBy: { order: { createdAt: "desc" } },
      take: 100,
    }),
  ]);

  const rows = [
    ...sales.map((row) => ({ type: "SALE", date: row.sale.createdAt, customer: row.sale.customer, staff: row.sale.staff, quantity: row.quantity, rate: row.rate, recordNumber: row.sale.saleNumber })),
    ...dms.map((row) => ({ type: "DM", date: row.deliveryMemo.createdAt, customer: row.deliveryMemo.customer, staff: row.deliveryMemo.staff, quantity: row.quantity, rate: row.rate, recordNumber: row.deliveryMemo.dmNumber })),
    ...orders.map((row) => ({ type: "ORDER", date: row.order.createdAt, customer: row.order.customer, staff: row.order.createdBy, quantity: row.quantityOrdered, rate: row.rate, recordNumber: row.order.orderNumber })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const rates = rows.map((row) => Number(row.rate));
  return {
    item,
    rows,
    summary: {
      lastRate: rates[0] ?? null,
      averageRate: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null,
      minRate: rates.length ? Math.min(...rates) : null,
      maxRate: rates.length ? Math.max(...rates) : null,
      count: rows.length,
    },
  };
}

export async function getRateSuggestion(user, id, { customerId }) {
  if (!customerId) throw new ApiError(400, "customerId is required");
  const history = await getPriceHistory(user, id, { customerId });
  return {
    item: history.item,
    customerId,
    suggestedRate: history.summary.lastRate ?? Number(history.item.defaultSellingPrice || 0),
    summary: history.summary,
    lastFive: history.rows.slice(0, 5),
  };
}
