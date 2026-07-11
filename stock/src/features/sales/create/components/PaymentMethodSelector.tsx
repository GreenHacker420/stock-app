import { Pressable, StyleSheet, View } from "react-native";
import { Divider, Icon, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { DynamicUpiQr } from "../../../../components/ui/DynamicUpiQr";

type PaymentType = "CASH" | "UPI" | "BANK_TRANSFER" | "CREDIT";

interface PaymentMethodSelectorProps {
  paymentType: PaymentType;
  onSelectPaymentType: (type: PaymentType) => void;
  amountPaid: string;
  onChangeAmountPaid: (val: string) => void;
  cartTotal: number;
  partialPaymentMode: "CASH" | "UPI";
  onChangePartialPaymentMode: (val: "CASH" | "UPI") => void;
  balance: number; // Derived from settlement
  isCredit: boolean; // Derived from settlement
  isCreditAuthorizationCurrent: boolean;
  onDrawSignaturePress: () => void;
  draftShop?: { upiId?: string; upiName?: string | null };
  settlementError?: string | null;
}

export function PaymentMethodSelector({
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
}: PaymentMethodSelectorProps) {
  const parsedAmountPaid = Number(amountPaid) || 0;
  const isCreditUpfrontWithinBounds = settlementError !== "CREDIT_PAYMENT_EXCEEDS_TOTAL";

  const handleSuggestionPress = (amtToAdd: number) => {
    const current = Number(amountPaid) || 0;
    onChangeAmountPaid(String(current + amtToAdd));
  };

  const handleExactPress = () => {
    onChangeAmountPaid(String(cartTotal));
  };

  const renderSuggestions = () => (
    <View style={styles.suggestionsRow}>
      <Pressable
        onPress={handleExactPress}
        accessibilityRole="button"
        accessibilityLabel="Exact amount"
        style={styles.suggestionPill}
      >
        <Text style={styles.suggestionText}>Exact</Text>
      </Pressable>
      {[100, 500, 1000].map((amt) => (
        <Pressable
          key={amt}
          onPress={() => handleSuggestionPress(amt)}
          accessibilityRole="button"
          accessibilityLabel={`Add ₹${amt}`}
          style={styles.suggestionPill}
        >
          <Text style={styles.suggestionText}>+₹{amt}</Text>
        </Pressable>
      ))}
    </View>
  );

  const renderCashContent = () => {
    const change = Math.max(0, parsedAmountPaid - cartTotal);
    return (
      <View style={styles.expandedContent}>
        <TextInput
          mode="outlined"
          label="Amount Received"
          value={amountPaid}
          onChangeText={onChangeAmountPaid}
          keyboardType="decimal-pad"
          outlineStyle={styles.inputOutline}
          left={<TextInput.Affix text="₹ " />}
          style={styles.input}
        />
        {renderSuggestions()}
        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Change to Return:</Text>
          <Text style={[styles.resultValue, change > 0 && styles.textSuccess]}>
            ₹{change.toLocaleString("en-IN")}
          </Text>
        </View>
      </View>
    );
  };

  const renderUpiContent = () => (
    <View style={styles.expandedContent}>
      {draftShop?.upiId ? (
        <DynamicUpiQr
          upiId={draftShop.upiId}
          upiName={draftShop.upiName}
          amount={cartTotal}
          transactionNote="Sale Payment"
        />
      ) : (
        <View style={styles.warningBox}>
          <Icon source="alert" size={20} color={colors.warning} />
          <Text style={styles.warningText}>No Shop UPI ID set for QR code</Text>
        </View>
      )}
    </View>
  );

  const renderBankContent = () => (
    <View style={styles.expandedContent}>
      <Text style={styles.infoText}>
        Ensure the bank transfer of ₹{cartTotal.toLocaleString("en-IN")} has been verified in the
        bank statement.
      </Text>
    </View>
  );

  const renderCreditContent = () => (
    <View style={styles.expandedContent}>
      <TextInput
        mode="outlined"
        label="Upfront Payment (Optional)"
        value={amountPaid}
        onChangeText={onChangeAmountPaid}
        keyboardType="decimal-pad"
        outlineStyle={styles.inputOutline}
        left={<TextInput.Affix text="₹ " />}
        style={styles.input}
      />
      {!isCreditUpfrontWithinBounds && (
        <Text style={styles.errorText}>Upfront payment cannot exceed ₹{cartTotal.toLocaleString("en-IN")}.</Text>
      )}
      {renderSuggestions()}

      {parsedAmountPaid > 0 && isCreditUpfrontWithinBounds && (
        <View style={styles.segmentedRow}>
          <Text style={styles.segmentedLabel}>How was the ₹{parsedAmountPaid.toLocaleString("en-IN")} paid?</Text>
          <SegmentedButtons
            value={partialPaymentMode}
            onValueChange={(v) => onChangePartialPaymentMode(v as "CASH" | "UPI")}
            buttons={[
              { value: "CASH", label: "Cash", icon: "cash" },
              { value: "UPI", label: "UPI", icon: "qrcode" },
            ]}
            theme={{ colors: { primary: colors.primary } }}
          />
        </View>
      )}

      <Divider style={styles.divider} />

      <View style={styles.creditStatus}>
        <Text style={styles.creditLabel}>Credit Balance Amount:</Text>
        <Text style={styles.creditValue}>₹{balance.toLocaleString("en-IN")}</Text>
      </View>

      {/* Signature Acknowledgment Section */}
      <View style={styles.signatureSection}>
        {isCreditAuthorizationCurrent ? (
          <View style={styles.sigCapturedCard}>
            <Icon source="check-circle" size={20} color={colors.success} />
            <Text style={styles.sigCapturedText}>Customer Signature Captured</Text>
            <Pressable
              onPress={onDrawSignaturePress}
              accessibilityRole="button"
              accessibilityLabel="Redraw customer signature"
              style={({ pressed }) => [styles.sigRedrawBtn, pressed && styles.pressed]}
            >
              <Icon source="pencil" size={16} color={colors.primary} />
              <Text style={styles.sigRedrawText}>RE-DRAW</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onDrawSignaturePress}
            accessibilityRole="button"
            accessibilityLabel="Draw customer signature for credit authorization"
            style={({ pressed }) => [styles.sigBtn, pressed && styles.pressed]}
          >
            <Icon source="pencil" size={20} color={colors.textInverse} />
            <Text style={styles.sigBtnText}>DRAW SIGNATURE *</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderRadioRow = (type: PaymentType, label: string, icon: string) => {
    const isSelected = paymentType === type;
    return (
      <View style={[styles.methodRowContainer, isSelected && styles.methodRowContainerActive]}>
        <Pressable
          onPress={() => {
            onSelectPaymentType(type);
            if (type === "CREDIT") {
              onChangeAmountPaid("0");
            } else {
              onChangeAmountPaid(String(cartTotal));
            }
          }}
          accessibilityRole="radio"
          accessibilityState={{ checked: isSelected }}
          accessibilityLabel={`Select ${label} payment method`}
          style={({ pressed }) => [styles.methodHeader, pressed && styles.pressed]}
        >
          <View style={styles.methodLeft}>
            <View style={styles.radioCircle}>
              {isSelected && <View style={styles.radioDot} />}
            </View>
            <Icon source={icon} size={22} color={isSelected ? colors.primary : colors.textSecondary} />
            <Text style={[styles.methodLabel, isSelected && styles.methodLabelActive]}>
              {label}
            </Text>
          </View>
        </Pressable>

        {isSelected && type === "CASH" && renderCashContent()}
        {isSelected && type === "UPI" && renderUpiContent()}
        {isSelected && type === "BANK_TRANSFER" && renderBankContent()}
        {isSelected && type === "CREDIT" && renderCreditContent()}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderRadioRow("CASH", "Cash", "cash-multiple")}
      {renderRadioRow("UPI", "UPI QR Code", "qrcode-scan")}
      {renderRadioRow("BANK_TRANSFER", "Bank Transfer", "bank")}
      {renderRadioRow("CREDIT", "Customer Credit", "card-text-outline")}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  methodRowContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
    ...shadow.sm,
  },
  methodRowContainerActive: {
    borderColor: colors.primary,
  },
  methodHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    minHeight: 48,
  },
  methodLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  methodLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  methodLabelActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  expandedContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
    borderColor: colors.border,
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  suggestionPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceOffset,
  },
  suggestionText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  resultLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  resultValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  textSuccess: {
    color: colors.success,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  warningText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: fontWeight.semibold,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.xs,
  },
  segmentedRow: {
    gap: spacing.xs,
  },
  segmentedLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  divider: {
    marginVertical: spacing.xs,
  },
  creditStatus: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  creditLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.danger,
  },
  creditValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.danger,
  },
  signatureSection: {
    marginTop: spacing.xs,
  },
  sigBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
  },
  sigBtnText: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  sigCapturedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: `${colors.success}40`,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sigCapturedText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.success,
  },
  sigRedrawBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  sigRedrawText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});
