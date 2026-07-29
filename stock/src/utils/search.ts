import { SEARCH_PATTERNS } from "./regex";

export type SearchScore = {
  matched: boolean;
  score: number; // 0.0 to 1.0
};

export function calculateMatchScore(
  text: string | null | undefined,
  query: string
): SearchScore {
  if (!text || !query) return { matched: false, score: 0 };
  const rawText = String(text).toLowerCase().trim();
  const rawQuery = String(query).toLowerCase().trim();
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

  // 5. Multi-token match (all query words present)
  const queryTokens = rawQuery.split(SEARCH_PATTERNS.TOKEN_SPLIT).filter(Boolean);
  if (queryTokens.length > 1) {
    let tokenMatches = 0;
    for (const token of queryTokens) {
      const cleanToken = token.replace(SEARCH_PATTERNS.SPACE_AND_SYMBOLS, "");
      if (rawText.includes(token) || (cleanToken.length > 0 && compactText.includes(cleanToken))) {
        tokenMatches++;
      }
    }
    if (tokenMatches === queryTokens.length) {
      return { matched: true, score: 0.75 };
    }
    if (tokenMatches > 0 && tokenMatches / queryTokens.length >= 0.5) {
      return { matched: true, score: 0.4 };
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

  return (
    smartMatchSearch(item.name, query) ||
    smartMatchSearch(item.sku, query) ||
    smartMatchSearch(categoryStr, query) ||
    smartMatchSearch(brandStr, query)
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

    const nameScore = calculateMatchScore(item.name, query).score;
    const skuScore = calculateMatchScore(item.sku, query).score;
    const catScore = calculateMatchScore(categoryStr, query).score * 0.7;
    const brandScore = calculateMatchScore(brandStr, query).score * 0.7;

    const maxScore = Math.max(nameScore, skuScore, catScore, brandScore);

    if (maxScore > 0) {
      scored.push({ item, score: maxScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
