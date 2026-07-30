import { SEARCH_PATTERNS } from "./regex";

export type SearchScore = {
  matched: boolean;
  score: number; // 0.0 to 1.0
};

function normalizeSearchText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function joinSearchFields(values: Array<string | null | undefined>) {
  return values.map(normalizeSearchText).filter(Boolean).join(" ");
}

export function calculateMatchScore(
  text: string | null | undefined,
  query: string
): SearchScore {
  if (!text || !query) return { matched: false, score: 0 };
  const rawText = normalizeSearchText(text);
  const rawQuery = normalizeSearchText(query);
  if (!rawQuery) return { matched: true, score: 1.0 };

  // 1. Exact match
  if (rawText === rawQuery) {
    return { matched: true, score: 1.0 };
  }

  // 2. Exact prefix match
  if (rawText.startsWith(rawQuery)) {
    return { matched: true, score: 0.9 };
  }

  // 3. Substring match
  if (rawText.includes(rawQuery)) {
    return { matched: true, score: 0.85 };
  }

  // 4. Compact space/symbol normalized match (GT 52 <-> GT52 <-> GT-52)
  const compactText = rawText.replace(SEARCH_PATTERNS.SPACE_AND_SYMBOLS, "");
  const compactQuery = rawQuery.replace(SEARCH_PATTERNS.SPACE_AND_SYMBOLS, "");

  if (compactQuery.length > 0) {
    if (compactText === compactQuery) {
      return { matched: true, score: 0.88 };
    }
    if (compactText.startsWith(compactQuery)) {
      return { matched: true, score: 0.82 };
    }
    if (compactText.includes(compactQuery)) {
      return { matched: true, score: 0.78 };
    }
  }

  // 5. Multi-token match. All meaningful words must be present; accepting half
  // the words made searches such as "A4 lamination pouch" return unrelated rows.
  const queryTokens = rawQuery.split(SEARCH_PATTERNS.TOKEN_SPLIT).filter(Boolean);
  if (queryTokens.length > 1) {
    const allTokensMatch = queryTokens.every((token) => {
      const cleanToken = token.replace(SEARCH_PATTERNS.SPACE_AND_SYMBOLS, "");
      return rawText.includes(token)
        || (cleanToken.length > 0 && compactText.includes(cleanToken));
    });
    if (allTokensMatch) {
      return { matched: true, score: 0.75 };
    }
  }

  return { matched: false, score: 0 };
}

export function smartMatchSearch(
  text: string | null | undefined,
  query: string
): boolean {
  return calculateMatchScore(text, query).matched;
}

export function smartItemSearch(
  item: {
    name?: string | null;
    sku?: string | null;
    categoryName?: string | null;
    brandName?: string | null;
    category?: { name?: string | null } | null;
    brand?: { name?: string | null } | null;
  },
  query: string
): boolean {
  if (!query || !query.trim()) return true;

  const categoryStr = item.categoryName || item.category?.name;
  const brandStr = item.brandName || item.brand?.name;
  const combined = joinSearchFields([item.name, item.sku, categoryStr, brandStr]);

  return (
    smartMatchSearch(item.name, query) ||
    smartMatchSearch(item.sku, query) ||
    smartMatchSearch(categoryStr, query) ||
    smartMatchSearch(brandStr, query) ||
    smartMatchSearch(combined, query)
  );
}

export function filterAndRankItems<T extends {
  name?: string | null;
  sku?: string | null;
  categoryName?: string | null;
  brandName?: string | null;
  category?: { name?: string | null } | null;
  brand?: { name?: string | null } | null;
}>(items: T[], query: string): T[] {
  if (!query || !query.trim()) return items;

  const scored: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const categoryStr = item.categoryName || item.category?.name;
    const brandStr = item.brandName || item.brand?.name;
    const combined = joinSearchFields([item.name, item.sku, categoryStr, brandStr]);

    const nameScore = calculateMatchScore(item.name, query).score;
    const skuScore = calculateMatchScore(item.sku, query).score;
    const catScore = calculateMatchScore(categoryStr, query).score * 0.7;
    const brandScore = calculateMatchScore(brandStr, query).score * 0.7;
    const combinedScore = calculateMatchScore(combined, query).score * 0.9;

    const maxScore = Math.max(nameScore, skuScore, catScore, brandScore, combinedScore);

    if (maxScore > 0) {
      scored.push({ item, score: maxScore });
    }
  }

  scored.sort((a, b) => {
    const scoreDifference = b.score - a.score;
    if (scoreDifference !== 0) return scoreDifference;
    return String(a.item.name ?? "").localeCompare(String(b.item.name ?? ""));
  });
  return scored.map((s) => s.item);
}

export function filterAndRankCustomers<T extends {
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  gstin?: string | null;
  contactPerson?: string | null;
}>(customers: T[], query: string): T[] {
  if (!query || !query.trim()) return customers;

  const scored = customers.flatMap((customer) => {
    const combined = joinSearchFields([
      customer.name,
      customer.phone,
      customer.contactPerson,
      customer.city,
      customer.gstin,
    ]);
    const score = Math.max(
      calculateMatchScore(customer.name, query).score,
      calculateMatchScore(customer.phone, query).score,
      calculateMatchScore(customer.contactPerson, query).score * 0.85,
      calculateMatchScore(customer.gstin, query).score * 0.8,
      calculateMatchScore(customer.city, query).score * 0.65,
      calculateMatchScore(combined, query).score * 0.9,
    );
    return score > 0 ? [{ customer, score }] : [];
  });

  scored.sort((a, b) => {
    const scoreDifference = b.score - a.score;
    if (scoreDifference !== 0) return scoreDifference;
    return String(a.customer.name ?? "").localeCompare(String(b.customer.name ?? ""));
  });
  return scored.map(({ customer }) => customer);
}
