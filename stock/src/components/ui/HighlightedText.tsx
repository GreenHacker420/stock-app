import { Text, TextStyle, StyleProp } from "react-native";
import { SEARCH_PATTERNS } from "../../utils/regex";

export interface HighlightedTextProps {
  text: string | null | undefined;
  query: string | null | undefined;
  style?: StyleProp<TextStyle>;
  highlightStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

import { getMatchRanges } from "../../utils/highlight";

export { getMatchRanges };


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
