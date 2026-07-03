import { StyleSheet, View } from "react-native";

import { InfoRow } from "./InfoRow";
import { colors, spacing } from "../../theme";

type AmountRow = {
  label: string;
  value: string | number;
  tone?: "default" | "green" | "amber" | "red";
};

type AmountBreakdownProps = {
  rows: readonly AmountRow[];
};

export function AmountBreakdown({ rows }: AmountBreakdownProps) {
  return (
    <View style={styles.container}>
      {rows.map((row, index) => (
        <InfoRow
          key={`${row.label}-${index}`}
          label={row.label}
          value={row.value}
          tone={row.tone}
          style={index === rows.length - 1 ? styles.total : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  total: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
});
