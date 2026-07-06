import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { EntityType, AuditAction, Prisma } from "../generated/prisma/index.js";
import { generateEmbedding } from "../utils/embeddings.js";
import { uploadToS3 } from "../lib/wa-media.js";
import { createDomainEvent, enqueueDomainEvent } from "./domain-event.service.js";
import {
  bestEffortInvalidateForDomainEvent,
  readThroughDomainCache,
} from "../cache/domain-read-cache.js";

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

/**
 * Only OWNER role can create/update/delete catalog items and categories.
 * Staff can VIEW stock and search, but cannot mutate the catalog.
 */
function assertCanManageItems(user) {
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Only owners can manage products and categories");
  }
}

/**
 * Only OWNER role can directly write to the stock ledger.
 * Staff must submit a stock entry request (handled in stock.service bulkStockEntry).
 */
function assertCanDirectlyAdjustStock(user) {
  if (user.role !== "OWNER") {
    throw new ApiError(
      403,
      "Direct stock adjustment is restricted to owners. Staff must submit a stock entry request."
    );
  }
}

function slugPart(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || fallback;
}

// ---------------------------------------------------------------------------
// Shared stock map helper (eliminates duplication between attachAvailableStock
// and getItemSummary — single source of truth for physical/reserved stock)
// ---------------------------------------------------------------------------

async function getStockMaps(db, shopId, itemIds) {
  const [ledgerSums, reservationSums] = await Promise.all([
    db.stockLedger.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, shopId },
      _sum: { quantityIn: true, quantityOut: true },
    }),
    db.stockReservation.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, shopId, status: "ACTIVE" },
      _sum: { reservedQty: true },
    }),
  ]);

  const physicalMap = new Map(
    ledgerSums.map((row) => [
      row.itemId,
      Number(row._sum.quantityIn || 0) - Number(row._sum.quantityOut || 0),
    ])
  );

  const reservedMap = new Map(
    reservationSums.map((row) => [
      row.itemId,
      Number(row._sum.reservedQty || 0),
    ])
  );

  return { physicalMap, reservedMap };
}

// ---------------------------------------------------------------------------
// Field whitelisting — never spread raw request body into Prisma
// ---------------------------------------------------------------------------

function pickItemCreateFields(data) {
  const allowed = {
    shopId: data.shopId,
    name: data.name,
    sku: data.sku,
    categoryId: data.categoryId,
    brandId: data.brandId,
    unit: data.unit,
    defaultSellingPrice: data.defaultSellingPrice,
    minimumAllowedPrice: data.minimumAllowedPrice,
    purchasePrice: data.purchasePrice,
    mrp: data.mrp,
    minimumStock: data.minimumStock,
    imageUrl: data.imageUrl,
    requiresSerialNumber: data.requiresSerialNumber,
  };
  return Object.fromEntries(Object.entries(allowed).filter(([, v]) => v !== undefined));
}

function pickItemUpdateFields(data) {
  const allowed = {
    name: data.name,
    sku: data.sku,
    categoryId: data.categoryId,
    brandId: data.brandId,
    unit: data.unit,
    defaultSellingPrice: data.defaultSellingPrice,
    minimumAllowedPrice: data.minimumAllowedPrice,
    purchasePrice: data.purchasePrice,
    mrp: data.mrp,
    minimumStock: data.minimumStock,
    imageUrl: data.imageUrl,
    requiresSerialNumber: data.requiresSerialNumber,
  };
  return Object.fromEntries(Object.entries(allowed).filter(([, v]) => v !== undefined));
}

function formatBundleComponents(components = []) {
  return components.map((component) => ({
    id: component.id,
    parentItemId: component.parentItemId,
    componentItemId: component.componentItemId,
    quantity: Number(component.quantity),
    componentItem: component.componentItem
      ? {
          id: component.componentItem.id,
          name: component.componentItem.name,
          sku: component.componentItem.sku,
          unit: component.componentItem.unit,
        }
      : undefined,
  }));
}

async function attachBundleComponents(shopId, itemsList) {
  if (!itemsList?.length) return itemsList;
  const parentIds = itemsList.map((item) => item.id);
  const components = await prisma.itemBundleComponent.findMany({
    where: { parentItemId: { in: parentIds }, parentItem: { shopId } },
    include: {
      componentItem: { select: { id: true, name: true, sku: true, unit: true } },
    },
    orderBy: [{ parentItemId: "asc" }, { createdAt: "asc" }],
  });
  const byParent = new Map();
  for (const component of components) {
    const list = byParent.get(component.parentItemId) || [];
    list.push(component);
    byParent.set(component.parentItemId, list);
  }
  return itemsList.map((item) => ({
    ...item,
    bundleComponents: formatBundleComponents(byParent.get(item.id) || []),
  }));
}

