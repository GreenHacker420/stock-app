import { StyleSheet, View, StyleProp, ViewStyle } from "react-native";
import { Text } from "react-native-paper";

import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

type SummaryPill = {
  label: string;
  value: string | number;
  tone?: "default" | "green" | "amber" | "red" | "blue";
};

type SummaryPillRowProps = {
  items: readonly SummaryPill[];
  style?: StyleProp<ViewStyle>;
};

const toneColors = {
  default: colors.textPrimary,
  green: colors.primary,
  amber: colors.warning,
  red: colors.danger,
  blue: colors.info,
};

export function SummaryPillRow({ items, style }: SummaryPillRowProps) {
  return (
    <View style={[styles.row, style]}>
      {items.map((item) => (
        <View key={item.label} style={styles.pill}>
          <Text style={[styles.value, { color: toneColors[item.tone ?? "default"] }]} numberOfLines={1} adjustsFontSizeToFit>
            {item.value}
          </Text>
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: 2,
    ...shadow.sm,
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    fontVariant: ["tabular-nums"],
  },
  label: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 0,
    textAlign: "center",
  },
});
