import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import { StatusPill } from "../../ui/StatusPill";
import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../../theme";

type DeliveryMemoCardProps = {
  number: string;
  date: string;
  customerName: string;
  status: string;
  statusTone?: "green" | "amber" | "red" | "blue" | "neutral";
  estimatedAmount: string;
  paidAmount: string;
  balanceAmount: string;
  balanceTone?: "default" | "red";
  itemCount: number;
  onPress?: () => void;
};

export function DeliveryMemoCard({
  number,
  date,
  customerName,
  status,
  statusTone,
  estimatedAmount,
  paidAmount,
  balanceAmount,
  balanceTone,
  itemCount,
  onPress,
}: DeliveryMemoCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Open delivery memo ${number}` : undefined}
    >
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.number} numberOfLines={1}>DM #{number}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
        <StatusPill label={status} tone={statusTone} />
      </View>
      <View style={styles.customerRow}>
        <Icon source="account-circle-outline" size={20} color={colors.textSecondary} />
        <Text style={styles.customerName} numberOfLines={1}>{customerName}</Text>
      </View>
      <View style={styles.amountGrid}>
        <Amount label="ESTIMATED" value={estimatedAmount} />
        <Amount label="PAID" value={paidAmount} tone="green" />
        <Amount label="BALANCE" value={balanceAmount} tone={balanceTone === "red" ? "red" : undefined} alignRight />
      </View>
      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          <Icon source="package-variant-closed" size={14} color={colors.textMuted} />
          <Text style={styles.footerText}>{itemCount} items listed</Text>
        </View>
        <View style={styles.footerInfo}>
          <Text style={styles.viewLink}>View details</Text>
          <Icon source="chevron-right" size={16} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

function Amount({ label, value, tone, alignRight }: { label: string; value: string; tone?: "green" | "red"; alignRight?: boolean }) {
  return (
    <View style={[styles.amountCol, alignRight && styles.alignRight]}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={[styles.amountValue, tone === "green" && styles.green, tone === "red" && styles.red]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  pressed: { opacity: 0.72 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  titleWrap: { flex: 1, minWidth: 0 },
  number: { fontSize: fontSize.md, fontWeight: fontWeight.black, color: colors.textPrimary },
  date: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.semibold },
  customerRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.surfaceOffset, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  customerName: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  amountGrid: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  amountCol: { flex: 1, minWidth: 0, gap: 4 },
  alignRight: { alignItems: "flex-end" },
  amountLabel: { fontSize: 9, fontWeight: fontWeight.extrabold, color: colors.textMuted },
  amountValue: { fontSize: fontSize.sm, fontWeight: fontWeight.black, color: colors.textPrimary },
  green: { color: colors.success },
  red: { color: colors.danger },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  footerInfo: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minWidth: 0 },
  footerText: { color: colors.textSecondary, fontSize: fontSize.xs },
  viewLink: { color: colors.primary, fontSize: fontSize.xs, fontWeight: fontWeight.bold },
});
