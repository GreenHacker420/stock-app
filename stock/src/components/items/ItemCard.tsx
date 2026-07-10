import { memo, useState, useEffect, useRef, useMemo } from "react";
import { View, StyleSheet, Pressable, Alert } from "react-native";
import { Text, Icon, TextInput } from "react-native-paper";

import { Item } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { money } from "../../utils/items/display";
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
  onSavePrices,
  onSaveStock,
  onCancelInline,
  onPressImage,
  isSelected = false,
  isSelectMode = false,
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
  onSavePrices?: (draft: { mrp: string; defaultSellingPrice: string }) => void;
  onSaveStock?: (draft: { adjustment: string }) => void;
  onCancelInline?: () => void;
  onPressImage?: (uri: string) => void;
  isSelected?: boolean;
  isSelectMode?: boolean;
}) => {
  const minStock = Number(item.minimumStock ?? 0);

  const [draftMrp, setDraftMrp] = useState("");
  const [draftSelling, setDraftSelling] = useState("");
  const [draftStock, setDraftStock] = useState("");
  const [stockDirection, setStockDirection] = useState<"IN" | "OUT">("IN");

  const firstImageUrl = useMemo(() => {
    if (!item.imageUrl) return null;
    return item.imageUrl.split(",")[0];
  }, [item.imageUrl]);
  const hydratedEditorKey = useRef<string | null>(null);

  // Hydrate draft fields once when an editor opens; do not overwrite active typing on refetch.
  useEffect(() => {
    if (!isEditing) {
      hydratedEditorKey.current = null;
      setDraftMrp("");
      setDraftSelling("");
      setDraftStock("");
      setStockDirection("IN");
      return;
    }
    const editorKey = `${item.id}:${isEditing}`;
    if (hydratedEditorKey.current === editorKey) return;
    hydratedEditorKey.current = editorKey;

    if (isEditing === "PRICES") {
      setDraftMrp(draft?.mrp ?? item.mrp?.toString() ?? "");
      setDraftSelling(draft?.defaultSellingPrice ?? item.defaultSellingPrice?.toString() ?? "");
    } else if (isEditing === "STOCK") {
      const adj = draft?.stockAdjustment ?? "";
      if (adj.startsWith("-")) {
        setStockDirection("OUT");
        setDraftStock(adj.slice(1));
      } else {
        setStockDirection("IN");
        setDraftStock(adj);
      }
    }
  }, [isEditing, draft, item.id, item.mrp, item.defaultSellingPrice]);

  const hasDraft = !!draft;
  const currentMrp = hasDraft && draft.mrp !== undefined ? draft.mrp : item.mrp;
  const currentSelling = hasDraft && draft.defaultSellingPrice !== undefined ? draft.defaultSellingPrice : item.defaultSellingPrice;
  const currentStock = hasDraft && draft.stockAdjustment !== undefined 
    ? stock + Number(draft.stockAdjustment) 
    : stock;

  const handleSavePrices = () => {
    onSavePrices?.({
      mrp: draftMrp,
      defaultSellingPrice: draftSelling,
    });
  };

  const handleSaveStock = () => {
    const qty = draftStock.trim();
    if (!qty || qty === "0") {
      onSaveStock?.({ adjustment: "" });
      return;
    }
    const val = Number(qty);
    if (isNaN(val) || val <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a positive number");
      return;
    }
    const signedValue = stockDirection === "OUT" ? `-${qty}` : qty;
    onSaveStock?.({ adjustment: signedValue });
  };

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
            onPress={handleSavePrices}
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
        <Text style={styles.editTitle} numberOfLines={1}>Adjust Stock: {item.name}</Text>
        
        <View style={styles.directionRow}>
          <Pressable
            onPress={() => setStockDirection("IN")}
            style={[styles.directionBtn, stockDirection === "IN" && styles.directionBtnActive]}
          >
            <Text style={[styles.directionText, stockDirection === "IN" && styles.directionTextActive]}>Stock In (+)</Text>
          </Pressable>
          <Pressable
            onPress={() => setStockDirection("OUT")}
            style={[styles.directionBtn, stockDirection === "OUT" && styles.directionBtnActive, stockDirection === "OUT" && styles.directionBtnActiveOut]}
          >
            <Text style={[styles.directionText, stockDirection === "OUT" && styles.directionTextActive]}>Stock Out (-)</Text>
          </Pressable>
        </View>

        <View style={styles.editRow}>
          <View style={{ flex: 1 }}>
            <TextInput
              mode="outlined"
              label="Quantity"
              value={draftStock}
              onChangeText={setDraftStock}
              keyboardType="numeric"
              placeholder="e.g. 10"
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
            onPress={handleSaveStock}
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
        isSelected && styles.itemCardSelected,
        pressed && styles.itemCardPressed
      ]}
    >
      {/* Selector Checkbox (only in Select Mode) */}
      {isSelectMode && (
        <View style={styles.selectorContainer}>
          <Icon
            source={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
            size={22}
            color={isSelected ? colors.primary : colors.textMuted}
          />
        </View>
      )}

      {/* Avatar */}
      {firstImageUrl ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onPressImage && onPressImage(firstImageUrl);
          }}
          style={({ pressed }) => [pressed && { opacity: 0.8 }]}
        >
          <CachedThumbnail
            uri={firstImageUrl}
            fallbackText=""
            fallbackIcon="package-variant-closed"
            color={colors.textSecondary}
            style={styles.itemAvatar}
          />
        </Pressable>
      ) : (
        <CachedThumbnail
          uri={null}
          fallbackText=""
          fallbackIcon="package-variant-closed"
          color={colors.textSecondary}
          style={styles.itemAvatar}
        />
      )}

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
                onPress={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                accessibilityRole="button"
                accessibilityLabel="Edit product prices"
                hitSlop={6}
                style={({ pressed }) => [styles.itemActionBtn, pressed && { opacity: 0.6 }]}
              >
                <Icon source="pencil-outline" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
            {canManageStock && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onManageStock();
                }}
                accessibilityRole="button"
                accessibilityLabel="Adjust product stock"
                hitSlop={6}
                style={({ pressed }) => [styles.itemActionBtn, styles.itemActionBtnPrimary, pressed && { opacity: 0.6 }]}
              >
                <Icon source="plus" size={16} color={colors.primary} />
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
    width: 40,
    height: 40,
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
  directionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  directionBtn: {
    flex: 1,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  directionBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  directionBtnActiveOut: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  directionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  directionTextActive: {
    color: colors.surface,
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
  itemCardSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: "#eff6ff",
  },
  selectorContainer: {
    justifyContent: "center",
    alignItems: "center",
    height: 42,
    marginRight: 2,
  },
});

