import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
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
          styles.card,
          hasQty && styles.cardSelected,
          isOutOfStock && styles.cardOutOfStock,
        ]}
        accessibilityRole="none"
        accessibilityLabel={`${item.name}, price ${formattedPrice} per ${item.unit}. Available stock ${stockQty} ${item.unit}.`}
      >
        {hasQty && <View style={styles.leftAccent} />}

        <View style={styles.mainRow}>
          {/* Left Avatar Icon */}
          <View
            style={[
              styles.avatarContainer,
              hasQty && styles.avatarContainerActive,
            ]}
          >
            <Icon
              source="package-variant-closed"
              size={20}
              color={hasQty ? colors.primary : colors.textSecondary}
            />
          </View>

          {/* Product Details */}
          <View style={styles.detailsContainer}>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={styles.metaRow}>
              {item.brandName ? (
                <Text style={styles.brandText}>{item.brandName.toUpperCase()}</Text>
              ) : null}
              {item.sku ? (
                <Text style={styles.metaText}>
                  {item.brandName ? " • " : ""}SKU: {item.sku}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.stockText, stockQty <= 10 && styles.stockTextLow]}>
              {isOutOfStock
                ? "OUT OF STOCK"
                : stockQty <= 10
                ? `Low Stock: ${stockQty} ${item.unit}`
                : `Available: ${stockQty} ${item.unit}`}
            </Text>
          </View>
        </View>

        {/* Pricing & Control Row */}
        <View style={styles.pricingRow}>
          <Text style={styles.priceText}>
            {formattedPrice}
            <Text style={styles.unitText}> / {item.unit}</Text>
          </Text>

          <View style={styles.stepperContainer}>
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
                  size={18}
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

        {/* Serial Numbers Warning/Status */}
        {hasQty && !!item.requiresSerialNumber && onScanPress && (
          <View style={styles.serialContainer}>
            <SerialNumberAction
              itemName={item.name}
              quantity={quantity}
              serialNumbers={serialNumbers}
              onScanPress={onScanPress}
            />
          </View>
        )}
      </View>
    );
  },
  (p, n) =>
    p.item.id === n.item.id &&
    p.quantity === n.quantity &&
    p.serialNumbers?.join(",") === n.serialNumbers?.join(",")
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    position: "relative",
    overflow: "hidden",
    ...shadow.sm,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}05`, // Very light 2% green tint
  },
  cardOutOfStock: {
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
  mainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarContainerActive: {
    backgroundColor: colors.primaryLight,
  },
  detailsContainer: {
    flex: 1,
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
    marginTop: spacing.xs,
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
  stockText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  stockTextLow: {
    color: colors.warning,
    fontWeight: fontWeight.semibold,
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  priceText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  unitText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.regular,
  },
  stepperContainer: {
    height: 44, // Align with minimum target height
    justifyContent: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    gap: spacing.xs,
    minHeight: 36,
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
  serialContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
