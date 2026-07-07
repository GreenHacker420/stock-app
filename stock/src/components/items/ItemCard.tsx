import { memo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon, TextInput } from "react-native-paper";

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
  onLongPress,
  onEdit,
  onManageStock,
  isEditing = null,
  draft,
  onSaveInline,
  onCancelInline,
}: {
  item: Item;
  stock: number;
  canEdit: boolean;
  canManageStock: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onEdit: () => void;
  onManageStock: () => void;
  isEditing?: "PRICES" | "STOCK" | null;
  draft?: { mrp?: string; defaultSellingPrice?: string; stockAdjustment?: string };
  onSaveInline?: (mrp: string, sellingPrice: string, stock: string) => void;
  onCancelInline?: () => void;
}) => {
  const avatarColor = getAvatarColor(item.name);
  const minStock = Number(item.minimumStock ?? 0);
  const initials = initialsOf(item.name);

  const [draftMrp, setDraftMrp] = useState(draft?.mrp ?? item.mrp?.toString() ?? "");
  const [draftSelling, setDraftSelling] = useState(draft?.defaultSellingPrice ?? item.defaultSellingPrice?.toString() ?? "");
  const [draftStock, setDraftStock] = useState(draft?.stockAdjustment ?? "0");

  const hasDraft = !!draft;
  const currentMrp = hasDraft && draft.mrp !== undefined ? draft.mrp : item.mrp;
  const currentSelling = hasDraft && draft.defaultSellingPrice !== undefined ? draft.defaultSellingPrice : item.defaultSellingPrice;
  const currentStock = hasDraft && draft.stockAdjustment !== undefined 
    ? stock + Number(draft.stockAdjustment) 
    : stock;

  if (isEditing === "PRICES") {
    return (
      <View style={styles.itemCardEditing}>
        <Text style={styles.editTitle} numberOfLines={1}>Edit Prices: {item.name}</Text>
        
        <View style={styles.editRow}>
          <View style={{ flex: 1 }}>
            <TextInput
              mode="outlined"
              label="MRP (₹)"
              value={draftMrp}
              onChangeText={setDraftMrp}
              keyboardType="numeric"
              style={styles.editInput}
              outlineStyle={styles.outline}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput
              mode="outlined"
              label="Selling Price (₹)"
              value={draftSelling}
              onChangeText={setDraftSelling}
              keyboardType="numeric"
              style={styles.editInput}
              outlineStyle={styles.outline}
            />
          </View>
        </View>

        <View style={styles.editActions}>
          <Pressable
            onPress={onCancelInline}
            style={({ pressed }) => [styles.btnCancel, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.btnCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onSaveInline?.(draftMrp, draftSelling, draftStock)}
            style={({ pressed }) => [styles.btnSave, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.btnSaveText}>Keep Update</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isEditing === "STOCK") {
    return (
      <View style={styles.itemCardEditing}>
        <Text style={styles.editTitle} numberOfLines={1}>Add Stock: {item.name}</Text>
        
        <View style={styles.editRow}>
          <View style={{ flex: 1 }}>
            <TextInput
              mode="outlined"
              label="Add Stock Qty"
              value={draftStock === "0" ? "" : draftStock}
              onChangeText={setDraftStock}
              keyboardType="numeric"
              placeholder="e.g. +10 or -5"
              autoFocus
              style={styles.editInput}
              outlineStyle={styles.outline}
            />
          </View>
        </View>

        <View style={styles.editActions}>
          <Pressable
            onPress={onCancelInline}
            style={({ pressed }) => [styles.btnCancel, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.btnCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onSaveInline?.(draftMrp, draftSelling, draftStock)}
            style={({ pressed }) => [styles.btnSave, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.btnSaveText}>Keep Update</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.itemCard,
        hasDraft && styles.itemCardActiveDraft,
        pressed && styles.itemCardPressed
      ]}
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
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{item.category.name}</Text>
            </View>
          )}
          {item.brand && (
            <View style={[styles.categoryBadge, styles.brandBadge]}>
              <Text style={styles.brandText}>{item.brand.name}</Text>
            </View>
          )}
          {item.sku && (
            <Text style={styles.itemSku}>{item.sku}</Text>
          )}
          {hasDraft && (
            <View style={styles.draftBadge}>
              <Icon source="clock-outline" size={10} color="#1d4ed8" />
              <Text style={styles.draftBadgeText}>Pending Save</Text>
            </View>
          )}
        </View>
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemPrice}>{money(currentSelling)}</Text>
          <Text style={styles.itemUnit}>/ {item.unit}</Text>
          {!!currentMrp && Number(currentMrp) > Number(currentSelling ?? 0) ? (
            <Text style={styles.itemMrp}>{money(currentMrp)}</Text>
          ) : null}
        </View>
      </View>

      {/* Right: stock info */}
      <View style={styles.itemRight}>
        <StockBadge stock={currentStock} min={minStock} />
        <Text style={[
          styles.itemStockQty,
          currentStock <= 0 ? { color: colors.danger } :
          currentStock <= minStock ? { color: colors.warning } :
          { color: colors.primary }
        ]}>
          {currentStock}
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
  itemCardActiveDraft: {
    borderColor: "#3b82f6",
    borderWidth: 1.5,
    borderLeftWidth: 5,
    backgroundColor: colors.surface,
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
    alignItems: "center",
  },
  categoryBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  categoryText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    lineHeight: 12,
  },
  brandBadge: {
    backgroundColor: colors.infoLight,
  },
  brandText: {
    fontSize: 10,
    color: colors.info,
    fontWeight: fontWeight.semibold,
    lineHeight: 12,
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
  itemCardEditing: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadow.sm,
  },
  editTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  editRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  editInput: {
    height: 48,
    backgroundColor: colors.surface,
    fontSize: fontSize.sm,
  },
  outline: {
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  btnCancel: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#f3f4f6",
  },
  btnCancelText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  btnSave: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  btnSaveText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  draftBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dbeafe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    gap: 2,
    alignSelf: "flex-start",
  },
  draftBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: "#1d4ed8",
  },
});
