import { Text, TextStyle, StyleProp } from "react-native";
import { SEARCH_PATTERNS } from "../../utils/regex";

export interface HighlightedTextProps {
  text: string | null | undefined;
  query: string | null | undefined;
  style?: StyleProp<TextStyle>;
  highlightStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

function isSpaceOrSymbol(char: string): boolean {
  return Boolean(char.match(SEARCH_PATTERNS.SPACE_AND_SYMBOLS));
}

export function getMatchRanges(text: string, query: string): Array<[number, number]> {
  if (!text || !query) return [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  const rawRanges: Array<[number, number]> = [];

  // 1. Direct exact substring match
  const directIdx = lowerText.indexOf(lowerQuery);
  if (directIdx !== -1) {
    return [[directIdx, directIdx + lowerQuery.length]];
  }

  // 2. Compact space/symbol invariant match (e.g. "gt 52" matching "GT52" or "GT-52")
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

  // 3. Multi-token match for word-by-word highlighting (e.g. "hp gt 52")
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


export function HighlightedText({
  text,
  query,
  style,
  highlightStyle,
  numberOfLines,
}: HighlightedTextProps) {
  const content = text ?? "";
  const searchQuery = query?.trim();

  if (!content || !searchQuery) {
    return <Text style={style} numberOfLines={numberOfLines}>{content}</Text>;
  }

  const ranges = getMatchRanges(content, searchQuery);

  if (ranges.length === 0) {
    return <Text style={style} numberOfLines={numberOfLines}>{content}</Text>;
  }

  const elements: React.ReactNode[] = [];
  let lastIdx = 0;

  ranges.forEach(([start, end], idx) => {
    if (start > lastIdx) {
      elements.push(
        <Text key={`plain-${idx}`}>{content.slice(lastIdx, start)}</Text>
      );
    }
    elements.push(
      <Text
        key={`hl-${idx}`}
        style={[
          {
            fontWeight: "700",
            color: "#15803d",
            backgroundColor: "rgba(22, 163, 74, 0.15)",
            borderRadius: 3,
            paddingHorizontal: 2,
          },
          highlightStyle,
        ]}
      >
        {content.slice(start, end)}
      </Text>
    );
    lastIdx = end;
  });

  if (lastIdx < content.length) {
    elements.push(<Text key="plain-end">{content.slice(lastIdx)}</Text>);
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {elements}
    </Text>
  );
}
