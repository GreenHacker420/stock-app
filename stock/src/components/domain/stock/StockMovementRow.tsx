import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, spacing } from "../../../theme";

type StockMovementRowProps = {
  title: string;
  date?: string;
  quantity: string | number;
  tone?: "green" | "red" | "neutral";
};

export function StockMovementRow({ title, date, quantity, tone = "neutral" }: StockMovementRowProps) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, tone === "green" && styles.greenDot, tone === "red" && styles.redDot]} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {date ? <Text style={styles.date}>{date}</Text> : null}
      </View>
      <Text style={[styles.qty, tone === "green" && styles.green, tone === "red" && styles.red]} numberOfLines={1}>{quantity}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.textMuted },
  greenDot: { backgroundColor: colors.success },
  redDot: { backgroundColor: colors.danger },
  body: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  date: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  qty: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.black },
  green: { color: colors.success },
  red: { color: colors.danger },
});
