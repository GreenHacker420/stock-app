import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Text } from "react-native-paper";

import { colors, fontSize, fontWeight, spacing } from "../../theme";

type InfoRowProps = {
  label: string;
  value?: string | number | null;
  tone?: "default" | "green" | "amber" | "red";
  style?: StyleProp<ViewStyle>;
};

const toneColors = {
  default: colors.textPrimary,
  green: colors.success,
  amber: colors.warning,
  red: colors.danger,
};

export function InfoRow({ label, value, tone = "default", style }: InfoRowProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
      <Text style={[styles.value, { color: toneColors[tone] }]} numberOfLines={2}>
        {value ?? "-"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  label: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  value: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textAlign: "right",
  },
});