async function normalizeBundleComponents(tx, shopId, bundleComponents, parentItemId = null) {
  if (bundleComponents === undefined) return undefined;
  if (!Array.isArray(bundleComponents)) {
    throw new ApiError(400, "bundleComponents must be an array");
  }

  const normalized = [];
  const seen = new Set();
  for (const component of bundleComponents) {
    const componentItemId = component?.componentItemId;
    const quantity = Number(component?.quantity);
    if (!componentItemId) {
      throw new ApiError(400, "Bundle component product is required");
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, "Bundle component quantity must be greater than zero");
    }
    if (parentItemId && componentItemId === parentItemId) {
      throw new ApiError(400, "A product cannot be a component of itself");
    }
    if (seen.has(componentItemId)) {
      throw new ApiError(400, "Bundle component products cannot be duplicated");
    }
    seen.add(componentItemId);
    normalized.push({ componentItemId, quantity });
  }

  if (normalized.length === 0) return [];

  const componentIds = normalized.map((component) => component.componentItemId);
  const componentItems = await tx.item.findMany({
    where: { id: { in: componentIds }, shopId, status: "ACTIVE" },
    select: { id: true },
  });
  if (componentItems.length !== componentIds.length) {
    throw new ApiError(400, "One or more bundle components do not belong to this shop");
  }

  const nestedCount = await tx.itemBundleComponent.count({
    where: { parentItemId: { in: componentIds } },
  });
  if (nestedCount > 0) {
    throw new ApiError(400, "Nested bundle products are not supported");
  }

  return normalized;
}

async function replaceBundleComponents(tx, parentItemId, components) {
  if (components === undefined) return;
  await tx.itemBundleComponent.deleteMany({ where: { parentItemId } });
  if (components.length === 0) return;
  await tx.itemBundleComponent.createMany({
    data: components.map((component) => ({
      parentItemId,
      componentItemId: component.componentItemId,
      quantity: component.quantity,
    })),
  });
}

// ---------------------------------------------------------------------------
// Price validation
// ---------------------------------------------------------------------------

function validatePrices({ defaultSellingPrice, minimumAllowedPrice, mrp, purchasePrice }) {
  const numericFields = { defaultSellingPrice, minimumAllowedPrice, mrp, purchasePrice };
  for (const [key, val] of Object.entries(numericFields)) {
    if (val !== undefined && val !== null && (isNaN(Number(val)) || Number(val) < 0)) {
      throw new ApiError(400, `${key} must be a non-negative number`);
    }
  }
  if (
    minimumAllowedPrice !== undefined &&
    defaultSellingPrice !== undefined &&
    Number(minimumAllowedPrice) > Number(defaultSellingPrice)
  ) {
    throw new ApiError(400, "minimumAllowedPrice cannot exceed defaultSellingPrice");
  }
}

// ---------------------------------------------------------------------------
// attachAvailableStock
// Naming convention (consistent across all endpoints):
//   physicalStock  = quantityIn - quantityOut  (ledger total)
//   reservedStock  = sum of active reservations
//   availableStock = max(0, physical - reserved)
//   currentStock   = physicalStock  (NOT availableStock)
// ---------------------------------------------------------------------------

async function attachAvailableStock(shopId, itemsList) {
  if (!itemsList || itemsList.length === 0) return itemsList;
  const itemIds = itemsList.map((i) => i.id);
  const { physicalMap, reservedMap } = await getStockMaps(prisma, shopId, itemIds);

  return itemsList.map((item) => {
    const physical = physicalMap.get(item.id) || 0;
    const reserved = reservedMap.get(item.id) || 0;
    const available = Math.max(0, physical - reserved);
    return {
      ...item,
      physicalStock: physical,
      reservedStock: reserved,
      availableStock: available,
      currentStock: physical, // physical stock — consistent with getItemStock
    };
  });
}

// ---------------------------------------------------------------------------
// listItems
// ---------------------------------------------------------------------------

