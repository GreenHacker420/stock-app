import { Pressable, StyleSheet, View } from "react-native";
import { Divider, Text } from "react-native-paper";

import { StatusPill } from "../../ui/StatusPill";
import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../../theme";

type OrderCardProps = {
  orderNumber: string;
  customerName?: string | null;
  status: string;
  statusTone?: "green" | "amber" | "red" | "blue" | "neutral";
  leftLabel: string;
  leftValue: string | number;
  rightLabel: string;
  rightValue: string | number;
  onPress?: () => void;
};

export function OrderCard({ orderNumber, customerName, status, statusTone = "blue", leftLabel, leftValue, rightLabel, rightValue, onPress }: OrderCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
    >
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.number} numberOfLines={1}>#{orderNumber}</Text>
          <Text style={styles.customer} numberOfLines={1}>{customerName || "No customer"}</Text>
        </View>
        <StatusPill label={status} tone={statusTone} />
      </View>
      <Divider style={styles.divider} />
      <View style={styles.footer}>
        <View style={styles.footerCol}>
          <Text style={styles.footerLabel}>{leftLabel}</Text>
          <Text style={styles.footerValue} numberOfLines={1}>{leftValue}</Text>
        </View>
        <View style={[styles.footerCol, styles.footerRight]}>
          <Text style={styles.footerLabel}>{rightLabel}</Text>
          <Text style={styles.footerValue} numberOfLines={1}>{rightValue}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  titleWrap: { flex: 1, minWidth: 0 },
  number: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.primary },
  customer: { fontSize: fontSize.md, fontWeight: fontWeight.black, color: colors.textPrimary, marginTop: 2 },
  divider: { marginVertical: spacing.md, backgroundColor: colors.surfaceOffset },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  footerCol: { flex: 1, minWidth: 0 },
  footerRight: { alignItems: "flex-end" },
  footerLabel: { fontSize: 8, fontWeight: fontWeight.black, color: colors.textMuted, letterSpacing: 0.5 },
  footerValue: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSecondary, marginTop: 2 },
});
