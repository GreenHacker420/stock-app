import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";

import { Item } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { getAvatarColor, initialsOf } from "../../utils/items/display";
import { StockBadge } from "./StockBadge";
import { CachedThumbnail } from "../ui/CachedThumbnail";

type ItemSummaryCardProps = {
  item: Item;
  availableStock: number;
  minStock: number;
};

export function ItemSummaryCard({ item, availableStock, minStock }: ItemSummaryCardProps) {
  const avatarColor = getAvatarColor(item.name);
  const stockColor =
    availableStock <= 0 ? colors.danger : availableStock <= minStock ? colors.warning : colors.primary;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <CachedThumbnail
          uri={item.imageUrl}
          fallbackText=""
          fallbackIcon="package-variant-closed"
          color={colors.textSecondary}
          style={styles.avatar}
        />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.sku} numberOfLines={1}>
            {item.sku || "No SKU"}
          </Text>
        </View>
      </View>

      <View style={styles.stock}>
        <StockBadge stock={availableStock} min={minStock} />
        <Text style={[styles.stockNumber, { color: stockColor }]} numberOfLines={1}>
          {availableStock}
        </Text>
        <Text style={styles.stockUnit} numberOfLines={1}>
          {item.unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    minHeight: 112,
    ...shadow.sm,
  },
  left: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: fontSize.md,
    lineHeight: 20,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  sku: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  stock: {
    width: 88,
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  },
  stockNumber: {
    fontSize: fontSize.xxxl,
    lineHeight: 34,
    fontWeight: fontWeight.black,
    fontVariant: ["tabular-nums"],
  },
  stockUnit: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
});
