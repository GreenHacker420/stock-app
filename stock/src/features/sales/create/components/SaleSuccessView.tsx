import { StyleSheet, View, ScrollView } from "react-native";
import { Icon, Text, Divider } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { Button } from "../../../../components/ui/Button";
import { InfoRow } from "../../../../components/ui/InfoRow";

interface SaleSuccessViewProps {
  invoiceSale: {
    saleNumber: string;
    totalAmount: number;
  };
  customerName: string;
  customerPhone?: string | null;
  paymentMode: string;
  paidAmount: number;
  changeAmount: number;
  creditAmount: number;
  onStartNewSale: () => void;
  onViewInvoice: () => void;
  onSharePdf: () => void;
  onPrintDirect?: () => void;
  isSharing?: boolean;
  isPrinting?: boolean;
}

export function SaleSuccessView({
  invoiceSale,
  customerName,
  customerPhone,
  paymentMode,
  paidAmount,
  changeAmount,
  creditAmount,
  onStartNewSale,
  onViewInvoice,
  onSharePdf,
  onPrintDirect,
  isSharing = false,
  isPrinting = false,
}: SaleSuccessViewProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.successCard}>
        <View style={styles.iconWrapper}>
          <Icon source="check-circle" size={64} color={colors.success} />
        </View>
        <Text style={styles.title}>Sale Completed!</Text>
        <Text style={styles.subtitle}>
          Recorded sale of ₹{invoiceSale.totalAmount.toLocaleString("en-IN")} successfully.
        </Text>
      </View>

      {/* Premium Receipt Card */}
      <View style={styles.receiptCard}>
        <Text style={styles.receiptHeader}>RECEIPT SUMMARY</Text>
        <Divider style={styles.divider} />

        <InfoRow label="Sale Number" value={invoiceSale.saleNumber} />
        <InfoRow label="Customer" value={customerName} />
        {customerPhone ? <InfoRow label="Phone" value={customerPhone} /> : null}
        <InfoRow label="Payment Mode" value={paymentMode} />
        <InfoRow label="Amount Received" value={`₹${paidAmount.toLocaleString("en-IN")}`} />

        {changeAmount > 0.01 && (
          <View style={styles.specialRowContainer}>
            <InfoRow
              label="Change Returned"
              value={`₹${changeAmount.toLocaleString("en-IN")}`}
              tone="green"
            />
          </View>
        )}

        {creditAmount > 0.01 && (
          <View style={styles.specialRowContainer}>
            <InfoRow
              label="Balance to Credit"
              value={`₹${creditAmount.toLocaleString("en-IN")}`}
              tone="red"
            />
          </View>
        )}
      </View>

      {/* Actions Section — Stacked for anti-wrapping and one-handed thumb reach */}
      <View style={styles.actionsContainer}>
        {onPrintDirect && (
          <Button
            label="PRINT RECEIPT"
            variant="primary"
            icon="printer"
            onPress={onPrintDirect}
            loading={isPrinting}
            fullWidth
          />
        )}

        <View style={styles.rowActions}>
          <Button
            label="View Invoice"
            variant="ghost"
            icon="eye-outline"
            onPress={onViewInvoice}
            style={styles.flex1}
          />
          <Button
            label="Share PDF"
            variant="secondary"
            icon="share-variant-outline"
            onPress={onSharePdf}
            loading={isSharing}
            style={styles.flex1}
          />
        </View>

        <Button
          label="START NEW SALE"
          variant="success"
          icon="plus"
          onPress={onStartNewSale}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.lg,
  },
  successCard: {
    alignItems: "center",
    marginVertical: spacing.md,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  receiptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    width: "100%",
    ...shadow.md,
  },
  receiptHeader: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  divider: {
    marginBottom: spacing.md,
  },
  specialRowContainer: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  actionsContainer: {
    width: "100%",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  rowActions: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
  flex1: {
    flex: 1,
  },
});
