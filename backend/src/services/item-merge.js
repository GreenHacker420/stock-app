export const MAX_ITEM_IMAGES = 5;

function splitImageUrls(imageUrl) {
  if (!imageUrl) return [];
  return String(imageUrl)
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export function mergeItemImageUrls(items, targetItemId, sourceItemIds) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = [
    itemsById.get(targetItemId),
    ...sourceItemIds.map((id) => itemsById.get(id)),
  ].filter(Boolean);

  const uniqueUrls = [];
  const seen = new Set();

  for (const item of orderedItems) {
    for (const url of splitImageUrls(item.imageUrl)) {
      if (seen.has(url)) continue;
      seen.add(url);
      uniqueUrls.push(url);
      if (uniqueUrls.length === MAX_ITEM_IMAGES) {
        return uniqueUrls.join(",");
      }
    }
  }

  return uniqueUrls.length > 0 ? uniqueUrls.join(",") : null;
}

function normalizedUnit(value) {
  return String(value || "").trim().toLowerCase();
}

export function getItemMergeCompatibilityIssue(items, targetItemId, sourceItemIds) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const target = itemsById.get(targetItemId);
  if (!target) return "The primary product was not found";

  const orderedItems = [
    target,
    ...sourceItemIds.map((id) => itemsById.get(id)),
  ];
  if (orderedItems.some((item) => !item)) {
    return "One or more duplicate products were not found";
  }
  if (orderedItems.some((item) => item.status !== "ACTIVE")) {
    return "Only active products can be merged";
  }
  if (orderedItems.some((item) => normalizedUnit(item.unit) !== normalizedUnit(target.unit))) {
    return "Products with different units cannot be merged";
  }
  if (orderedItems.some(
    (item) => Boolean(item.requiresSerialNumber) !== Boolean(target.requiresSerialNumber),
  )) {
    return "Products must use the same serial-number tracking setting";
  }
  return null;
}

export function buildMergedItemPatch(items, targetItemId, sourceItemIds) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const target = itemsById.get(targetItemId);
  const sources = sourceItemIds.map((id) => itemsById.get(id)).filter(Boolean);
  const firstPresent = (field) => {
    if (target?.[field] !== null && target?.[field] !== undefined) return target[field];
    return sources.find((item) => item[field] !== null && item[field] !== undefined)?.[field] ?? null;
  };

  return {
    sku: firstPresent("sku"),
    categoryId: firstPresent("categoryId"),
    brandId: firstPresent("brandId"),
    purchasePrice: firstPresent("purchasePrice"),
    mrp: firstPresent("mrp"),
    minimumAllowedPrice: firstPresent("minimumAllowedPrice"),
    imageUrl: mergeItemImageUrls(items, targetItemId, sourceItemIds),
  };
}
