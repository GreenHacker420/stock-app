import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { generateEmbedding } from "../utils/embeddings.js";
import { Prisma } from "../generated/prisma/index.js";

/**
 * Semantic + lexical hybrid duplicate finder for product names/SKUs.
 *
 * Strategy:
 *  1. Generate a 384-dim embedding for the query name (all-MiniLM-L6-v2).
 *  2. Run a single SQL query combining:
 *     a. Cosine distance < 0.20  → semantic duplicate
 *     b. Exact name match (case-insensitive)
 *     c. Exact SKU match
 *  3. Category guard: restrict semantic matches to same category when categoryId provided.
 *  4. Exclude the item being edited (excludeItemId).
 *  5. Return up to `limit` candidates ordered by relevance score.
 */
export async function findDuplicates(user, { shopId, name, sku, categoryId, excludeItemId, limit = 5 }) {
  await assertShopAccess(user, shopId);

  const normalizedName = (name || "").trim();
  const normalizedSku  = (sku  || "").trim();

  if (!normalizedName && !normalizedSku) return [];

  // Generate embedding for semantic search
  let embedding = null;
  if (normalizedName.length >= 3) {
    try {
      embedding = await generateEmbedding(normalizedName);
    } catch {
      embedding = null;
    }
  }

  const catId = categoryId || null;

  let rows;

  if (embedding) {
    const vectorString = `[${embedding.join(",")}]`;

    rows = await prisma.$queryRaw`
      SELECT
        i.id,
        i."shopId",
        i.name,
        i.sku,
        i."categoryId",
        i."brandId",
        i.unit,
        i."defaultSellingPrice",
        i."minimumAllowedPrice",
        i."purchasePrice",
        i.mrp,
        i."minimumStock",
        i."imageUrl",
        i.status,
        i."requiresSerialNumber",
        c.id   AS "category_id",
        c.name AS "category_name",
        b.id   AS "brand_id",
        b.name AS "brand_name",
        COALESCE(i.embedding <=> ${vectorString}::vector, 1.0) AS semantic_distance,
        CASE WHEN ${normalizedName} <> '' AND LOWER(i.name) = LOWER(${normalizedName}) THEN 0 ELSE 1 END AS name_exact,
        CASE WHEN ${normalizedSku}  <> '' AND LOWER(COALESCE(i.sku,'')) = LOWER(${normalizedSku})  THEN 0 ELSE 1 END AS sku_exact
      FROM "Item" i
      LEFT JOIN "ItemCategory" c ON i."categoryId" = c.id
      LEFT JOIN "ItemBrand"    b ON i."brandId"    = b.id
      WHERE
        i."shopId" = ${shopId}
        AND i.status = 'ACTIVE'
        ${excludeItemId ? Prisma.sql`AND i.id != ${excludeItemId}` : Prisma.empty}
        AND (
          (${normalizedSku} <> '' AND LOWER(COALESCE(i.sku,'')) = LOWER(${normalizedSku}))
          OR (${normalizedName} <> '' AND LOWER(i.name) = LOWER(${normalizedName}))
          OR (
            COALESCE(i.embedding <=> ${vectorString}::vector, 1.0) < 0.35
            AND (
              ${catId}::text IS NULL
              OR i."categoryId" IS NULL
              OR i."categoryId" = ${catId}
            )
          )
        )
      ORDER BY
        LEAST(
          CASE WHEN ${normalizedSku} <> '' AND LOWER(COALESCE(i.sku,'')) = LOWER(${normalizedSku}) THEN 0.0 ELSE 1.0 END,
          CASE WHEN ${normalizedName} <> '' AND LOWER(i.name) = LOWER(${normalizedName}) THEN 0.0 ELSE 1.0 END,
          COALESCE(i.embedding <=> ${vectorString}::vector, 1.0)
        ) ASC
      LIMIT ${limit}
    `;
  } else {
    // Lexical-only fallback when name is too short or embedding generation failed
    rows = await prisma.$queryRaw`
      SELECT
        i.id,
        i."shopId",
        i.name,
        i.sku,
        i."categoryId",
        i."brandId",
        i.unit,
        i."defaultSellingPrice",
        i."minimumAllowedPrice",
        i."purchasePrice",
        i.mrp,
        i."minimumStock",
        i."imageUrl",
        i.status,
        i."requiresSerialNumber",
        c.id   AS "category_id",
        c.name AS "category_name",
        b.id   AS "brand_id",
        b.name AS "brand_name",
        1.0 AS semantic_distance,
        CASE WHEN ${normalizedName} <> '' AND LOWER(i.name) = LOWER(${normalizedName}) THEN 0 ELSE 1 END AS name_exact,
        CASE WHEN ${normalizedSku}  <> '' AND LOWER(COALESCE(i.sku,'')) = LOWER(${normalizedSku}) THEN 0 ELSE 1 END AS sku_exact
      FROM "Item" i
      LEFT JOIN "ItemCategory" c ON i."categoryId" = c.id
      LEFT JOIN "ItemBrand"    b ON i."brandId"    = b.id
      WHERE
        i."shopId" = ${shopId}
        AND i.status = 'ACTIVE'
        ${excludeItemId ? Prisma.sql`AND i.id != ${excludeItemId}` : Prisma.empty}
        AND (
          (${normalizedSku} <> '' AND LOWER(COALESCE(i.sku,'')) = LOWER(${normalizedSku}))
          OR (${normalizedName} <> '' AND LOWER(i.name) = LOWER(${normalizedName}))
        )
      ORDER BY name_exact ASC, sku_exact ASC
      LIMIT ${limit}
    `;
  }

  return rows.map((row) => {
    const dist = Number(row.semantic_distance);
    let reason;
    if (Number(row.sku_exact) === 0) {
      reason = "sku";
    } else if (Number(row.name_exact) === 0) {
      reason = "name";
    } else if (dist < 0.20) {
      reason = "similar_name";
    } else {
      reason = "possible_match";
    }

    return {
      reason,
      score: parseFloat((1 - dist).toFixed(4)),
      item: {
        id:                  row.id,
        shopId:              row.shopId,
        name:                row.name,
        sku:                 row.sku,
        categoryId:          row.categoryId,
        brandId:             row.brandId,
        unit:                row.unit,
        defaultSellingPrice: row.defaultSellingPrice,
        minimumAllowedPrice: row.minimumAllowedPrice,
        purchasePrice:       row.purchasePrice,
        mrp:                 row.mrp,
        minimumStock:        row.minimumStock,
        imageUrl:            row.imageUrl,
        status:              row.status,
        requiresSerialNumber: row.requiresSerialNumber,
        category: row.category_id ? { id: row.category_id, name: row.category_name } : null,
        brand:    row.brand_id    ? { id: row.brand_id,    name: row.brand_name    } : null,
      },
    };
  });
}
