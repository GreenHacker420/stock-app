import { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Divider, Text } from "react-native-paper";

import { StatusPill } from "../../ui/StatusPill";
import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../../theme";

type SaleCardProps = {
  saleNumber?: string;
  customerName?: string;
  subtitle?: string;
  amount?: string;
  paymentStatus?: string;
  saleType?: string;
  date?: string;
  statusTone?: "green" | "amber" | "red" | "blue" | "neutral";
  onPress?: () => void;
  actions?: ReactNode;
};

export function SaleCard({
  saleNumber,
  customerName,
  subtitle,
  amount,
  paymentStatus,
  saleType,
  date,
  statusTone,
  onPress,
  actions,
}: SaleCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Open sale ${saleNumber ?? ""}` : undefined}
    >
      <View style={styles.header}>
        <View style={styles.main}>
          {saleNumber ? <Text style={styles.number} numberOfLines={1}>#{saleNumber}</Text> : null}
          <Text style={styles.customer} numberOfLines={1}>{customerName || "Walk-in Customer"}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {paymentStatus ? <StatusPill label={paymentStatus} tone={statusTone} /> : null}
      </View>
      <Divider style={styles.divider} />
      <View style={styles.footer}>
        <View style={styles.footerCol}>
          <Text style={styles.footerLabel}>{saleType ?? "TOTAL AMOUNT"}</Text>
          {amount ? <Text style={styles.footerValue} numberOfLines={1}>{amount}</Text> : null}
        </View>
        <View style={[styles.footerCol, styles.footerRight]}>
          <Text style={styles.footerLabel}>DATE & TIME</Text>
          {date ? <Text style={styles.footerValue} numberOfLines={1}>{date}</Text> : null}
        </View>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
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
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  main: { flex: 1, minWidth: 0 },
  number: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.primary },
  customer: { fontSize: fontSize.md, fontWeight: fontWeight.black, color: colors.textPrimary, marginTop: 2 },
  subtitle: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  divider: { marginVertical: spacing.md, backgroundColor: colors.surfaceOffset },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  footerCol: { flex: 1, minWidth: 0 },
  footerRight: { alignItems: "flex-end" },
  footerLabel: { fontSize: 8, fontWeight: fontWeight.black, color: colors.textMuted, letterSpacing: 0.5 },
  footerValue: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSecondary, marginTop: 2 },
  actions: { marginTop: spacing.md },
});
