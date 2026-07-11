import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { PaymentMethodSelector } from "../components/PaymentMethodSelector";

interface RegularPaymentStepProps {
  paymentType: "CASH" | "UPI" | "BANK_TRANSFER" | "CREDIT";
  onSelectPaymentType: (type: "CASH" | "UPI" | "BANK_TRANSFER" | "CREDIT") => void;
  amountPaid: string;
  onChangeAmountPaid: (val: string) => void;
  cartTotal: number;
  partialPaymentMode: "CASH" | "UPI";
  onChangePartialPaymentMode: (val: "CASH" | "UPI") => void;
  balance: number;
  isCredit: boolean;
  isCreditAuthorizationCurrent: boolean;
  onDrawSignaturePress: () => void;
  draftShop?: { upiId?: string; upiName?: string | null };
  settlementError?: string | null;
}

export function RegularPaymentStep({
  paymentType,
  onSelectPaymentType,
  amountPaid,
  onChangeAmountPaid,
  cartTotal,
  partialPaymentMode,
  onChangePartialPaymentMode,
  balance,
  isCredit,
  isCreditAuthorizationCurrent,
  onDrawSignaturePress,
  draftShop,
  settlementError,
}: RegularPaymentStepProps) {
  return (
    <View style={styles.container}>
      {/* Total Due Card - Premium design matching the screenshots */}
      <View style={styles.totalDueCard}>
        <Text style={styles.totalDueLabel}>TOTAL AMOUNT DUE</Text>
        <Text style={styles.totalDueVal}>₹{cartTotal.toLocaleString("en-IN")}</Text>
      </View>

      <Text style={styles.sectionHeader}>Select Payment Mode</Text>
      <PaymentMethodSelector
        paymentType={paymentType}
        onSelectPaymentType={onSelectPaymentType}
        amountPaid={amountPaid}
        onChangeAmountPaid={onChangeAmountPaid}
        cartTotal={cartTotal}
        partialPaymentMode={partialPaymentMode}
        onChangePartialPaymentMode={onChangePartialPaymentMode}
        balance={balance}
        isCredit={isCredit}
        isCreditAuthorizationCurrent={isCreditAuthorizationCurrent}
        onDrawSignaturePress={onDrawSignaturePress}
        draftShop={draftShop}
        settlementError={settlementError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  totalDueCard: {
    backgroundColor: colors.successLight,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  totalDueLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
    letterSpacing: 1.5,
  },
  totalDueVal: {
    fontSize: fontSize.huge,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
    marginTop: spacing.sm,
  },
  sectionHeader: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
});
