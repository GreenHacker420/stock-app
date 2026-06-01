import React, { useEffect, useState, useMemo } from "react";
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TextInput, Text, Icon, Divider, Checkbox } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

import { closeCashSession, fetchCurrentCashSession, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

export function CloseDay() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const [shopId, setShopId] = useState<string | undefined>();
  const [actualCash, setActualCash] = useState("");
  const [cashHandover, setCashHandover] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [differenceReason, setDifferenceReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  
  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const currentQuery = useQuery({
    queryKey: ["cash-session", shopId],
    queryFn: () => fetchCurrentCashSession(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const expected = Number(currentQuery.data?.expectedCash ?? 0);
  const actual = Number(actualCash || 0);
  const deductions = Number(otherDeductions || 0);
  const finalExpected = expected - deductions;
  const difference = actual - finalExpected;
  const isMismatched = Math.abs(difference) > 0.01 && actualCash !== "";

  const closeMutation = useMutation({
    mutationFn: () =>
      closeCashSession(token ?? "", currentQuery.data?.id ?? "", {
        actualCash: actual,
        cashHandover: Number(cashHandover || 0),
        otherDeductionsAmount: deductions,
        otherDeductionsReason: otherReason || undefined,
        differenceReason: isMismatched ? differenceReason : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-session", shopId] });
      setSuccessVisible(true);
    },
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <AppHeader title="Day Closing" subtitle={new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
        
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.contentContainer}>
            <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

            {/* System Calculation Card */}
            <View style={styles.calculationCard}>
               <View style={styles.calculationHeader}>
                  <Text style={styles.calculationHeaderTitle}>SYSTEM CALCULATION</Text>
                  <Icon source="calculator-variant-outline" size={20} color={colors.textMuted} />
               </View>
               <View style={styles.calculationBody}>
                  <View style={styles.expectedRow}>
                     <View>
                        <Text style={styles.expectedLabel}>EXPECTED CASH</Text>
                        <Text style={styles.expectedValue}>₹{expected.toLocaleString()}</Text>
                     </View>
                     <View style={styles.ledgerBadge}>
                        <Text style={styles.ledgerBadgeText}>LEDGER BASE</Text>
                     </View>
                  </View>
                  <Divider style={styles.divider} />
                  <View style={styles.breakdownContainer}>
                     <BreakdownRow label="Cash Sales (+)" value={`₹${expected.toLocaleString()}`} />
                     <BreakdownRow label="Expenses / Payouts (-)" value={`₹${deductions.toLocaleString()}`} isNegative />
                  </View>
               </View>
            </View>

            {/* Physical Count Entry */}
            <Section title="Physical Reconciliation">
               <View style={styles.reconciliationCard}>
                  <View style={styles.inputGroup}>
                     <Text style={styles.inputLabel}>ACTUAL CASH IN DRAWER</Text>
                     <TextInput
                        mode="outlined"
                        placeholder="0"
                        keyboardType="numeric"
                        value={actualCash}
                        onChangeText={setActualCash}
                        selectTextOnFocus
                        style={styles.largeInput}
                        outlineStyle={styles.inputOutline}
                        textColor={colors.textPrimary}
                        left={<TextInput.Affix text="₹" />}
                     />
                  </View>

                  {isMismatched ? (
                    <View style={styles.mismatchAlert}>
                       <View style={styles.alertHeader}>
                          <View style={styles.alertTitleRow}>
                             <Icon source="alert-circle" size={20} color={colors.danger} />
                             <Text style={styles.alertTitle}>Discrepancy Detected</Text>
                          </View>
                          <Text style={styles.alertAmount}>{difference > 0 ? "+" : ""}₹{difference.toFixed(2)}</Text>
                       </View>
                       <TextInput
                          mode="outlined"
                          label="Reason for Mismatch"
                          placeholder="Why is there a difference?"
                          value={differenceReason}
                          onChangeText={setDifferenceReason}
                          style={styles.input}
                          outlineStyle={styles.inputOutlineSmall}
                       />
                    </View>
                  ) : actualCash !== "" ? (
                    <View style={styles.balancedAlert}>
                       <Icon source="checkbox-marked-circle" size={24} color={colors.success} />
                       <Text style={styles.balancedText}>Reconciliation Balanced</Text>
                    </View>
                  ) : null}

                  <Divider style={styles.divider} />

                  <View style={styles.otherEntries}>
                     <View style={styles.inlineInputRow}>
                        <Text style={styles.inlineLabel}>Other Deductions</Text>
                        <TextInput
                          mode="flat"
                          dense
                          placeholder="₹0"
                          keyboardType="numeric"
                          selectTextOnFocus
                          value={otherDeductions}
                          onChangeText={setOtherDeductions}
                          style={styles.smallInlineInput}
                        />
                     </View>
                     {deductions > 0 && (
                       <TextInput
                         mode="outlined"
                         label="Deduction Reason"
                         value={otherReason}
                         onChangeText={setOtherReason}
                         style={styles.input}
                         outlineStyle={styles.inputOutlineSmall}
                       />
                     )}
                     <View style={styles.inlineInputRow}>
                        <Text style={styles.inlineLabel}>Cash Handover</Text>
                        <TextInput
                          mode="flat"
                          dense
                          placeholder="₹0"
                          keyboardType="numeric"
                          selectTextOnFocus
                          value={cashHandover}
                          onChangeText={setCashHandover}
                          style={styles.smallInlineInput}
                        />
                     </View>
                  </View>
               </View>
            </Section>

            <Pressable 
              style={styles.confirmationRow} 
              onPress={() => setConfirmed(!confirmed)}
            >
               <Checkbox.Android 
                 status={confirmed ? 'checked' : 'unchecked'} 
                 color={colors.primary}
               />
               <Text style={styles.confirmationText}>
                  I confirm that I have physically counted the cash and all entries are accurate.
               </Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.footer}>
           <Button
              label={isMismatched ? "SUBMIT WITH MISMATCH" : "SUBMIT CLOSING REPORT"}
              variant={isMismatched ? "danger" : "primary"}
              disabled={!confirmed || !actualCash || (isMismatched && !differenceReason)}
              loading={closeMutation.isPending}
              onPress={() => closeMutation.mutate()}
              fullWidth
              size="lg"
           />
        </View>
      </KeyboardAvoidingView>

      <SuccessModal
        visible={successVisible}
        title="Day Closed"
        message="The cash session has been closed successfully."
        onClose={() => {
          setSuccessVisible(false);
          navigation.goBack();
        }}
      />
    </Screen>
  );
}

function BreakdownRow({ label, value, isNegative }: { label: string, value: string, isNegative?: boolean }) {
  return (
    <View style={styles.breakdownRow}>
       <Text style={styles.breakdownLabel}>{label}</Text>
       <Text style={[styles.breakdownValue, isNegative && styles.negativeValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  contentContainer: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  calculationCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  calculationHeader: {
    backgroundColor: colors.textPrimary,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calculationHeaderTitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  calculationBody: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  expectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expectedLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  expectedValue: {
    fontSize: fontSize.xxl,
    color: colors.textPrimary,
    fontWeight: fontWeight.black,
  },
  ledgerBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  ledgerBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: fontWeight.black,
  },
  divider: {
    backgroundColor: colors.border,
  },
  breakdownContainer: {
    gap: spacing.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  breakdownLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    fontSize: fontSize.sm,
  },
  breakdownValue: {
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  negativeValue: {
    color: colors.danger,
  },
  reconciliationCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xl,
    ...shadow.sm,
  },
  inputGroup: {
    gap: spacing.sm,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  largeInput: {
    backgroundColor: colors.surface,
    fontSize: fontSize.xxl,
    height: 64,
  },
  inputOutline: {
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  inputOutlineSmall: {
    borderRadius: radius.md,
  },
  mismatchAlert: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.1)',
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  alertTitle: {
    color: colors.danger,
    fontWeight: fontWeight.bold,
  },
  alertAmount: {
    color: colors.danger,
    fontWeight: fontWeight.black,
    fontSize: fontSize.md,
  },
  input: {
    backgroundColor: colors.surface,
  },
  balancedAlert: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.1)',
    padding: spacing.lg,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  balancedText: {
    color: colors.success,
    fontWeight: fontWeight.bold,
  },
  otherEntries: {
    gap: spacing.lg,
  },
  inlineInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineLabel: {
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
  },
  smallInlineInput: {
    backgroundColor: 'transparent',
    width: 120,
    textAlign: 'right',
  },
  confirmationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  confirmationText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.lg,
  }
});
