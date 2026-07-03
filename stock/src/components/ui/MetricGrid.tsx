import { StyleSheet, View } from "react-native";

import { MetricCard } from "./MetricCard";
import { spacing } from "../../theme";

type MetricGridItem = {
  label: string;
  value: string | number;
  icon?: string;
  tone?: "green" | "blue" | "amber" | "red";
  helper?: string;
};

type MetricGridProps = {
  items: readonly MetricGridItem[];
};

export function MetricGrid({ items }: MetricGridProps) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <MetricCard key={item.label} {...item} value={String(item.value)} icon={item.icon ?? "chart-box-outline"} style={styles.card} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  card: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 0,
  },
});
