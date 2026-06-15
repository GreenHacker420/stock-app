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
import { 
  Text, 
  Icon, 
  Searchbar, 
  List, 
  Divider, 
  Switch, 
  SegmentedButtons,
  TextInput
} from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";

import { useShopsQuery } from "../../hooks/useShops";
import { useCustomersQuery } from "../../hooks/useCustomers";
import { useAddPaymentMutation } from "../../hooks/usePayments";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { goBack } from "../navigation-ref";

const paymentModes = [
  { label: "Cash", value: "CASH", icon: "cash" },
  { label: "UPI", value: "UPI", icon: "qrcode" },
  { label: "Card", value: "CARD", icon: "credit-card" },
  { label: "Bank", value: "BANK", icon: "bank" },
  { label: "Cheque", value: "CHEQUE", icon: "file-document-edit-outline" },
] as const;

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function TakePayment() {
  const { activeShopId } = useShopStore();
  const route = useRoute<any>();

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
  const [showMetadata, setShowMetadata] = useState(false);

  const shopsQuery = useShopsQuery();
  const activeShop = shopsQuery.data?.find(s => s.id === activeShopId);
  const customersQuery = useCustomersQuery();

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return [];
    return (customersQuery.data ?? []).filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.phone && c.phone.includes(searchQuery))
    ).slice(0, 5);
  }, [customersQuery.data, searchQuery]);

  const selectedCustomer = useMemo(() => 
    customersQuery.data?.find(c => c.id === customerId), 
    [customersQuery.data, customerId]
  );

  const paymentMutation = useAddPaymentMutation();

  const handleConfirmPayment = () => {
    paymentMutation.mutate({
      customerId: isWalkin ? undefined : customerId,
      orderId,
      paymentMode,
      amount: Number(amount),
      referenceNumber: reference || undefined,
      notes: notes || (upiOption === 'GENERATE' ? 'Paid via generated QR' : undefined),
    }, {
      onSuccess: () => {
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
  };

  const upiPayload = useMemo(() => {
    if (!activeShop?.upiId || !amount) return "";
    const name = encodeURIComponent(activeShop.upiName || activeShop.name);
    return `upi://pay?pa=${activeShop.upiId}&pn=${name}&am=${amount}&cu=INR`;
  }, [activeShop, amount]);

  const showQrSection = paymentMode === 'UPI' && upiOption === 'GENERATE' && amount;

  // Keypad controls
  const handleKeyPress = (key: string) => {
    setErrorMsg(null);
    if (key === "⌫") {
      setAmount((prev: string) => prev.slice(0, -1));
    } else if (key === ".") {
      if (amount.includes(".")) return;
      setAmount((prev: string) => (prev === "" ? "0." : prev + "."));
    } else {
      if (amount === "0" && key === "0") return;
      if (amount === "0") {
        setAmount(key);
      } else {
        const parts = amount.split(".");
        if (parts[1] && parts[1].length >= 2) return;
        setAmount((prev: string) => prev + key);
      }
    }
  };

  const handlePresetPress = (val: number) => {
    setErrorMsg(null);
    const current = Number(amount) || 0;
    setAmount((current + val).toString());
  };

  const handleClear = () => {
    setErrorMsg(null);
    setAmount("");
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <AppHeader title="Take Payment" subtitle="Record POS collections" />
        
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Curved Brand Customer Header Card */}
          <View style={styles.customerCard}>
            <View style={styles.customerHeader}>
              <Text style={styles.customerLabel}>Customer Info</Text>
              <View style={styles.walkinToggleContainer}>
                <Text style={styles.walkinToggleLabel}>Walk-in</Text>
                <Switch 
                  value={isWalkin} 
                  onValueChange={(v) => { setIsWalkin(v); if(v) setCustomerId(undefined); }} 
                  color={colors.primaryLight}
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              </View>
            </View>

            {!isWalkin ? (
              <View style={styles.customerSelection}>
                {!selectedCustomer ? (
                  <Searchbar
                    placeholder="Search name or phone..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={styles.searchBar}
                    inputStyle={styles.searchInput}
                    iconColor={colors.primary}
                  />
                ) : (
                  <View style={styles.selectedCustomerCard}>
                     <View style={styles.customerRow}>
                        <View style={styles.customerAvatar}>
                          <Text style={styles.customerAvatarText}>
                            {selectedCustomer.name[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.flex1}>
                           <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                           <Text style={styles.customerPhone}>{selectedCustomer.phone}{orderId ? ` • Linked Order` : ""}</Text>
                        </View>
                     </View>
                     <Pressable 
                       onPress={() => { setCustomerId(undefined); setOrderId(undefined); }}
                       style={({ pressed }) => [styles.changeCustButton, pressed && styles.pressed]}
                     >
                       <Text style={styles.changeCustText}>Change</Text>
                     </Pressable>
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
            ) : (
              <View style={styles.customerRow}>
                <View style={styles.customerAvatar}>
                  <Text style={styles.customerAvatarText}>W</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.customerName}>Walk-in Customer</Text>
                  <Text style={styles.customerPhone}>No linked profile</Text>
                </View>
              </View>
            )}
          </View>

          {/* Amount Received Display */}
          <View style={styles.amountDisplayContainer}>
            <Text style={styles.amountCurrency}>AMOUNT RECEIVED</Text>
            <Text style={styles.amountValue}>₹{amount || "0"}</Text>
          </View>

          {/* Amount Presets Row */}
          <View style={styles.presetsRow}>
            <Pressable style={styles.presetButton} onPress={() => handlePresetPress(100)}>
              <Text style={styles.presetText}>+100</Text>
            </Pressable>
            <Pressable style={styles.presetButton} onPress={() => handlePresetPress(500)}>
              <Text style={styles.presetText}>+500</Text>
            </Pressable>
            <Pressable style={styles.presetButton} onPress={() => handlePresetPress(1000)}>
              <Text style={styles.presetText}>+1000</Text>
            </Pressable>
            <Pressable style={styles.presetButton} onPress={() => handlePresetPress(5000)}>
              <Text style={styles.presetText}>+5000</Text>
            </Pressable>
            <Pressable style={styles.clearButton} onPress={handleClear}>
              <Text style={styles.clearText}>CLEAR</Text>
            </Pressable>
          </View>

          {/* Payment Methods Slider-Row */}
          <View style={styles.methodsContainer}>
            <View style={styles.methodsList}>
              {paymentModes.map(mode => {
                const isActive = paymentMode === mode.value;
                return (
                  <Pressable 
                    key={mode.value} 
                    onPress={() => { if(!paymentMutation.isPending) { setPaymentMode(mode.value); setErrorMsg(null); } }}
                    style={[
                      styles.methodTab,
                      isActive && styles.methodTabActive
                    ]}
                  >
                    <Icon 
                      source={mode.icon} 
                      size={20} 
                      color={isActive ? "white" : colors.textSecondary} 
                    />
                    <Text style={[
                      styles.methodTabLabel,
                      isActive && styles.methodTabLabelActive
                    ]}>
                      {mode.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Conditionally rendered UPI Config / QR */}
          {paymentMode === 'UPI' && (
            <View style={styles.upiOptionsContainer}>
               <SegmentedButtons
                  value={upiOption}
                  onValueChange={v => setUpiOption(v as any)}
                  buttons={[
                    { value: "REGISTER", label: "Shop QR", icon: "qrcode" },
                    { value: "GENERATE", label: "Dynamic QR", icon: "plus-box-outline" },
                  ]}
                  theme={{ colors: { primary: colors.primary } }}
                  style={styles.segmentedButtons}
               />
               
               {upiOption === 'GENERATE' && !activeShop?.upiId && (
                  <View style={styles.alertCard}>
                     <Icon source="alert-circle-outline" size={20} color={colors.warning} />
                     <Text style={styles.alertText}>
                        UPI ID not configured. Use physical QR instead.
                     </Text>
                  </View>
               )}
            </View>
          )}

          {/* Contextual Keypad vs Dynamic QR Area */}
          {showQrSection && activeShop?.upiId ? (
            <View style={styles.qrCard}>
               <QRCode value={upiPayload} size={150} />
               <View style={styles.qrInfo}>
                  <Text style={styles.qrAmount}>₹{amount}</Text>
                  <Text style={styles.qrInstructions}>Verify payment on your phone before saving.</Text>
               </View>
               <View style={styles.qrActions}>
                  <Button 
                     variant="ghost" 
                     label="Cancel QR" 
                     onPress={() => setUpiOption("REGISTER")}
                     style={styles.flex1}
                  />
                  <Button 
                     variant="success" 
                     label="Done" 
                     onPress={handleConfirmPayment}
                     loading={paymentMutation.isPending}
                     style={styles.flex1}
                     icon={<Icon source="check-circle" size={18} color={colors.textInverse} />}
                  />
               </View>
            </View>
          ) : (
            /* Custom POS Numeric Keypad */
            <View style={styles.keypadContainer}>
              <View style={styles.keypadRow}>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("1")}><Text style={styles.keypadButtonText}>1</Text></Pressable>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("2")}><Text style={styles.keypadButtonText}>2</Text></Pressable>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("3")}><Text style={styles.keypadButtonText}>3</Text></Pressable>
              </View>
              <View style={styles.keypadRow}>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("4")}><Text style={styles.keypadButtonText}>4</Text></Pressable>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("5")}><Text style={styles.keypadButtonText}>5</Text></Pressable>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("6")}><Text style={styles.keypadButtonText}>6</Text></Pressable>
              </View>
              <View style={styles.keypadRow}>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("7")}><Text style={styles.keypadButtonText}>7</Text></Pressable>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("8")}><Text style={styles.keypadButtonText}>8</Text></Pressable>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("9")}><Text style={styles.keypadButtonText}>9</Text></Pressable>
              </View>
              <View style={styles.keypadRow}>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress(".")}><Text style={styles.keypadButtonText}>.</Text></Pressable>
                <Pressable style={styles.keypadButton} onPress={() => handleKeyPress("0")}><Text style={styles.keypadButtonText}>0</Text></Pressable>
                <Pressable style={[styles.keypadButton, styles.keypadBackspace]} onPress={() => handleKeyPress("⌫")}>
                  <Icon source="backspace-outline" size={22} color={colors.textPrimary} />
                </Pressable>
              </View>
            </View>
          )}

          {/* Collapsible Metadata Toggle */}
          <View style={styles.metadataContainer}>
            <Pressable 
              onPress={() => setShowMetadata(!showMetadata)}
              style={styles.metadataToggle}
            >
              <Text style={styles.metadataToggleText}>
                {showMetadata ? "Hide additional details" : "Add notes & references"}
              </Text>
              <Icon 
                source={showMetadata ? "chevron-up" : "chevron-down"} 
                size={18} 
                color={colors.primary} 
              />
            </Pressable>

            {showMetadata && (
              <View style={styles.metadataFields}>
                {paymentMode !== 'CASH' && (upiOption === 'REGISTER' || paymentMode !== 'UPI') && (
                  <TextInput
                     mode="outlined"
                     label={paymentMode === 'CHEQUE' ? "Cheque Number" : "Reference / UTR Number"}
                     value={reference}
                     onChangeText={setReference}
                     style={styles.metadataInput}
                     outlineStyle={styles.inputOutline}
                     activeOutlineColor={colors.primary}
                  />
                )}

                <TextInput
                   mode="outlined"
                   label="Notes (Optional)"
                   value={notes}
                   onChangeText={setNote}
                   multiline
                   numberOfLines={2}
                   style={styles.metadataInput}
                   outlineStyle={styles.inputOutline}
                   activeOutlineColor={colors.primary}
                />
              </View>
            )}
          </View>

          {errorMsg ? (
            <View style={styles.errorContainer}>
              <Icon source="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Footer Confirm Action */}
        {!showQrSection && (
          <View style={styles.footer}>
            <Button
              label="CONFIRM PAYMENT"
              variant="success"
              disabled={!amount || Number(amount) <= 0}
              loading={paymentMutation.isPending}
              onPress={handleConfirmPayment}
              fullWidth
              size="lg"
              icon={<Icon source="check-circle" size={18} color="white" />}
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
          goBack();
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
    paddingBottom: 120,
  },
  customerCard: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    padding: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
    ...shadow.md,
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  walkinToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  walkinToggleLabel: {
    color: 'white',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  customerSelection: {
    gap: spacing.sm,
  },
  searchBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: radius.md,
    elevation: 0,
    height: 44,
  },
  searchInput: {
    fontSize: fontSize.sm,
    minHeight: 44,
  },
  searchResults: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
  },
  selectedCustomerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: spacing.md,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  customerAvatarText: {
    color: 'white',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  customerName: {
    color: 'white',
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.md,
  },
  customerPhone: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  changeCustButton: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  changeCustText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: fontWeight.bold,
  },
  amountDisplayContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  amountCurrency: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  amountValue: {
    fontSize: fontSize.huge,
    fontWeight: fontWeight.black,
    color: colors.primary,
    letterSpacing: -1,
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.1)',
  },
  clearText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },
  methodsContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  methodsList: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceOffset,
    borderRadius: 20,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodTab: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  methodTabActive: {
    backgroundColor: colors.primary,
    ...shadow.sm,
  },
  methodTabLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  methodTabLabelActive: {
    color: 'white',
  },
  upiOptionsContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  segmentedButtons: {
    height: 40,
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
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.lg,
    ...shadow.sm,
  },
  qrInfo: {
    alignItems: 'center',
    gap: 4,
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
  },
  qrActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  keypadContainer: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  keypadButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  keypadButtonText: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  keypadBackspace: {
    backgroundColor: colors.surfaceOffset,
  },
  metadataContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  metadataToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  metadataToggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  metadataFields: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  metadataInput: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.lg,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  flex1: {
    flex: 1,
  },
});
