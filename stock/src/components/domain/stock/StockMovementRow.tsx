import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, spacing } from "../../../theme";

type StockMovementRowProps = {
  title: string;
  date?: string;
  subtitle?: string;
  quantity: string | number;
  tone?: "green" | "red" | "neutral";
  icon?: string;
  onPress?: () => void;
};

export function StockMovementRow({
  title,
  date,
  subtitle,
  quantity,
  tone = "neutral",
  icon = "swap-horizontal",
  onPress,
}: StockMovementRowProps) {
  const toneColor = tone === "green" ? colors.success : tone === "red" ? colors.danger : colors.textSecondary;
  const toneBackground = tone === "green" ? colors.successLight : tone === "red" ? colors.dangerLight : colors.surfaceOffset;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `${title}, ${quantity}. Open movement details` : undefined}
    >
      <View style={[styles.iconTile, { backgroundColor: toneBackground }]}>
        <Icon source={icon} size={20} color={toneColor} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        {date ? <Text style={styles.date}>{date}</Text> : null}
      </View>
      <View style={styles.trailing}>
        <View style={[styles.quantityPill, { backgroundColor: toneBackground }]}>
          <Text style={[styles.qty, { color: toneColor }]} numberOfLines={1}>{quantity}</Text>
        </View>
        {onPress ? <Icon source="chevron-right" size={18} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceOffset },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 3 },
  date: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  trailing: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  quantityPill: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full },
  qty: { fontSize: fontSize.sm, fontWeight: fontWeight.black },
});