async function listItemsFromDb({ shopId, search, categoryId, brandId, page = 1, limit = 50 }) {
  const skip = (page - 1) * limit;
  const normalizedSearch = search?.trim();

  if (normalizedSearch && normalizedSearch.length >= 2) {
    const likePattern = `%${normalizedSearch}%`;

    // Only generate embedding for queries long enough to carry semantic meaning.
    // Short queries (1-2 chars) get lexical-only search to avoid wasted GPU calls.
    let embedding = null;
    try {
      if (normalizedSearch.length >= 3) {
        embedding = await generateEmbedding(normalizedSearch);
      }
    } catch {
      embedding = null; // always fallback to lexical — never hard-fail a search
    }

    let items;

    if (embedding) {
      const vectorString = `[${embedding.join(",")}]`;
      items = await prisma.$queryRaw`
        SELECT
          i.id, i."shopId", i.name, i.sku, i."categoryId", i."brandId", i.unit,
          i."defaultSellingPrice", i."minimumAllowedPrice", i."purchasePrice", i.mrp,
          i."minimumStock", i."imageUrl", i.status, i."createdAt", i."updatedAt",
          c.id as "category_id", c.name as "category_name", c.status as "category_status",
          c."createdAt" as "category_createdAt", c."updatedAt" as "category_updatedAt",
          b.id as "brand_id", b.name as "brand_name", b.status as "brand_status",
          b."createdAt" as "brand_createdAt", b."updatedAt" as "brand_updatedAt",
          (CASE WHEN i.sku ILIKE ${likePattern} THEN 0.0 ELSE 1.0 END) * 0.1 +
          (CASE WHEN i.name ILIKE ${likePattern} THEN 0.0 ELSE 1.0 END) * 0.2 +
          COALESCE(i.embedding <=> ${vectorString}::vector, 1.0) as score
        FROM "Item" i
        LEFT JOIN "ItemCategory" c ON i."categoryId" = c.id
        LEFT JOIN "ItemBrand" b ON i."brandId" = b.id
        WHERE i."shopId" = ${shopId} AND i.status = 'ACTIVE'
          AND (
            i.name ILIKE ${likePattern}
            OR i.sku ILIKE ${likePattern}
            OR c.name ILIKE ${likePattern}
            OR b.name ILIKE ${likePattern}
            OR COALESCE(i.embedding <=> ${vectorString}::vector, 1.0) < 0.35
          )
          ${categoryId ? (categoryId === "__uncat__" ? Prisma.sql`AND i."categoryId" IS NULL` : Prisma.sql`AND i."categoryId" = ${categoryId}`) : Prisma.empty}
          ${brandId ? (brandId === "__unbranded__" ? Prisma.sql`AND i."brandId" IS NULL` : Prisma.sql`AND i."brandId" = ${brandId}`) : Prisma.empty}
        ORDER BY score ASC
        LIMIT ${limit}
        OFFSET ${skip};
      `;
    } else {
      // Lexical-only fallback for short queries or embedding failure
      items = await prisma.$queryRaw`
        SELECT
          i.id, i."shopId", i.name, i.sku, i."categoryId", i."brandId", i.unit,
          i."defaultSellingPrice", i."minimumAllowedPrice", i."purchasePrice", i.mrp,
          i."minimumStock", i."imageUrl", i.status, i."createdAt", i."updatedAt",
          c.id as "category_id", c.name as "category_name", c.status as "category_status",
          c."createdAt" as "category_createdAt", c."updatedAt" as "category_updatedAt",
          b.id as "brand_id", b.name as "brand_name", b.status as "brand_status",
          b."createdAt" as "brand_createdAt", b."updatedAt" as "brand_updatedAt"
        FROM "Item" i
        LEFT JOIN "ItemCategory" c ON i."categoryId" = c.id
        LEFT JOIN "ItemBrand" b ON i."brandId" = b.id
        WHERE i."shopId" = ${shopId} AND i.status = 'ACTIVE'
          AND (
            i.name ILIKE ${likePattern}
            OR i.sku ILIKE ${likePattern}
            OR c.name ILIKE ${likePattern}
            OR b.name ILIKE ${likePattern}
          )
          ${categoryId ? (categoryId === "__uncat__" ? Prisma.sql`AND i."categoryId" IS NULL` : Prisma.sql`AND i."categoryId" = ${categoryId}`) : Prisma.empty}
          ${brandId ? (brandId === "__unbranded__" ? Prisma.sql`AND i."brandId" IS NULL` : Prisma.sql`AND i."brandId" = ${brandId}`) : Prisma.empty}
        ORDER BY i.name ASC
        LIMIT ${limit}
        OFFSET ${skip};
      `;
    }

    const formattedItems = items.map((item) => {
      const {
        category_id,
        category_name,
        category_status,
        category_createdAt,
        category_updatedAt,
        brand_id,
        brand_name,
        brand_status,
        brand_createdAt,
        brand_updatedAt,
        score,
        ...rest
      } = item;
      return {
        ...rest,
        defaultSellingPrice: Number(item.defaultSellingPrice),
        minimumAllowedPrice: item.minimumAllowedPrice ? Number(item.minimumAllowedPrice) : null,
        purchasePrice: item.purchasePrice ? Number(item.purchasePrice) : null,
        mrp: item.mrp ? Number(item.mrp) : null,
        minimumStock: Number(item.minimumStock),
        category: category_id
          ? {
              id: category_id,
              name: category_name,
              status: category_status,
              createdAt: category_createdAt,
              updatedAt: category_updatedAt,
            }
          : null,
        brand: brand_id
          ? {
              id: brand_id,
              name: brand_name,
              status: brand_status,
              createdAt: brand_createdAt,
              updatedAt: brand_updatedAt,
            }
          : null,
      };
    });

    const itemsWithStock = await attachAvailableStock(shopId, formattedItems);
    const itemsWithBundles = await attachBundleComponents(shopId, itemsWithStock);

    // Use result count for hasMore — avoids a separate COUNT(*) that ignores search filter
    return {
      items: itemsWithBundles,
      total: formattedItems.length,
      page,
      limit,
      hasMore: formattedItems.length === limit,
    };
  } else {
    // Normal non-search catalog listing with accurate pagination
    const where = {
      shopId,
      status: "ACTIVE",
      ...(categoryId
        ? categoryId === "__uncat__"
          ? { categoryId: null }
          : { categoryId }
        : {}),
      ...(brandId
        ? brandId === "__unbranded__"
          ? { brandId: null }
          : { brandId }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        include: { category: true, brand: true },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.item.count({ where }),
    ]);

    const formattedList = items.map((item) => ({
      ...item,
      defaultSellingPrice: Number(item.defaultSellingPrice),
      minimumAllowedPrice: item.minimumAllowedPrice ? Number(item.minimumAllowedPrice) : null,
      purchasePrice: item.purchasePrice ? Number(item.purchasePrice) : null,
      mrp: item.mrp ? Number(item.mrp) : null,
      minimumStock: Number(item.minimumStock),
    }));

    const itemsWithStock = await attachAvailableStock(shopId, formattedList);
    const itemsWithBundles = await attachBundleComponents(shopId, itemsWithStock);

    return {
      items: itemsWithBundles,
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }
}

export async function listItems(user, { shopId, search, categoryId, brandId, page = 1, limit = 50 }) {
  await assertShopAccess(user, shopId);
  const normalizedSearch = search?.trim() || null;
  const query = {
    search: normalizedSearch,
    categoryId: categoryId || null,
    brandId: brandId || null,
    page: Number(page) || 1,
    limit: Number(limit) || 50,
  };

  return readThroughDomainCache({
    shopId,
    domain: "items",
    query,
    loader: () => listItemsFromDb({ shopId, ...query }),
  });
}

// ---------------------------------------------------------------------------
// getItemSummary
// ---------------------------------------------------------------------------

export async function getItemSummary(user, { shopId }) {
  await assertShopAccess(user, shopId);

  const [totalItems, totalCategories, totalBrands] = await Promise.all([
    prisma.item.count({ where: { shopId, status: "ACTIVE" } }),
    prisma.itemCategory.count({ where: { shopId, status: "ACTIVE" } }),
    prisma.itemBrand.count({ where: { shopId, status: "ACTIVE" } }),
  ]);

  const items = await prisma.item.findMany({
    where: { shopId, status: "ACTIVE" },
    select: { id: true, minimumStock: true },
  });

  if (items.length === 0) {
    return {
      totalItems: 0,
      totalCategories,
      totalBrands,
      outOfStockCount: 0,
      lowStockCount: 0,
      countByCat: {},
      countByBrand: {},
      uncategorisedCount: 0,
      unbrandedCount: 0,
    };
  }

  const itemIds = items.map((i) => i.id);
  const { physicalMap, reservedMap } = await getStockMaps(prisma, shopId, itemIds);

  let outOfStockCount = 0;
  let lowStockCount = 0;

  items.forEach((item) => {
    const physical = physicalMap.get(item.id) || 0;
    const reserved = reservedMap.get(item.id) || 0;
    const available = Math.max(0, physical - reserved);
    const minStock = Number(item.minimumStock);

    if (available <= 0) {
      outOfStockCount++;
    } else if (minStock > 0 && available <= minStock) {
      lowStockCount++;
    }
  });

  const [catCounts, brandCounts] = await Promise.all([
    prisma.item.groupBy({
      by: ["categoryId"],
      where: { shopId, status: "ACTIVE" },
      _count: { id: true },
    }),
    prisma.item.groupBy({
      by: ["brandId"],
      where: { shopId, status: "ACTIVE" },
      _count: { id: true },
    }),
  ]);

  const countByCat = {};
  let uncategorisedCount = 0;
  catCounts.forEach((c) => {
    if (c.categoryId) {
      countByCat[c.categoryId] = c._count.id;
    } else {
      uncategorisedCount = c._count.id;
    }
  });

  const countByBrand = {};
  let unbrandedCount = 0;
  brandCounts.forEach((b) => {
    if (b.brandId) {
      countByBrand[b.brandId] = b._count.id;
    } else {
      unbrandedCount = b._count.id;
    }
  });

  return {
    totalItems,
    totalCategories,
    totalBrands,
    outOfStockCount,
    lowStockCount,
    countByCat,
    countByBrand,
    uncategorisedCount,
    unbrandedCount,
  };
}

// ---------------------------------------------------------------------------
// Category management — OWNER only
// ---------------------------------------------------------------------------

export async function createCategory(user, data) {
  await assertShopAccess(user, data.shopId);
  assertCanManageItems(user);

  const result = await prisma.$transaction(async (tx) => {
    const category = await tx.itemCategory.create({
      data: { shopId: data.shopId, name: data.name },
    });
    const event = createDomainEvent({
      shopId: category.shopId,
      entity: "category",
      action: "created",
      entityId: category.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });
    await enqueueDomainEvent(tx, event);
    return { category, event };
  });

  await bestEffortInvalidateForDomainEvent(result.event);
  return result.category;
}

export async function listCategories(user, { shopId }) {
  await assertShopAccess(user, shopId);
  return readThroughDomainCache({
    shopId,
    domain: "categories",
    query: {},
    loader: () => prisma.itemCategory.findMany({
      where: { shopId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  });
}

export async function updateCategory(user, id, { name }) {
  const existing = await prisma.itemCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Category not found");
  await assertShopAccess(user, existing.shopId);
  assertCanManageItems(user);

  const result = await prisma.$transaction(async (tx) => {
    const category = await tx.itemCategory.update({ where: { id }, data: { name } });
    const event = createDomainEvent({
      shopId: existing.shopId,
      entity: "category",
      action: "updated",
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });
    await enqueueDomainEvent(tx, event);
    return { category, event };
  });

  await bestEffortInvalidateForDomainEvent(result.event);
  return result.category;
}

export async function deleteCategory(user, id) {
  const existing = await prisma.itemCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Category not found");
  await assertShopAccess(user, existing.shopId);
  assertCanManageItems(user);

  const itemCount = await prisma.item.count({ where: { categoryId: id, status: "ACTIVE" } });
  if (itemCount > 0) {
    throw new ApiError(400, "Cannot delete category that contains active items");
  }

  const result = await prisma.$transaction(async (tx) => {
    const category = await tx.itemCategory.update({ where: { id }, data: { status: "INACTIVE" } });
    const event = createDomainEvent({
      shopId: existing.shopId,
      entity: "category",
      action: "deleted",
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });
    await enqueueDomainEvent(tx, event);
    return { category, event };
  });

  await bestEffortInvalidateForDomainEvent(result.event);
  return result.category;
}

// ---------------------------------------------------------------------------
// createItem — OWNER only
// ---------------------------------------------------------------------------

export async function createItem(user, data) {
  await assertShopAccess(user, data.shopId);
  assertCanManageItems(user);

  // Whitelist — never spread raw request body into Prisma
  const itemData = pickItemCreateFields(data);

  // Validate prices
  validatePrices(itemData);

  // Validate initialStock
  const openingStock = data.initialStock !== undefined ? Number(data.initialStock) : 0;
  if (!Number.isFinite(openingStock) || openingStock < 0) {
    throw new ApiError(400, "initialStock must be a non-negative number");
  }
  if (Array.isArray(data.bundleComponents) && data.bundleComponents.length > 0 && openingStock > 0) {
    throw new ApiError(400, "Virtual bundle products do not hold opening stock. Add stock to component products instead.");
  }

  if (itemData.minimumStock !== undefined && Number(itemData.minimumStock) < 0) {
    throw new ApiError(400, "minimumStock must be a non-negative number");
  }

  // Category must belong to this shop
  if (itemData.categoryId) {
    const category = await prisma.itemCategory.findUnique({ where: { id: itemData.categoryId } });
    if (!category || category.shopId !== itemData.shopId) {
      throw new ApiError(400, "Category does not belong to this shop");
    }
  }

  // Brand must belong to this shop
  if (itemData.brandId) {
    const brand = await prisma.itemBrand.findUnique({ where: { id: itemData.brandId } });
    if (!brand || brand.shopId !== itemData.shopId) {
      throw new ApiError(400, "Brand does not belong to this shop");
    }
  }

  // Generate embedding (failures are non-fatal — item still gets created)
  let embedding = null;
  try {
    embedding = await generateEmbedding(itemData.name);
  } catch {
    embedding = null;
  }

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.item.create({ data: itemData });
    const bundleComponents = await normalizeBundleComponents(tx, item.shopId, data.bundleComponents, item.id);
    await replaceBundleComponents(tx, item.id, bundleComponents);

    // Use $executeRaw tagged template — no $executeRawUnsafe
    if (embedding) {
      const vectorString = `[${embedding.join(",")}]`;
      await tx.$executeRaw`UPDATE "Item" SET embedding = ${vectorString}::vector WHERE id = ${item.id}`;
    }

    // Opening stock ledger entry (owner approved automatically)
    if (openingStock > 0) {
      await tx.stockLedger.create({
        data: {
          shopId: item.shopId,
          itemId: item.id,
          movementType: "OPENING_STOCK",
          quantityIn: openingStock,
          quantityOut: 0,
          referenceType: "ADJUSTMENT",
          reason: "Initial opening stock during item creation",
          createdById: user.id,
          approvedById: user.id,
        },
      });
    }

    // Initial price history
    if (itemData.defaultSellingPrice) {
      await tx.itemPriceHistory.create({
        data: {
          itemId: item.id,
          oldPrice: 0,
          newPrice: itemData.defaultSellingPrice,
          priceType: "SELLING",
          changedById: user.id,
        },
      });
    }

    // Audit log inside the transaction — atomic with the item creation
    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: item.shopId,
        action: AuditAction.CREATED,
        entityType: EntityType.ITEM,
        entityId: item.id,
        newValueJson: item,
      },
    });

    const event = createDomainEvent({
      shopId: item.shopId,
      entity: "item",
      action: "created",
      entityId: item.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });
    await enqueueDomainEvent(tx, event);

    const createdItem = await tx.item.findUnique({
      where: { id: item.id },
      include: {
        bundleComponents: {
          include: { componentItem: { select: { id: true, name: true, sku: true, unit: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return { item: createdItem, event };
  });

  await bestEffortInvalidateForDomainEvent(result.event);
  return { ...result.item, bundleComponents: formatBundleComponents(result.item.bundleComponents) };
}

// ---------------------------------------------------------------------------
// updateItem — OWNER only
// ---------------------------------------------------------------------------

export async function updateItem(user, id, data) {
  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Item not found");
  await assertShopAccess(user, existing.shopId);
  assertCanManageItems(user);

  const { adjustmentStock, bundleComponents: requestedBundleComponents, ...rawItemData } = data;

  // Whitelist — never spread raw request body into Prisma
  const itemData = pickItemUpdateFields(rawItemData);

  // Validate prices if provided
  validatePrices(itemData);

  // Validate and gate the stock adjustment
  let validatedAdjustment = undefined;
  if (adjustmentStock !== undefined) {
    assertCanDirectlyAdjustStock(user); // belt-and-suspenders on top of assertCanManageItems
    const adj = Number(adjustmentStock);
    if (!Number.isFinite(adj) || adj === 0) {
      throw new ApiError(400, "Stock adjustment must be a non-zero finite number");
    }
    if (Math.abs(adj) > 100_000) {
      throw new ApiError(400, "Stock adjustment value is too large (max ±100,000)");
    }
    validatedAdjustment = adj;
  }
  const existingBundleCount = await prisma.itemBundleComponent.count({ where: { parentItemId: id } });
  if (validatedAdjustment !== undefined && (existingBundleCount > 0 || (Array.isArray(requestedBundleComponents) && requestedBundleComponents.length > 0))) {
    throw new ApiError(400, "Virtual bundle products do not hold direct stock. Adjust component stock instead.");
  }

  // Category must belong to this shop
  if (itemData.categoryId) {
    const category = await prisma.itemCategory.findUnique({ where: { id: itemData.categoryId } });
    if (!category || category.shopId !== existing.shopId) {
      throw new ApiError(400, "Category does not belong to this shop");
    }
  }

  // Brand must belong to this shop
  if (itemData.brandId) {
    const brand = await prisma.itemBrand.findUnique({ where: { id: itemData.brandId } });
    if (!brand || brand.shopId !== existing.shopId) {
      throw new ApiError(400, "Brand does not belong to this shop");
    }
  }

  // Only regenerate embedding if name actually changed
  let embedding = null;
  if (itemData.name && itemData.name !== existing.name) {
    try {
      embedding = await generateEmbedding(itemData.name);
    } catch {
      embedding = null;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const bundleComponents = await normalizeBundleComponents(tx, existing.shopId, requestedBundleComponents, id);
    const item = await tx.item.update({ where: { id }, data: itemData });
    await replaceBundleComponents(tx, id, bundleComponents);

    if (embedding) {
      const vectorString = `[${embedding.join(",")}]`;
      await tx.$executeRaw`UPDATE "Item" SET embedding = ${vectorString}::vector WHERE id = ${item.id}`;
    }

    // Stock adjustment — owner-only, validated above
    if (validatedAdjustment !== undefined) {
      // Prevent going below zero on negative adjustments
      if (validatedAdjustment < 0) {
        const ledgerSum = await tx.stockLedger.aggregate({
          where: { shopId: item.shopId, itemId: item.id },
          _sum: { quantityIn: true, quantityOut: true },
        });
        const physicalNow =
          Number(ledgerSum._sum.quantityIn || 0) - Number(ledgerSum._sum.quantityOut || 0);
        if (physicalNow + validatedAdjustment < 0) {
          throw new ApiError(
            400,
            `Adjustment would make physical stock negative (current: ${physicalNow})`
          );
        }
      }

      const isPositive = validatedAdjustment > 0;
      await tx.stockLedger.create({
        data: {
          shopId: item.shopId,
          itemId: item.id,
          movementType: isPositive ? "STOCK_IN" : "MANUAL_ADJUSTMENT",
          quantityIn: isPositive ? validatedAdjustment : 0,
          quantityOut: isPositive ? 0 : Math.abs(validatedAdjustment),
          referenceType: "ADJUSTMENT",
          reason: "Manual adjustment from item edit screen",
          createdById: user.id,
          approvedById: user.id,
        },
      });
    }

    // Track price changes
    const priceTypes = [
      { key: "defaultSellingPrice", label: "SELLING" },
      { key: "minimumAllowedPrice", label: "MINIMUM" },
      { key: "mrp", label: "MRP" },
      { key: "purchasePrice", label: "PURCHASE" },
    ];

    for (const { key, label } of priceTypes) {
      if (
        itemData[key] !== undefined &&
        itemData[key] !== null &&
        Number(itemData[key]) !== Number(existing[key])
      ) {
        await tx.itemPriceHistory.create({
          data: {
            itemId: id,
            oldPrice: existing[key] || 0,
            newPrice: itemData[key],
            priceType: label,
            changedById: user.id,
          },
        });
      }
    }

    // Audit log inside the transaction — atomic with the item update
    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: item.shopId,
        action: AuditAction.UPDATED,
        entityType: EntityType.ITEM,
        entityId: id,
        oldValueJson: existing,
        newValueJson: item,
      },
    });

    const event = createDomainEvent({
      shopId: item.shopId,
      entity: "item",
      action: "updated",
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });
    await enqueueDomainEvent(tx, event);

    const updatedItem = await tx.item.findUnique({
      where: { id },
      include: {
        bundleComponents: {
          include: { componentItem: { select: { id: true, name: true, sku: true, unit: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return { item: updatedItem, event };
  });

  await bestEffortInvalidateForDomainEvent(result.event);
  return { ...result.item, bundleComponents: formatBundleComponents(result.item.bundleComponents) };
}

export async function deleteItem(user, id) {
  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Item not found");
  await assertShopAccess(user, existing.shopId);
  assertCanManageItems(user);
  if (existing.status === "INACTIVE") return existing;

  const activeReservations = await prisma.stockReservation.count({
    where: { itemId: id, shopId: existing.shopId, status: "ACTIVE" },
  });
  if (activeReservations > 0) {
    throw new ApiError(400, "Cannot delete product while stock is reserved for active orders");
  }
  const activeBundleUses = await prisma.itemBundleComponent.count({
    where: { componentItemId: id, parentItem: { status: "ACTIVE" } },
  });
  if (activeBundleUses > 0) {
    throw new ApiError(400, "Cannot delete product while it is used by an active bundle");
  }

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.item.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: existing.shopId,
        action: AuditAction.DELETED,
        entityType: EntityType.ITEM,
        entityId: id,
        oldValueJson: existing,
        newValueJson: item,
      },
    });

    const event = createDomainEvent({
      shopId: existing.shopId,
      entity: "item",
      action: "deleted",
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });
    await enqueueDomainEvent(tx, event);

    return { item, event };
  });

  await bestEffortInvalidateForDomainEvent(result.event);
  return result.item;
}

export async function uploadItemImage(user, data, file) {
  await assertShopAccess(user, data.shopId);
  assertCanManageItems(user);

  if (!file) throw new ApiError(400, "Image file is required");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
    throw new ApiError(400, "Only JPG, PNG, and WebP product photos are supported");
  }

  let categoryPath = "uncategorised";
  if (data.categoryId) {
    const category = await prisma.itemCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || category.shopId !== data.shopId) {
      throw new ApiError(400, "Category does not belong to this shop");
    }
    categoryPath = `${slugPart(category.name, "category")}-${category.id}`;
  }

  let itemPath = "new";
  if (data.itemId) {
    const item = await prisma.item.findUnique({ where: { id: data.itemId } });
    if (!item || item.shopId !== data.shopId) {
      throw new ApiError(400, "Item does not belong to this shop");
    }
    itemPath = `${slugPart(item.name, "item")}-${item.id}`;
  }

  const extension = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
  const key = [
    "shops",
    data.shopId,
    "categories",
    categoryPath,
    "items",
    itemPath,
    `${Date.now()}-${slugPart(file.originalname, "photo")}.${extension}`,
  ].join("/");

  return uploadToS3(file.buffer, key, file.mimetype);
}

// ---------------------------------------------------------------------------
// getItemStock
// ---------------------------------------------------------------------------

export async function getItemStock(user, id) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new ApiError(404, "Item not found");
  await assertShopAccess(user, item.shopId);

  const [stock, reservations] = await Promise.all([
    prisma.stockLedger.aggregate({
      where: { itemId: id, shopId: item.shopId },
      _sum: { quantityIn: true, quantityOut: true },
    }),
    prisma.stockReservation.aggregate({
      where: { itemId: id, shopId: item.shopId, status: "ACTIVE" },
      _sum: { reservedQty: true },
    }),
  ]);

  const quantityIn = Number(stock._sum.quantityIn || 0);
  const quantityOut = Number(stock._sum.quantityOut || 0);
  const physicalStock = quantityIn - quantityOut;
  const reservedStock = Number(reservations._sum.reservedQty || 0);
  const availableStock = Math.max(0, physicalStock - reservedStock);

  return {
    item,
    quantityIn,
    quantityOut,
    physicalStock,
    currentStock: physicalStock,   // consistent: currentStock === physicalStock
    currentQuantity: physicalStock,
    reservedStock,
    availableStock,
  };
}

// ---------------------------------------------------------------------------
// getPurchaseHistory
// ---------------------------------------------------------------------------

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
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // fixed: use .getTime()

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

// ---------------------------------------------------------------------------
// getPriceChangeHistory
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// getRateSuggestion
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Brand management — OWNER only
// ---------------------------------------------------------------------------

export async function createBrand(user, data) {
  await assertShopAccess(user, data.shopId);
  assertCanManageItems(user);

  const result = await prisma.$transaction(async (tx) => {
    const brand = await tx.itemBrand.create({
      data: { shopId: data.shopId, name: data.name },
    });
    const event = createDomainEvent({
      shopId: brand.shopId,
      entity: "brand",
      action: "created",
      entityId: brand.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });
    await enqueueDomainEvent(tx, event);
    return { brand, event };
  });

  await bestEffortInvalidateForDomainEvent(result.event);
  return result.brand;
}

export async function listBrands(user, { shopId }) {
  await assertShopAccess(user, shopId);
  return readThroughDomainCache({
    shopId,
    domain: "brands",
    query: {},
    loader: () => prisma.itemBrand.findMany({
      where: { shopId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  });
}

export async function updateBrand(user, id, { name }) {
  const existing = await prisma.itemBrand.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Brand not found");
  await assertShopAccess(user, existing.shopId);
  assertCanManageItems(user);

  const result = await prisma.$transaction(async (tx) => {
    const brand = await tx.itemBrand.update({ where: { id }, data: { name } });
    const event = createDomainEvent({
      shopId: existing.shopId,
      entity: "brand",
      action: "updated",
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });
    await enqueueDomainEvent(tx, event);
    return { brand, event };
  });

  await bestEffortInvalidateForDomainEvent(result.event);
  return result.brand;
}

export async function deleteBrand(user, id) {
  const existing = await prisma.itemBrand.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Brand not found");
  await assertShopAccess(user, existing.shopId);
  assertCanManageItems(user);

  const itemCount = await prisma.item.count({ where: { brandId: id, status: "ACTIVE" } });
  if (itemCount > 0) {
    throw new ApiError(400, "Cannot delete brand that contains active items");
  }

  const result = await prisma.$transaction(async (tx) => {
    const brand = await tx.itemBrand.update({ where: { id }, data: { status: "INACTIVE" } });
    const event = createDomainEvent({
      shopId: existing.shopId,
      entity: "brand",
      action: "deleted",
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });
    await enqueueDomainEvent(tx, event);
    return { brand, event };
  });

  await bestEffortInvalidateForDomainEvent(result.event);
  return result.brand;
}
