import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { triggerLightHaptic } from "../../../../utils/haptics";
import { fromMinorUnits } from "../core/sale-calculations";
import { QuantityStepper } from "./QuantityStepper";
import { PriceEditorSheet } from "./PriceEditorSheet";
import { SerialNumberAction } from "./SerialNumberAction";
import type { ItemSnapshot } from "../core/sale.types";

interface SaleCartLineProps {
  item: ItemSnapshot & {
    brandName?: string | null;
    brand?: { name?: string | null } | null;
    mrpMinor?: number;
    mrp?: number;
  };
  quantity: number;
  customRate?: number;
  serialNumbers?: string[];
  onScanPress?: () => void;
  onUpdateRate: (rate: number | undefined) => void;
  onAdjustQuantity: (delta: -1 | 1) => void;
  userRole?: string;
}

export const SaleCartLine = memo(
  function SaleCartLine({
    item,
    quantity,
    customRate,
    serialNumbers = [],
    onScanPress,
    onUpdateRate,
    onAdjustQuantity,
    userRole,
  }: SaleCartLineProps) {
    const [sheetVisible, setSheetVisible] = useState(false);

    const defaultPrice = fromMinorUnits(item.defaultRateMinor);
    const minPrice = fromMinorUnits(item.minimumRateMinor);
    const mrp = item.mrp
      ? item.mrp
      : item.mrpMinor
      ? fromMinorUnits(item.mrpMinor)
      : undefined;

    const currentPrice = customRate !== undefined ? customRate : defaultPrice;
    const lineTotal = quantity * currentPrice;

    const handleIncrement = () => {
      triggerLightHaptic();
      onAdjustQuantity(1);
    };

    const handleDecrement = () => {
      triggerLightHaptic();
      onAdjustQuantity(-1);
    };

    const brandDisplay = item.brandName || item.brand?.name;

    return (
      <View style={styles.container}>
        {/* Main Details and Total */}
        <View style={styles.topRow}>
          <View style={styles.infoCol}>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={styles.subtitleRow}>
              {brandDisplay ? (
                <Text style={styles.brandText}>{brandDisplay.toUpperCase()}</Text>
              ) : null}
              <Text style={styles.subtitle}>
                {brandDisplay ? " • " : ""}₹{currentPrice.toLocaleString("en-IN")} × {quantity}
              </Text>
            </View>
          </View>
          <Text style={styles.totalText}>
            ₹{lineTotal.toLocaleString("en-IN")}
          </Text>
        </View>

        {/* Actions and Stepper Row */}
        <View style={styles.actionRow}>
          <View style={styles.btnGroup}>
            <Pressable
              onPress={() => setSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`Edit price for ${item.name}`}
              style={({ pressed }) => [
                styles.actionBtn,
                customRate !== undefined && styles.actionBtnActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                source="pencil-outline"
                size={16}
                color={customRate !== undefined ? colors.success : colors.primary}
              />
              <Text
                style={[
                  styles.actionBtnText,
                  customRate !== undefined && styles.actionBtnTextActive,
                ]}
              >
                {customRate !== undefined ? "Price Edited" : "Edit Price"}
              </Text>
            </Pressable>

            {!!item.requiresSerialNumber && onScanPress && (
              <Pressable
                onPress={onScanPress}
                accessibilityRole="button"
                accessibilityLabel={`Scan serial numbers for ${item.name}`}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              >
                <Icon source="barcode-scan" size={16} color={colors.primary} />
                <Text style={styles.actionBtnText}>Serials</Text>
              </Pressable>
            )}
          </View>

          <QuantityStepper
            itemName={item.name}
            quantity={quantity}
            maximum={item.availableStock}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            compact
          />
        </View>

        {/* Serial Numbers Warning/Status */}
        {!!item.requiresSerialNumber && onScanPress && (
          <View style={styles.serialRow}>
            <SerialNumberAction
              itemName={item.name}
              quantity={quantity}
              serialNumbers={serialNumbers}
              onScanPress={onScanPress}
            />
          </View>
        )}

        {/* Price Editor Sheet Component */}
        <PriceEditorSheet
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          itemName={item.name}
          defaultPrice={defaultPrice}
          minimumPrice={minPrice}
          mrp={mrp}
          currentPrice={currentPrice}
          onSave={onUpdateRate}
          userRole={userRole}
        />
      </View>
    );
  },
  (p, n) =>
    p.item.id === n.item.id &&
    p.quantity === n.quantity &&
    p.customRate === n.customRate &&
    p.userRole === n.userRole &&
    p.serialNumbers?.join(",") === n.serialNumbers?.join(",")
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  infoCol: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  brandText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  totalText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    gap: spacing.sm,
    flexWrap: "wrap", // Wrapping on compact screens
  },
  btnGroup: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 36,
  },
  actionBtnActive: {
    borderColor: colors.success,
    backgroundColor: colors.successLight,
  },
  actionBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  actionBtnTextActive: {
    color: colors.success,
  },
  serialRow: {
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
