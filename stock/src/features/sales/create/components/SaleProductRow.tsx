import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight } from "../../../../theme";
import { triggerLightHaptic } from "../../../../utils/haptics";
import { fromMinorUnits } from "../core/sale-calculations";
import { SerialNumberAction } from "./SerialNumberAction";
import { QuantityStepper } from "./QuantityStepper";
import type { ItemSnapshot } from "../core/sale.types";

interface SaleProductRowProps {
  item: ItemSnapshot;
  quantity: number;
  serialNumbers?: string[];
  onScanPress?: () => void;
  onAdd: () => void;
  onRemove: () => void;
}

export const SaleProductRow = memo(
  function SaleProductRow({
    item,
    quantity,
    serialNumbers = [],
    onScanPress,
    onAdd,
    onRemove,
  }: SaleProductRowProps) {
    const stockQty = item.availableStock ?? 0;
    const isOutOfStock = stockQty <= 0;
    const hasQty = quantity > 0;

    const formattedPrice = `₹${fromMinorUnits(item.defaultRateMinor).toLocaleString("en-IN")}`;

    const handleIncrement = () => {
      if (quantity >= stockQty) return;
      triggerLightHaptic();
      onAdd();
    };

    const handleDecrement = () => {
      triggerLightHaptic();
      onRemove();
    };

    return (
      <View
        style={[
          styles.container,
          hasQty && styles.containerSelected,
          isOutOfStock && styles.containerOutOfStock,
        ]}
        accessibilityRole="none"
        accessibilityLabel={`${item.name}, price ${formattedPrice} per ${item.unit}. Available stock ${stockQty} ${item.unit}.`}
      >
        {/* Left Green Indicator bar */}
        {hasQty && <View style={styles.leftAccent} />}

        {/* Content Column */}
        <View style={styles.leftCol}>
          {/* Title */}
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>

          {/* Subtitles: Brand, SKU, Stock */}
          <View style={styles.metaRow}>
            {item.brandName ? (
              <Text style={styles.brandText}>{item.brandName.toUpperCase()}</Text>
            ) : null}
            {item.sku ? (
              <Text style={styles.metaText}>
                {item.brandName ? " • " : ""}SKU: {item.sku}
              </Text>
            ) : null}
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {item.brandName || item.sku ? " • " : ""}Stock: {stockQty} {item.unit}
            </Text>
          </View>

          {/* Price */}
          <Text style={styles.priceText}>
            {formattedPrice}
            <Text style={styles.unitText}> / {item.unit}</Text>
            {stockQty <= 10 && !isOutOfStock && (
              <Text style={styles.lowStockText}>  (Low Stock)</Text>
            )}
          </Text>

          {/* Serial Action inline if selected */}
          {hasQty && !!item.requiresSerialNumber && onScanPress && (
            <SerialNumberAction
              itemName={item.name}
              quantity={quantity}
              serialNumbers={serialNumbers}
              onScanPress={onScanPress}
            />
          )}
        </View>

        {/* Right Controls Column */}
        <View style={styles.rightCol}>
          {quantity === 0 ? (
            <Pressable
              onPress={handleIncrement}
              disabled={isOutOfStock}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.name} to cart`}
              style={({ pressed }) => [
                styles.addButton,
                isOutOfStock && styles.addButtonDisabled,
                pressed && !isOutOfStock && styles.pressed,
              ]}
            >
              <Icon
                source="plus"
                size={16}
                color={isOutOfStock ? colors.textMuted : colors.primary}
              />
              <Text
                style={[
                  styles.addButtonLabel,
                  isOutOfStock && styles.addButtonLabelDisabled,
                ]}
              >
                ADD
              </Text>
            </Pressable>
          ) : (
            <QuantityStepper
              itemName={item.name}
              quantity={quantity}
              maximum={stockQty}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              compact
            />
          )}
        </View>
      </View>
    );
  },
  (p, n) =>
    p.item.id === n.item.id &&
    p.quantity === n.quantity &&
    p.serialNumbers?.join(",") === n.serialNumbers?.join(",")
);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: "relative",
  },
  containerSelected: {
    backgroundColor: `${colors.primary}05`, // Very light 2% green tint
  },
  containerOutOfStock: {
    opacity: 0.6,
  },
  leftAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.primary,
  },
  leftCol: {
    flex: 1,
    paddingRight: spacing.md,
    gap: 4,
  },
  rightCol: {
    justifyContent: "center",
    alignItems: "flex-end",
    minWidth: 90,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  brandText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  priceText: {
    fontSize: fontSize.sm + 1,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  unitText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.regular,
  },
  lowStockText: {
    fontSize: fontSize.xs,
    color: colors.warning,
    fontWeight: fontWeight.semibold,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
    minHeight: 40,
    minWidth: 80,
  },
  addButtonDisabled: {
    backgroundColor: colors.surfaceOffset,
  },
  addButtonLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  addButtonLabelDisabled: {
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
});
