import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { generateEmbedding } from "../utils/embeddings.js";

export async function listItems(user, { shopId, search, page = 1, limit = 50 }) {
  await assertShopAccess(user, shopId);

  const skip = (page - 1) * limit;

  if (search) {
    const embedding = await generateEmbedding(search);
    const vectorString = `[${embedding.join(',')}]`;
    const likePattern = `%${search}%`;

    // Hybrid SQL query combining name/sku ILIKE search and vector similarity ranking
    const items = await prisma.$queryRaw`
      SELECT 
        i.id, i."shopId", i.name, i.sku, i."categoryId", i.unit,
        i."defaultSellingPrice", i."minimumAllowedPrice", i."purchasePrice", i.mrp,
        i."minimumStock", i."imageUrl", i.status, i."createdAt", i."updatedAt",
        c.id as "category_id", c.name as "category_name", c.status as "category_status", 
        c."createdAt" as "category_createdAt", c."updatedAt" as "category_updatedAt",
        COALESCE(i.embedding <=> ${vectorString}::vector, 1.0) as distance,
        (CASE WHEN i.sku ILIKE ${likePattern} THEN 0.0 ELSE 1.0 END) * 0.1 + 
        (CASE WHEN i.name ILIKE ${likePattern} THEN 0.0 ELSE 1.0 END) * 0.2 + 
        COALESCE(i.embedding <=> ${vectorString}::vector, 1.0) as score
      FROM "Item" i
      LEFT JOIN "ItemCategory" c ON i."categoryId" = c.id
      WHERE i."shopId" = ${shopId} AND i.status = 'ACTIVE'
      ORDER BY score ASC
      LIMIT ${limit}
      OFFSET ${skip};
    `;

    const total = await prisma.item.count({
      where: { shopId, status: "ACTIVE" }
    });

    const formattedItems = items.map(item => {
      const { category_id, category_name, category_status, category_createdAt, category_updatedAt, ...rest } = item;
      return {
        ...rest,
        defaultSellingPrice: Number(item.defaultSellingPrice),
        minimumAllowedPrice: item.minimumAllowedPrice ? Number(item.minimumAllowedPrice) : null,
        purchasePrice: item.purchasePrice ? Number(item.purchasePrice) : null,
        mrp: item.mrp ? Number(item.mrp) : null,
        minimumStock: Number(item.minimumStock),
        category: category_id ? {
          id: category_id,
          name: category_name,
          status: category_status,
          createdAt: category_createdAt,
          updatedAt: category_updatedAt,
        } : null
      };
    });

    return {
      items: formattedItems,
      total,
      page,
      limit,
      hasMore: skip + formattedItems.length < total,
    };
  } else {
    // Normal non-search catalog listing
    const where = {
      shopId,
      status: "ACTIVE",
    };

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
      items: items.map(item => ({
        ...item,
        defaultSellingPrice: Number(item.defaultSellingPrice),
        minimumAllowedPrice: item.minimumAllowedPrice ? Number(item.minimumAllowedPrice) : null,
        purchasePrice: item.purchasePrice ? Number(item.purchasePrice) : null,
        mrp: item.mrp ? Number(item.mrp) : null,
        minimumStock: Number(item.minimumStock),
      })),
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }
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

  // Generate embedding for item name
  const embedding = await generateEmbedding(data.name);

  return prisma.$transaction(async (tx) => {
    const item = await tx.item.create({
      data,
    });

    const vectorString = `[${embedding.join(',')}]`;
    await tx.$executeRawUnsafe(
      `UPDATE "Item" SET embedding = $1::vector WHERE id = $2`,
      vectorString,
      item.id
    );

    // Initial price history entry
    if (data.defaultSellingPrice) {
      await tx.itemPriceHistory.create({
        data: {
          itemId: item.id,
          oldPrice: 0,
          newPrice: data.defaultSellingPrice,
          priceType: "SELLING",
          changedById: user.id
        }
      });
    }

    await writeAuditLog({
      userId: user.id,
      shopId: item.shopId,
      action: AuditAction.CREATED,
      entityType: EntityType.ITEM,
      entityId: item.id,
      newValueJson: item,
    });

    return tx.item.findUnique({ where: { id: item.id } });
  });
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

  let embedding = null;
  if (data.name && data.name !== existing.name) {
    embedding = await generateEmbedding(data.name);
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.item.update({
      where: { id },
      data,
    });

    if (embedding) {
      const vectorString = `[${embedding.join(',')}]`;
      await tx.$executeRawUnsafe(
        `UPDATE "Item" SET embedding = $1::vector WHERE id = $2`,
        vectorString,
        item.id
      );
    }

    // Track price changes
    const priceTypes = [
      { key: "defaultSellingPrice", label: "SELLING" },
      { key: "minimumAllowedPrice", label: "MINIMUM" },
      { key: "mrp", label: "MRP" },
      { key: "purchasePrice", label: "PURCHASE" },
    ];

    for (const { key, label } of priceTypes) {
      if (data[key] !== undefined && data[key] !== null && Number(data[key]) !== Number(existing[key])) {
        await tx.itemPriceHistory.create({
          data: {
            itemId: id,
            oldPrice: existing[key] || 0,
            newPrice: data[key],
            priceType: label,
            changedById: user.id
          }
        });
      }
    }

    await writeAuditLog({
      userId: user.id,
      shopId: item.shopId,
      action: AuditAction.UPDATED,
      entityType: EntityType.ITEM,
      entityId: id,
      oldValueJson: existing,
      newValueJson: item,
    });

    return tx.item.findUnique({ where: { id } });
  });
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

export async function getPurchaseHistory(user, id, { customerId }) {
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

export async function getPriceChangeHistory(user, id) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new ApiError(404, "Item not found");
  await assertShopAccess(user, item.shopId);

  return prisma.itemPriceHistory.findMany({
    where: { itemId: id },
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRateSuggestion(user, id, { customerId }) {
  if (!customerId) throw new ApiError(400, "customerId is required");
  const history = await getPurchaseHistory(user, id, { customerId });
  return {
    item: history.item,
    customerId,
    suggestedRate: history.summary.lastRate ?? Number(history.item.defaultSellingPrice || 0),
    summary: history.summary,
    lastFive: history.rows.slice(0, 5),
  };
}

export { getPurchaseHistory as getPriceHistory };
