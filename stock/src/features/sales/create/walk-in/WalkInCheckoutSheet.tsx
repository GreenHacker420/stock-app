import { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { Icon, Text, TextInput } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { DynamicUpiQr } from "../../../../components/ui/DynamicUpiQr";
import { Button } from "../../../../components/ui/Button";

interface WalkInCheckoutSheetProps {
  visible: boolean;
  onClose: () => void;
  cartTotal: number;
  paymentMode: "CASH" | "UPI";
  onChangePaymentMode: (mode: "CASH" | "UPI") => void;
  amountReceived: string;
  onChangeAmountReceived: (val: string) => void;
  notes: string;
  onChangeNotes: (val: string) => void;
  upiConfirmedFingerprint: string | null;
  upiProposalFingerprint: string;
  onConfirmUpi: () => void;
  onCompleteSale: () => void;
  isPending: boolean;
  draftShop?: { upiId?: string; upiName?: string | null };
}

export function WalkInCheckoutSheet({
  visible,
  onClose,
  cartTotal,
  paymentMode,
  onChangePaymentMode,
  amountReceived,
  onChangeAmountReceived,
  notes,
  onChangeNotes,
  upiConfirmedFingerprint,
  upiProposalFingerprint,
  onConfirmUpi,
  onCompleteSale,
  isPending,
  draftShop,
}: WalkInCheckoutSheetProps) {
  const slideAnim = useRef(new Animated.Value(Dimensions.get("window").height)).current;
  const parsedReceived = Number(amountReceived) || 0;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get("window").height,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const change = Math.max(0, parsedReceived - cartTotal);

  const isUpiConfirmed = upiConfirmedFingerprint === upiProposalFingerprint;

  const isFormValid = () => {
    if (paymentMode === "UPI") {
      return Boolean(draftShop?.upiId) && isUpiConfirmed;
    }
    return parsedReceived >= cartTotal;
  };

  const handleSuggestionPress = (amt: number) => {
    const current = Number(amountReceived) || 0;
    onChangeAmountReceived(String(current + amt));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.avoidingView}
        >
          <Animated.View
            style={[
              styles.sheetContainer,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Checkout & Settle</Text>
                <Text style={styles.subtitle}>Settle payment to complete walk-in sale</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close checkout sheet"
                style={styles.closeButton}
              >
                <Icon source="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              {/* Total Due Card */}
              <View style={styles.totalDueCard}>
                <Text style={styles.totalDueLabel}>TOTAL DUE</Text>
                <Text style={styles.totalDueVal}>₹{cartTotal.toLocaleString("en-IN")}</Text>
              </View>

              {/* Payment Mode Selector */}
              <Text style={styles.sectionLabel}>Select Payment Mode</Text>
              <View style={styles.paymentGrid}>
                {(["CASH", "UPI"] as const).map((mode) => {
                  const isSelected = paymentMode === mode;
                  const label = mode === "CASH" ? "Cash" : "UPI QR";
                  const icon = mode === "CASH" ? "cash-multiple" : "qrcode-scan";

                  return (
                    <Pressable
                      key={mode}
                      onPress={() => {
                        onChangePaymentMode(mode);
                        if (mode === "UPI") {
                          onChangeAmountReceived(String(cartTotal));
                        } else {
                          onChangeAmountReceived("");
                        }
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      style={[
                        styles.paymentCard,
                        isSelected && styles.paymentCardSelected,
                      ]}
                    >
                      <Icon
                        source={icon}
                        size={22}
                        color={isSelected ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.paymentCardLabel,
                          isSelected && styles.paymentCardLabelActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Cash payment details */}
              {paymentMode === "CASH" && (
                <View style={styles.cashContainer}>
                  <TextInput
                    mode="outlined"
                    label="Amount Received"
                    value={amountReceived}
                    onChangeText={onChangeAmountReceived}
                    keyboardType="decimal-pad"
                    outlineStyle={styles.inputOutline}
                    left={<TextInput.Icon icon="cash" />}
                    style={styles.input}
                    placeholder={`Min ₹${cartTotal.toLocaleString("en-IN")}`}
                  />

                  {/* Suggestions Row */}
                  <View style={styles.suggestionsRow}>
                    <Pressable
                      onPress={() => onChangeAmountReceived(String(cartTotal))}
                      style={styles.suggestionPill}
                    >
                      <Text style={styles.suggestionPillText}>Exact</Text>
                    </Pressable>
                    {[100, 500, 1000].map((amt) => (
                      <Pressable
                        key={amt}
                        onPress={() => handleSuggestionPress(amt)}
                        style={styles.suggestionPill}
                      >
                        <Text style={styles.suggestionPillText}>+₹{amt}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={styles.changeCard}>
                    <Text style={styles.changeLabel}>Change to Return:</Text>
                    <Text style={[styles.changeVal, change > 0 && styles.textSuccess]}>
                      ₹{change.toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>
              )}

              {/* UPI Payment Details */}
              {paymentMode === "UPI" && (
                <View style={styles.upiContainer}>
                  {draftShop?.upiId ? (
                    <>
                      <DynamicUpiQr
                        upiId={draftShop.upiId}
                        upiName={draftShop.upiName}
                        amount={cartTotal}
                        transactionNote="Walk-in Sale UPI"
                      />

                      {/* Explicit confirmation */}
                      <View style={styles.confirmWrapper}>
                        {isUpiConfirmed ? (
                          <View style={styles.confirmedBox}>
                            <Icon source="check-circle" size={20} color={colors.success} />
                            <Text style={styles.confirmedText}>Payment Confirmed Received</Text>
                          </View>
                        ) : (
                          <Button
                            label="MARK PAYMENT RECEIVED"
                            variant="primary"
                            icon="check"
                            onPress={onConfirmUpi}
                            fullWidth
                          />
                        )}
                      </View>
                    </>
                  ) : (
                    <View style={styles.warningBox}>
                      <Icon source="alert" size={20} color={colors.warning} />
                      <Text style={styles.warningText}>No Shop UPI ID configured</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Notes Input */}
              <View style={styles.notesContainer}>
                <TextInput
                  mode="outlined"
                  label="Sale Notes (Optional)"
                  value={notes}
                  onChangeText={onChangeNotes}
                  multiline
                  numberOfLines={2}
                  outlineStyle={styles.inputOutline}
                  style={styles.input}
                />
              </View>
            </ScrollView>

            {/* Actions Footer */}
            <View style={styles.footer}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.cancelBtnText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={onCompleteSale}
                disabled={!isFormValid() || isPending}
                style={({ pressed }) => [
                  styles.completeBtn,
                  (!isFormValid() || isPending) && styles.completeBtnDisabled,
                  pressed && isFormValid() && !isPending && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.completeBtnText,
                    (!isFormValid() || isPending) && styles.completeBtnTextDisabled,
                  ]}
                >
                  {isPending ? "Completing..." : "Complete Sale"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  avoidingView: {
    width: "100%",
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: Dimensions.get("window").height * 0.85,
    ...shadow.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  closeButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  totalDueCard: {
    backgroundColor: colors.successLight,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  totalDueLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
    letterSpacing: 1,
  },
  totalDueVal: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  paymentGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  paymentCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  paymentCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  paymentCardLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  paymentCardLabelActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  cashContainer: {
    gap: spacing.sm,
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
  suggestionPillText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  changeCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  changeLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  changeVal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  textSuccess: {
    color: colors.success,
  },
  upiContainer: {
    gap: spacing.md,
  },
  confirmWrapper: {
    marginTop: spacing.xs,
  },
  confirmedBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: `${colors.success}40`,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    minHeight: 48,
  },
  confirmedText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
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
  notesContainer: {
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: "row",
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  cancelBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  completeBtn: {
    flex: 1.5,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  completeBtnDisabled: {
    backgroundColor: colors.border,
    opacity: 0.65,
  },
  completeBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  completeBtnTextDisabled: {
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.8,
  },
});
