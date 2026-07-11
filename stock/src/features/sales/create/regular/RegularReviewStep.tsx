import { StyleSheet, View } from "react-native";
import { Divider, Switch, Text, TextInput } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { SaleCartLine } from "../components/SaleCartLine";

interface RegularReviewStepProps {
  cartArray: any[];
  cartTotal: number;
  isGstSale: boolean;
  onChangeGstSale: (val: boolean) => void;
  notes: string;
  onChangeNotes: (val: string) => void;
  onScanPress: (itemId: string) => void;
  onUpdateRate: (itemId: string, rate: number | undefined) => void;
  onAdjustQuantity: (itemId: string, delta: -1 | 1) => void;
  userRole?: string;
}

export function RegularReviewStep({
  cartArray,
  cartTotal,
  isGstSale,
  onChangeGstSale,
  notes,
  onChangeNotes,
  onScanPress,
  onUpdateRate,
  onAdjustQuantity,
  userRole,
}: RegularReviewStepProps) {
  return (
    <View style={styles.container}>
      {/* Selected Items List Card */}
      <Text style={styles.sectionHeader}>Selected Items</Text>
      <View style={styles.card}>
        {cartArray.map(({ item, quantity, customRate, serialNumbers }) => (
          <SaleCartLine
            key={item.id}
            item={item}
            quantity={quantity}
            customRate={customRate}
            serialNumbers={serialNumbers}
            onScanPress={() => onScanPress(item.id)}
            onUpdateRate={(rate) => onUpdateRate(item.id, rate)}
            onAdjustQuantity={(delta) => onAdjustQuantity(item.id, delta)}
            userRole={userRole}
          />
        ))}

        {/* Bill Summary Block */}
        <View style={styles.billSummary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>₹{cartTotal.toLocaleString("en-IN")}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Discount</Text>
            <Text style={styles.summaryValue}>₹0</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, styles.totalLabel]}>Total Amount</Text>
            <Text style={[styles.summaryValue, styles.totalValue]}>
              ₹{cartTotal.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>
      </View>

      {/* Sale Settings Block */}
      <Text style={styles.sectionHeader}>Sale Settings</Text>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.labelCol}>
            <Text style={styles.settingTitle}>GST Invoice Required?</Text>
            <Text style={styles.settingDesc}>Tick this option to flag for Tally invoicing</Text>
          </View>
          <Switch value={isGstSale} onValueChange={onChangeGstSale} color={colors.primary} />
        </View>

        <TextInput
          mode="outlined"
          label="Sale Notes (Optional)"
          value={notes}
          onChangeText={onChangeNotes}
          multiline
          numberOfLines={3}
          outlineStyle={styles.inputOutline}
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  sectionHeader: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    ...shadow.sm,
  },
  billSummary: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  divider: {
    marginVertical: spacing.xs,
  },
  totalLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
  },
  labelCol: {
    flex: 1,
  },
  settingTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  settingDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  input: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  inputOutline: {
    borderRadius: radius.md,
    borderColor: colors.border,
  },
});
