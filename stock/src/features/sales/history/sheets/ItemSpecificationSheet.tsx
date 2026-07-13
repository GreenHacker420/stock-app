import { View, StyleSheet } from "react-native";
import { Divider, Text } from "react-native-paper";
import { AppBottomSheetModal } from "@/components/overlays/AppBottomSheetModal";
import { colors, spacing, fontWeight } from "@/theme";

interface ItemSpecificationSheetProps {
  visible: boolean;
  onDismiss: () => void;
  selectedItemDetails: {
    rate: string | number;
    itemName?: string | null;
    itemUnit?: string | null;
    mrp?: string | number | null;
    defaultPrice?: string | number | null;
    item?: {
      name?: string | null;
      sku?: string | null;
      brand?: { name?: string | null } | null;
      category?: { name?: string | null } | null;
      unit?: string | null;
      mrp?: string | number | null;
      defaultSellingPrice?: string | number | null;
      minimumAllowedPrice?: string | number | null;
      minPrice?: string | number | null;
    } | null;
  } | null;
  formatRawMoney: (val: string | number | null | undefined) => string;
}

export function ItemSpecificationSheet({
  visible,
  onDismiss,
  selectedItemDetails,
  formatRawMoney,
}: ItemSpecificationSheetProps) {
  if (!selectedItemDetails) return null;

  const item = selectedItemDetails.item;
  const itemName = item?.name || selectedItemDetails.itemName || "Deleted product";
  const sku = item?.sku || "—";
  const brandName = item?.brand?.name || "—";
  const categoryName = item?.category?.name || "—";
  const unitName = item?.unit || selectedItemDetails.itemUnit || "—";
  const mrpVal = item?.mrp || selectedItemDetails.mrp || 0;
  const defaultPriceVal = item?.defaultSellingPrice || selectedItemDetails.defaultPrice || 0;
  const minPriceVal = item?.minimumAllowedPrice || item?.minPrice || 0;

  return (
    <AppBottomSheetModal
      visible={visible}
      title="Item Specification"
      onDismiss={onDismiss}
      scrollable
    >
      <View style={{ gap: spacing.sm }}>
        <Text style={styles.titleText}>
          {itemName}
        </Text>
        
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>SKU Code</Text>
          <Text style={styles.metaVal}>{sku}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Company / Brand</Text>
          <Text style={styles.metaVal}>{brandName}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Category</Text>
          <Text style={styles.metaVal}>{categoryName}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Measurement Unit</Text>
          <Text style={styles.metaVal}>{unitName}</Text>
        </View>
        
        <Divider style={styles.divider} />

        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Maximum Retail Price (MRP)</Text>
          <Text style={[styles.metaVal, styles.boldVal]}>
            {formatRawMoney(mrpVal)}
          </Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Original Selling Price</Text>
          <Text style={styles.metaVal}>{formatRawMoney(defaultPriceVal)}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Billed Selling Rate</Text>
          <Text style={[styles.metaVal, styles.billedVal]}>
            {formatRawMoney(selectedItemDetails.rate)}
          </Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Minimum Allowed Price</Text>
          <Text style={styles.metaVal}>{formatRawMoney(minPriceVal)}</Text>
        </View>
      </View>
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  titleText: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  metaCell: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  metaLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  boldVal: {
    fontWeight: fontWeight.bold,
  },
  billedVal: {
    color: colors.primary,
    fontWeight: fontWeight.black,
  },
  divider: {
    marginVertical: spacing.sm,
    backgroundColor: colors.border,
  },
});
