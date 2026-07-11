import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";

interface SaleCartSummaryProps {
  count: number;
  total: number;
  onPress: () => void;
}

export function SaleCartSummary({ count, total, onPress }: SaleCartSummaryProps) {
  if (count === 0) return null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Cart contains ${count} items, total ₹${total.toLocaleString("en-IN")}. Tap to review.`}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={styles.leftRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
        <Text style={styles.title}>Items Selected</Text>
      </View>
      <View style={styles.rightRow}>
        <Text style={styles.totalText}>₹{total.toLocaleString("en-IN")}</Text>
        <Icon source="chevron-right" size={20} color={colors.primary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginVertical: spacing.sm,
    minHeight: 48,
    ...shadow.sm,
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  totalText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.primaryDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
