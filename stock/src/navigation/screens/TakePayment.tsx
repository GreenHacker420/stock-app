import React, { useEffect, useMemo, useState } from "react";
import { 
  ScrollView, 
  View, 
  Pressable, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Text, 
  TextInput, 
  SegmentedButtons, 
  Icon, 
  Searchbar, 
  List, 
  Divider, 
  Switch, 
  Card,
  Portal,
  Modal
} from "react-native-paper";
import { useRoute, useNavigation } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";

import { addPayment, fetchCustomers, fetchShops } from "../../api/client";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

const paymentModes = [
  { label: "Cash", value: "CASH", emoji: "💵", icon: "cash" },
  { label: "UPI", value: "UPI", emoji: "📱", icon: "qrcode-scan" },
  { label: "Card", value: "CARD", emoji: "💳", icon: "credit-card-outline" },
  { label: "Bank", value: "BANK", emoji: "🏦", icon: "bank-outline" },
  { label: "Cheque", value: "CHEQUE", emoji: "📝", icon: "book-outline" },
] as const;

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function TakePayment() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();
  const route = useRoute<any>();
  const navigation = useNavigation();

  const [isWalkin, setIsWalkin] = useState(!route.params?.customerId);
  const [customerId, setCustomerId] = useState<string | undefined>(route.params?.customerId);
  const [orderId, setOrderId] = useState<string | undefined>(route.params?.orderId);
  const [searchQuery, setSearchQuery] = useState("");
  const [amount, setAmount] = useState(route.params?.amount?.toString() || "");
  const [paymentMode, setPaymentMode] = useState<typeof paymentModes[number]["value"]>("CASH");
  const [upiOption, setUpiOption] = useState<"GENERATE" | "REGISTER">("REGISTER");
  const [reference, setReference] = useState("");
  const [notes, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const activeShop = shopsQuery.data?.find(s => s.id === activeShopId);

  const customersQuery = useQuery({
    queryKey: ["customers", activeShopId],
    queryFn: () => fetchCustomers(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return [];
    return (customersQuery.data ?? []).filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.phone && c.phone.includes(searchQuery))
    ).slice(0, 5);
  }, [customersQuery.data, searchQuery]);

  const selectedCustomer = useMemo(() => customersQuery.data?.find(c => c.id === customerId), [customersQuery.data, customerId]);

  const paymentMutation = useMutation({
    mutationFn: () =>
      addPayment(token ?? "", {
        shopId: activeShopId ?? "",
        customerId: isWalkin ? undefined : customerId,
        orderId,
        paymentMode,
        amount: Number(amount),
        referenceNumber: reference || undefined,
        notes: notes || (upiOption === 'GENERATE' ? 'Paid via generated QR' : undefined),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
      if (orderId) queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      setAmount("");
      setReference("");
      setNote("");
      setUpiOption("REGISTER");
      setSuccessVisible(true);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to record payment");
    }
  });

  const upiPayload = useMemo(() => {
    if (!activeShop?.upiId || !amount) return "";
    const name = encodeURIComponent(activeShop.upiName || activeShop.name);
    return `upi://pay?pa=${activeShop.upiId}&pn=${name}&am=${amount}&cu=INR`;
  }, [activeShop, amount]);

  const showQrSection = paymentMode === 'UPI' && upiOption === 'GENERATE' && amount;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <AppHeader title="Take Payment" subtitle="Record collections from customers" />
        
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Section title="Customer Information">
             <View style={styles.walkinRow}>
                <View>
                   <Text style={styles.walkinTitle}>Walk-in Customer</Text>
                   <Text style={styles.walkinSubtitle}>Payment without linking profile</Text>
                </View>
                <Switch 
                  value={isWalkin} 
                  onValueChange={(v) => { setIsWalkin(v); if(v) setCustomerId(undefined); }} 
                  color={colors.primary} 
                />
             </View>

             {!isWalkin && (
               <View style={styles.customerSelection}>
                 {!selectedCustomer ? (
                   <Searchbar
                     placeholder="Search customer name or phone..."
                     onChangeText={setSearchQuery}
                     value={searchQuery}
                     style={styles.searchBar}
                     inputStyle={styles.searchInput}
                   />
                 ) : (
                   <View style={styles.selectedCustomerCard}>
                      <View style={styles.selectedCustomerInfo}>
                         <Text style={styles.selectedCustomerName}>{selectedCustomer.name}</Text>
                         <Text style={styles.selectedCustomerPhone}>{selectedCustomer.phone}{orderId ? ` • Linked to Order` : ""}</Text>
                      </View>
                      <Button variant="ghost" label="Change" size="sm" onPress={() => { setCustomerId(undefined); setOrderId(undefined); }} />
                   </View>
                 )}
                 {searchQuery ? (
                   <View style={styles.searchResults}>
                     {filteredCustomers.map(customer => (
                       <List.Item
                         key={customer.id}
                         title={customer.name}
                         description={customer.phone}
                         onPress={() => {
                           setCustomerId(customer.id);
                           setSearchQuery("");
                         }}
                         right={props => <List.Icon {...props} icon="account-check-outline" color={colors.primary} />}
                       />
                     ))}
                   </View>
                 ) : null}
               </View>
             )}
          </Section>

          <Section title="Payment Details">
             <View style={styles.paymentCard}>
                <View style={styles.amountSection}>
                   <Text style={styles.inputLabel}>AMOUNT RECEIVED</Text>
                   <TextInput
                      mode="outlined"
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={amount}
                      onChangeText={setAmount}
                      disabled={paymentMutation.isPending}
                      style={styles.amountInput}
                      outlineStyle={styles.amountOutline}
                      left={<TextInput.Affix text="₹" />}
                   />
                </View>

                <View>
                   <Text style={styles.inputLabel}>PAYMENT METHOD</Text>
                   <View style={styles.methodsGrid}>
                      {paymentModes.map(mode => (
                        <Pressable 
                          key={mode.value} 
                          onPress={() => { if(!paymentMutation.isPending) { setPaymentMode(mode.value); setErrorMsg(null); } }}
                          style={[
                            styles.methodButton,
                            paymentMode === mode.value && styles.methodButtonActive
                          ]}
                        >
                          <Text style={styles.methodEmoji}>{mode.emoji}</Text>
                          <Text style={[
                            styles.methodLabel,
                            paymentMode === mode.value && styles.methodLabelActive
                          ]}>
                            {mode.label}
                          </Text>
                        </Pressable>
                      ))}
                   </View>
                </View>

                {paymentMode === 'UPI' && (
                  <View style={styles.upiOptions}>
                     <Text style={styles.inputLabel}>UPI OPTIONS</Text>
                     <SegmentedButtons
                        value={upiOption}
                        onValueChange={v => setUpiOption(v as any)}
                        buttons={[
                          { value: "REGISTER", label: "Shop QR", icon: "qrcode" },
                          { value: "GENERATE", label: "Dynamic QR", icon: "plus-box-outline" },
                        ]}
                        theme={{ colors: { primary: colors.primary } }}
                     />
                     
                     {upiOption === 'GENERATE' && !activeShop?.upiId && (
                        <View style={styles.alertCard}>
                           <Icon source="alert-circle-outline" size={20} color={colors.warning} />
                           <Text style={styles.alertText}>
                              UPI ID not configured. Use physical QR instead.
                           </Text>
                        </View>
                     )}

                     {showQrSection && activeShop?.upiId && (
                        <View style={styles.qrCard}>
                           <QRCode value={upiPayload} size={180} />
                           <View style={styles.qrInfo}>
                              <Text style={styles.qrAmount}>₹{amount}</Text>
                              <Text style={styles.qrInstructions}>Mandatory: Verify on your phone first.</Text>
                           </View>
                           
                           <View style={styles.qrActions}>
                              <Button 
                                 variant="ghost" 
                                 label="Cancel QR" 
                                 onPress={() => setUpiOption("REGISTER")}
                                 style={{ flex: 1 }}
                              />
                              <Button 
                                 variant="success" 
                                 label="Done" 
                                 onPress={() => paymentMutation.mutate()}
                                 loading={paymentMutation.isPending}
                                 style={{ flex: 1 }}
                                 icon={<Icon source="check-circle" size={18} color={colors.textInverse} />}
                              />
                           </View>
                        </View>
                     )}
                  </View>
                )}

                {paymentMode !== 'CASH' && (upiOption === 'REGISTER' || paymentMode !== 'UPI') && (
                  <TextInput
                     mode="outlined"
                     label={paymentMode === 'CHEQUE' ? "Cheque Number" : "Reference / UTR Number"}
                     value={reference}
                     onChangeText={setReference}
                     style={styles.input}
                     outlineStyle={styles.inputOutline}
                  />
                )}

                <TextInput
                   mode="outlined"
                   label="Notes (Optional)"
                   value={notes}
                   onChangeText={setNote}
                   multiline
                   numberOfLines={2}
                   style={styles.input}
                   outlineStyle={styles.inputOutline}
                />

                {errorMsg && (
                  <View style={styles.errorCard}>
                     <Icon source="alert-circle" size={16} color={colors.danger} />
                     <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                )}
             </View>
          </Section>
        </ScrollView>

        {!showQrSection && (
          <View style={styles.footer}>
            <View style={styles.totalDisplay}>
               <Text style={styles.totalLabel}>TOTAL TO RECORD</Text>
               <Text style={styles.totalValue}>₹{amount || "0"}</Text>
            </View>
            <Button
              label="CONFIRM PAYMENT"
              variant="success"
              disabled={!amount || Number(amount) <= 0}
              loading={paymentMutation.isPending}
              onPress={() => paymentMutation.mutate()}
              fullWidth
              size="lg"
            />
          </View>
        )}
      </KeyboardAvoidingView>

      <SuccessModal
        visible={successVisible}
        title="Payment Recorded"
        message={`Received ${money(amount)} via ${paymentMode}.`}
        onClose={() => {
          setSuccessVisible(false);
          navigation.goBack();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 160,
  },
  walkinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  walkinTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  walkinSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  customerSelection: {
    gap: spacing.sm,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
  searchResults: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
    zIndex: 50,
  },
  selectedCustomerCard: {
    backgroundColor: colors.primaryLight,
    padding: spacing.lg,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(30, 64, 175, 0.1)',
  },
  selectedCustomerInfo: {
    flex: 1,
  },
  selectedCustomerName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
  },
  selectedCustomerPhone: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  paymentCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xl,
    ...shadow.sm,
  },
  amountSection: {
    gap: spacing.sm,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  amountInput: {
    backgroundColor: colors.surface,
    height: 64,
  },
  amountOutline: {
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  methodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  methodButton: {
    flex: 1,
    minWidth: '30%',
    minHeight: 64,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
    ...shadow.md,
  },
  methodEmoji: {
    fontSize: 24,
  },
  methodLabel: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginTop: 2,
  },
  methodLabelActive: {
    color: colors.textInverse,
  },
  upiOptions: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceOffset,
    paddingTop: spacing.xl,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.2)',
  },
  alertText: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  qrCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    alignItems: 'center',
    gap: spacing.lg,
    ...shadow.md,
  },
  qrInfo: {
    alignItems: 'center',
  },
  qrAmount: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  qrInstructions: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: fontWeight.extrabold,
    textAlign: 'center',
    marginTop: 4,
  },
  qrActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.lg,
  },
  totalDisplay: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.black,
    color: colors.primary,
  }
});
