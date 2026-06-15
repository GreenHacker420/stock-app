import React, { useEffect, useState, useMemo } from "react";
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TextInput, Text, Icon, Divider, Checkbox } from "react-native-paper";

import { closeCashSession, fetchCurrentCashSession, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

export function CloseDay() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
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
                         placeholder="e.g. Paid Electricity, Advance to staff"
                         value={otherReason}
                         onChangeText={setOtherReason}
                         style={[styles.input, { marginTop: spacing.sm }]}
                         outlineStyle={styles.inputOutlineSmall}
                       />
                     )}
                     
                     <View style={[styles.inlineInputRow, { marginTop: spacing.md }]}>
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

            <View style={styles.confirmationSection}>
               <Checkbox.Item
                  label="I certify that the above physical count is accurate and matches the current drawer state."
                  status={confirmed ? 'checked' : 'unchecked'}
                  onPress={() => setConfirmed(!confirmed)}
                  mode="android"
                  labelStyle={styles.checkboxLabel}
                  color={colors.primary}
               />
            </View>

            <Button
               variant="primary"
               label="SUBMIT & CLOSE SESSION"
               size="lg"
               onPress={() => closeMutation.mutate()}
               loading={closeMutation.isPending}
               disabled={!confirmed || actualCash === "" || (isMismatched && !differenceReason.trim())}
               fullWidth
            />
            
            <View style={styles.infoBox}>
               <Icon source="information-outline" size={18} color={colors.textSecondary} />
               <Text style={styles.infoText}>Once submitted, you will not be able to record any more sales for this shop today until a new session is opened.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SuccessModal
        visible={successVisible}
        title="Day Closed"
        message="The cash session has been finalized. Summary report sent to owner."
        onClose={() => {
          setSuccessVisible(false);
          goBack();
        }}
      />
    </Screen>
  );
}

function BreakdownRow({ label, value, isNegative }: { label: string; value: string; isNegative?: boolean }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={[styles.breakdownValue, isNegative && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  calculationCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.sm,
  },
  calculationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  calculationHeaderTitle: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  calculationBody: {
    gap: spacing.md,
  },
  expectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expectedLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  expectedValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  ledgerBadge: {
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ledgerBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
  },
  divider: {
    backgroundColor: colors.surfaceOffset,
  },
  breakdownContainer: {
    gap: spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  breakdownValue: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  reconciliationCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.sm,
    gap: spacing.md,
  },
  inputGroup: {
    gap: spacing.sm,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  largeInput: {
    height: 64,
    fontSize: 24,
    fontWeight: fontWeight.black,
    backgroundColor: colors.bg,
  },
  input: {
    backgroundColor: colors.bg,
  },
  inputOutline: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  inputOutlineSmall: {
    borderRadius: 10,
  },
  mismatchAlert: {
    backgroundColor: 'rgba(220, 38, 38, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.15)',
    borderRadius: 14,
    padding: spacing.md,
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
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },
  alertAmount: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.danger,
  },
  balancedAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(22, 163, 74, 0.05)',
    padding: spacing.md,
    borderRadius: 14,
    justifyContent: 'center',
  },
  balancedText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.success,
  },
  otherEntries: {
    gap: spacing.md,
  },
  inlineInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineLabel: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  smallInlineInput: {
    width: 100,
    textAlign: 'right',
    backgroundColor: 'transparent',
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  confirmationSection: {
    marginTop: spacing.sm,
  },
  checkboxLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },
});
