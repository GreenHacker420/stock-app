import { SEARCH_PATTERNS } from "./regex.ts";

function isSpaceOrSymbol(char: string): boolean {
  return Boolean(char.match(SEARCH_PATTERNS.SPACE_AND_SYMBOLS));
}

export function getMatchRanges(text: string, query: string): Array<[number, number]> {
  if (!text || !query) return [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  const rawRanges: Array<[number, number]> = [];

  // 1. Dimension-aware matching (e.g. query "70x100" matching "70*100", "70 x 100", etc.)
  const dimRegex = /(\d+)\s*[*xX×]\s*(\d+)/g;
  let dimMatch: RegExpExecArray | null;
  while ((dimMatch = dimRegex.exec(lowerQuery)) !== null) {
    const d1 = dimMatch[1];
    const d2 = dimMatch[2];
    const targetDimRegex = new RegExp(`\\b${d1}\\s*[*xX×]\\s*${d2}\\b`, "gi");
    let targetMatch: RegExpExecArray | null;
    while ((targetMatch = targetDimRegex.exec(text)) !== null) {
      rawRanges.push([targetMatch.index, targetMatch.index + targetMatch[0].length]);
    }
  }

  // Also check space-separated numbers in query (e.g. "70 100" matching "70*100" or "70x100")
  const spaceDimRegex = /\b(\d+)\s+(\d+)\b/g;
  let spaceMatch: RegExpExecArray | null;
  while ((spaceMatch = spaceDimRegex.exec(lowerQuery)) !== null) {
    const d1 = spaceMatch[1];
    const d2 = spaceMatch[2];
    const targetDimRegex = new RegExp(`\\b${d1}\\s*[*xX×]\\s*${d2}\\b`, "gi");
    let targetMatch: RegExpExecArray | null;
    while ((targetMatch = targetDimRegex.exec(text)) !== null) {
      rawRanges.push([targetMatch.index, targetMatch.index + targetMatch[0].length]);
    }
  }

  // 2. Direct exact substring match
  const directIdx = lowerText.indexOf(lowerQuery);
  if (directIdx !== -1) {
    rawRanges.push([directIdx, directIdx + lowerQuery.length]);
  }

  // 3. Compact space/symbol invariant match (e.g. "gt 52" matching "GT52" or "GT-52")
  const compactQuery = lowerQuery.replace(SEARCH_PATTERNS.SPACE_AND_SYMBOLS, "");
  if (compactQuery.length > 0) {
    for (let i = 0; i < text.length; i++) {
      let compactSub = "";
      let j = i;
      while (j < text.length && compactSub.length < compactQuery.length) {
        const char = lowerText[j];
        if (!isSpaceOrSymbol(char)) {
          compactSub += char;
        }
        j++;
      }
      if (compactSub === compactQuery) {
        rawRanges.push([i, j]);
        break;
      }
    }
  }

  // 4. Multi-token match for word-by-word highlighting (e.g. "hp gt 52")
  if (rawRanges.length === 0) {
    const tokens = lowerQuery.split(SEARCH_PATTERNS.TOKEN_SPLIT).filter(Boolean);
    for (const token of tokens) {
      const cleanToken = token.replace(SEARCH_PATTERNS.SPACE_AND_SYMBOLS, "");
      if (cleanToken.length === 0) continue;

      const tIdx = lowerText.indexOf(token);
      if (tIdx !== -1) {
        rawRanges.push([tIdx, tIdx + token.length]);
      } else {
        // Compact search for this token
        for (let i = 0; i < text.length; i++) {
          let compactSub = "";
          let j = i;
          while (j < text.length && compactSub.length < cleanToken.length) {
            const char = lowerText[j];
            if (!isSpaceOrSymbol(char)) {
              compactSub += char;
            }
            j++;
          }
          if (compactSub === cleanToken) {
            rawRanges.push([i, j]);
            break;
          }
        }
      }
    }
  }

  if (rawRanges.length === 0) return [];

  // Merge overlapping or adjacent ranges
  rawRanges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [rawRanges[0]];

  for (let i = 1; i < rawRanges.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = rawRanges[i];
    if (curr[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }

  return merged;
}
