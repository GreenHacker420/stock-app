import { memo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";

import { Item } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { getAvatarColor, initialsOf, money } from "../../utils/items/display";
import { StockBadge } from "./StockBadge";
import { CachedThumbnail } from "../ui/CachedThumbnail";

export const ItemCard = memo(({
  item,
  stock,
  canEdit,
  canManageStock,
  onPress,
  onEdit,
  onManageStock,
}: {
  item: Item;
  stock: number;
  canEdit: boolean;
  canManageStock: boolean;
  onPress: () => void;
  onEdit: () => void;
  onManageStock: () => void;
}) => {
  const avatarColor = getAvatarColor(item.name);
  const minStock = Number(item.minimumStock ?? 0);
  const initials = initialsOf(item.name);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.itemCard, pressed && styles.itemCardPressed]}
    >
      {/* Avatar */}
      <CachedThumbnail
        uri={item.imageUrl}
        fallbackText={initials}
        color={avatarColor}
        style={styles.itemAvatar}
      />

      {/* Info */}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.itemMeta}>
          {item.category && (
            <Text style={styles.itemCategory}>{item.category.name}</Text>
          )}
          {item.sku && (
            <Text style={styles.itemSku}>{item.sku}</Text>
          )}
        </View>
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemPrice}>{money(item.defaultSellingPrice)}</Text>
          <Text style={styles.itemUnit}>/ {item.unit}</Text>
          {!!item.mrp && Number(item.mrp) > Number(item.defaultSellingPrice ?? 0) ? (
            <Text style={styles.itemMrp}>{money(item.mrp)}</Text>
          ) : null}
        </View>
      </View>

      {/* Right: stock info */}
      <View style={styles.itemRight}>
        <StockBadge stock={stock} min={minStock} />
        <Text style={[
          styles.itemStockQty,
          stock <= 0 ? { color: colors.danger } :
          stock <= minStock ? { color: colors.warning } :
          { color: colors.primary }
        ]}>
          {stock}
          <Text style={styles.itemStockUnit}> {item.unit}</Text>
        </Text>
        {(canEdit || canManageStock) && (
          <View style={styles.itemActions}>
            {canEdit && (
              <Pressable
                onPress={onEdit}
                style={({ pressed }) => [styles.itemActionBtn, pressed && { opacity: 0.6 }]}
              >
                <Icon source="pencil-outline" size={14} color={colors.textSecondary} />
              </Pressable>
            )}
            {canManageStock && (
              <Pressable
                onPress={onManageStock}
                style={({ pressed }) => [styles.itemActionBtn, styles.itemActionBtnPrimary, pressed && { opacity: 0.6 }]}
              >
                <Icon source="plus" size={14} color={colors.primary} />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadow.sm,
  },
  itemCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  itemAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    flexShrink: 0,
  },
  itemInfo: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  itemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemMeta: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  itemCategory: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  itemSku: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  itemPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  itemUnit: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  itemMrp: {
    fontSize: 10,
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  itemRight: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  itemStockQty: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
  },
  itemStockUnit: {
    fontSize: 10,
    fontWeight: fontWeight.regular,
    color: colors.textSecondary,
  },
  itemActions: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: 2,
  },
  itemActionBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
  },
  itemActionBtnPrimary: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary + "40",
  },
});
