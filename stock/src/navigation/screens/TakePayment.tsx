import { useMemo, useState } from "react";
import { 
  ScrollView, 
  View, 
  Pressable, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  Alert
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Text,
  Icon,
  List,
  Divider,
  Switch,
  SegmentedButtons,
  TextInput
} from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDebounce } from "use-debounce";

import { useShopsQuery } from "../../hooks/useShops";
import { useCustomersQuery } from "../../hooks/useCustomers";
import { useAddPaymentMutation } from "../../hooks/usePayments";
import { useAuthStore } from "../../auth/auth-store";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { filterCachedCustomers } from "../../utils/mmkvCache";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppSearchBar } from "../../components/ui/AppSearchBar";
import { Button } from "../../components/ui/Button";
import { FormTextField } from "../../components/forms/FormTextField";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { goBack } from "../navigation-ref";

const paymentModes = [
  { label: "Cash", value: "CASH", icon: "cash" },
  { label: "UPI", value: "UPI", icon: "qrcode" },
  { label: "Card", value: "CARD", icon: "credit-card" },
  { label: "Bank", value: "BANK_TRANSFER", icon: "bank" },
  { label: "Cheque", value: "CHEQUE", icon: "file-document-edit-outline" },
] as const;

const getPaymentModeColor = (mode: string) => {
  switch (mode) {
    case "CASH":
      return "#16a34a"; // Emerald Green
    case "UPI":
      return "#7c3aed"; // Royal Violet
    case "CARD":
      return "#2563eb"; // Deep Cobalt
    case "BANK_TRANSFER":
      return "#4f46e5"; // Indigo Blue
    case "CHEQUE":
      return "#ea580c"; // Warm Rust
    default:
      return colors.primary;
  }
};

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
const internetRequiredMessage = "Internet connection required. Please connect to the internet to complete this action.";

const haptic = (s: "light" | "medium" = "light") => {
  if (Platform.OS !== "web") {
    void Haptics.impactAsync(
      s === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    ).catch(() => {});
  }
};

export function TakePayment() {
  const { activeShopId } = useShopStore();
  const route = useRoute<any>();
  const network = useNetworkStatus();
  const insets = useSafeAreaInsets();

  const [isWalkin, setIsWalkin] = useState(!route.params?.customerId);
  const isTabBarVisible = route.name === "StaffPayments";
  const bottomPadding = isTabBarVisible 
    ? (insets.bottom > 0 ? insets.bottom + 80 : 100) 
    : (insets.bottom > 0 ? insets.bottom : spacing.lg);
  const [customerId, setCustomerId] = useState<string | undefined>(route.params?.customerId);
  const [saleId] = useState<string | undefined>(route.params?.saleId);
  const [orderId, setOrderId] = useState<string | undefined>(route.params?.orderId);
  const [dmId, setDmId] = useState<string | undefined>(route.params?.dmId);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
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
  const customersQuery = useCustomersQuery({
    search: debouncedSearchQuery,
    limit: debouncedSearchQuery ? 20 : 50,
    enabled: !network.isOffline,
  });
  const localCustomersQuery = useQuery({
    queryKey: ["cached-customers", activeShopId, debouncedSearchQuery],
    queryFn: () => filterCachedCustomers(activeShopId ?? "", debouncedSearchQuery),
    enabled: !!activeShopId && network.isOffline,
  });
  const mergedCustomers = useMemo(() => {
    return network.isOffline ? (localCustomersQuery.data ?? []) : (customersQuery.data ?? []);
  }, [customersQuery.data, localCustomersQuery.data, network.isOffline]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return [];
    return mergedCustomers.slice(0, 5);
  }, [mergedCustomers, searchQuery]);

  const selectedCustomer = useMemo(() => 
    mergedCustomers.find((c: any) => c.id === customerId), 
    [mergedCustomers, customerId]
  );

  const paymentMutation = useAddPaymentMutation();

  const handleConfirmPayment = () => {
    if (network.isOffline) {
      Alert.alert("Internet required", internetRequiredMessage);
      return;
    }
    paymentMutation.mutate({
      customerId: isWalkin ? undefined : customerId,
      saleId,
      orderId,
      dmId,
      paymentMode,
      amount: Number(amount),
      referenceNumber: reference || undefined,
      notes: notes || (upiOption === 'GENERATE' ? 'Paid via generated QR' : undefined),
    }, {
      onSuccess: () => {
        setSuccessVisible(true);
      },
      onError: (err: any) => {
        if (String(err?.message || "").toLowerCase().includes("network")) {
          Alert.alert("Internet required", internetRequiredMessage);
        } else {
          setErrorMsg(err.message || "Failed to record payment");
        }
      }
    });
  };

  const upiPayload = useMemo(() => {
    if (!activeShop?.upiId || !amount) return "";
    const name = encodeURIComponent(activeShop.upiName || activeShop.name);
    return `upi://pay?pa=${activeShop.upiId}&pn=${name}&am=${amount}&cu=INR`;
  }, [activeShop, amount]);

  const showQrSection = paymentMode === 'UPI' && upiOption === 'GENERATE' && amount && !!activeShop?.upiId;

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >

        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
        >
          {/* Curved Brand Customer Header Card */}
          <View style={styles.customerCard}>
            <View style={styles.customerHeader}>
              <Text style={styles.customerLabel}>Customer Info</Text>
              
              {/* Custom Toggle Pills */}
              <View style={styles.toggleRow}>
                <Pressable
                  onPress={() => { haptic(); setIsWalkin(true); setCustomerId(undefined); }}
                  style={[styles.togglePill, isWalkin && styles.togglePillActive]}
                >
                  <Icon source="walk" size={12} color={isWalkin ? colors.primary : colors.textMuted} />
                  <Text style={[styles.togglePillText, isWalkin && styles.togglePillTextActive]}>Walk-in</Text>
                </Pressable>
                <Pressable
                  onPress={() => { haptic(); setIsWalkin(false); }}
                  style={[styles.togglePill, !isWalkin && styles.togglePillActive]}
                >
                  <Icon source="account-search-outline" size={12} color={!isWalkin ? colors.primary : colors.textMuted} />
                  <Text style={[styles.togglePillText, !isWalkin && styles.togglePillTextActive]}>Search</Text>
                </Pressable>
              </View>
            </View>

            {!isWalkin ? (
              <View style={styles.customerSelection}>
                {!selectedCustomer ? (
                  <AppSearchBar
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
                        <View style={[styles.customerAvatar, styles.customerAvatarTint]}>
                          <Text style={styles.customerAvatarTextTint}>
                            {selectedCustomer.name[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.flex1}>
                           <Text style={styles.customerNameText}>{selectedCustomer.name}</Text>
                           <Text style={styles.customerPhoneText}>
                             {selectedCustomer.phone}
                             {orderId ? " • Linked Order" : dmId ? " • Linked Delivery Memo" : ""}
                           </Text>
                        </View>
                     </View>
                     <Pressable 
                       onPress={() => { setCustomerId(undefined); setOrderId(undefined); setDmId(undefined); }}
                       style={({ pressed }) => [styles.changeCustButton, pressed ? styles.pressed : undefined].filter(Boolean) as any}
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
                        description={customer.phone || "No phone"}
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
                <View style={[styles.customerAvatar, styles.walkinAvatar]}>
                  <Text style={styles.customerAvatarTextTint}>W</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.customerNameText}>Walk-in Customer</Text>
                  <Text style={styles.customerPhoneText}>No linked profile</Text>
                </View>
              </View>
            )}
          </View>

          {/* Amount Received Display (Digital POS Theme) */}
          <View style={styles.amountDisplayContainer}>
            <Text style={styles.amountCurrency}>AMOUNT RECEIVED</Text>
            <View style={styles.amountDisplayRow}>
              <Text style={styles.amountSymbol}>₹</Text>
              <Text style={styles.amountValue}>{amount || "0"}</Text>
              <Text style={styles.blinkingCursor}>|</Text>
            </View>
          </View>

          {/* Amount Presets Row (Tactile Capsules) */}
          <View style={styles.presetsRow}>
            {([100, 500, 1000, 5000] as const).map((val) => (
              <Pressable
                key={val}
                style={({ pressed }) => [styles.presetButton, pressed ? styles.pressed : undefined].filter(Boolean) as any}
                onPress={() => handlePresetPress(val)}
              >
                <Text style={styles.presetText}>+{val}</Text>
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed ? styles.pressed : undefined].filter(Boolean) as any}
              onPress={handleClear}
            >
              <Text style={styles.clearText}>CLEAR</Text>
            </Pressable>
          </View>

          {/* Payment Methods Slider-Row (Dynamic Selection Themes) */}
          <View style={styles.methodsContainer}>
            <View style={styles.methodsList}>
              {paymentModes.map(mode => {
                const isActive = paymentMode === mode.value;
                const activeColor = getPaymentModeColor(mode.value);
                return (
                  <Pressable 
                    key={mode.value} 
                    onPress={() => { if(!paymentMutation.isPending) { setPaymentMode(mode.value); setErrorMsg(null); } }}
                    style={({ pressed }) => [
                      styles.methodTab,
                      isActive ? { backgroundColor: activeColor } : undefined,
                      pressed ? styles.pressed : undefined
                    ].filter(Boolean) as any}
                  >
                    <Icon 
                      source={mode.icon} 
                      size={18} 
                      color={isActive ? "white" : colors.textSecondary} 
                    />
                    <Text style={[
                      styles.methodTabLabel,
                      isActive ? styles.methodTabLabelActive : undefined
                    ].filter(Boolean) as any}>
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
               <View style={styles.qrHeader}>
                 <Icon source="qrcode-scan" size={24} color={getPaymentModeColor("UPI")} />
                 <Text style={styles.qrTitle}>DYNAMIC PAY QR</Text>
               </View>
               <View style={styles.qrFrame}>
                 <QRCode value={upiPayload} size={160} />
               </View>
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
                     label="Confirm Paid" 
                     onPress={handleConfirmPayment}
                     loading={paymentMutation.isPending}
                     style={styles.flex1}
                     icon={<Icon source="check-circle" size={18} color={colors.textInverse} />}
                  />
               </View>
            </View>
          ) : (
            /* Custom POS Numeric Keypad (Tactile Registered Theme) */
            <View style={styles.keypadContainer}>
              {[
                ["1", "2", "3"],
                ["4", "5", "6"],
                ["7", "8", "9"],
                [".", "0", "⌫"]
              ].map((row, rIdx) => (
                <View key={rIdx} style={styles.keypadRow}>
                  {row.map((key) => {
                    const isBackspace = key === "⌫";
                    return (
                      <Pressable
                        key={key}
                        style={({ pressed }) => [
                          styles.keypadButton,
                          isBackspace ? styles.keypadBackspace : undefined,
                          pressed ? (isBackspace ? styles.keypadBackspacePressed : styles.keypadButtonPressed) : undefined
                        ].filter(Boolean) as any}
                        onPress={() => handleKeyPress(key)}
                      >
                        {isBackspace ? (
                          <Icon source="backspace-outline" size={22} color="#ffffff" />
                        ) : (
                          <Text style={styles.keypadButtonText}>{key}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {/* Collapsible Metadata Accordion */}
          <View style={[
            styles.metadataContainer,
            showMetadata ? styles.metadataContainerExpanded : undefined
          ].filter(Boolean) as any}>
            <Pressable 
              onPress={() => setShowMetadata(!showMetadata)}
              style={({ pressed }) => [
                styles.metadataToggle,
                pressed ? styles.pressed : undefined
              ].filter(Boolean) as any}
            >
              <View style={styles.metadataToggleRow}>
                <Icon source="note-edit-outline" size={18} color={colors.primary} />
                <Text style={styles.metadataToggleText}>
                  {showMetadata ? "Hide additional details" : "Add notes & references"}
                </Text>
              </View>
              <Icon 
                source={showMetadata ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={colors.primary} 
              />
            </Pressable>

            {showMetadata && (
              <View style={styles.metadataFields}>
                {paymentMode !== 'CASH' && (upiOption === 'REGISTER' || paymentMode !== 'UPI') && (
                  <FormTextField
                     label={paymentMode === 'CHEQUE' ? "Cheque Number" : "Reference / UTR Number"}
                     value={reference}
                     onChangeText={setReference}
                     placeholder={paymentMode === 'CHEQUE' ? "e.g. 123456" : "e.g. UTR12345678"}
                  />
                )}

                <FormTextField
                   label="Notes (Optional)"
                   value={notes}
                   onChangeText={setNote}
                   multiline
                   numberOfLines={2}
                   placeholder="Add internal notes about this payment..."
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
          <View style={[
            isTabBarVisible ? styles.tabFooter : styles.stackFooter,
            { paddingBottom: bottomPadding }
          ]}>
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
        title={network.isOffline ? "Payment Saved Offline" : "Payment Recorded"}
        message={network.isOffline ? `Received ${money(amount)} via ${paymentMode}. It will sync when internet is back.` : `Received ${money(amount)} via ${paymentMode}.`}
        onClose={() => {
          setSuccessVisible(false);
          setAmount("");
          setReference("");
          setNote("");
          setUpiOption("REGISTER");
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 150, // ensures the Confirm button scrolls completely clear of floating tabs
  },
  tabHeaderSpacer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  tabTitle: {
    fontSize: 26,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  tabSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
  customerCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.sm,
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.full,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  togglePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  togglePillActive: {
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  togglePillText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  togglePillTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  customerSelection: {
    gap: spacing.sm,
  },
  searchBar: {
    backgroundColor: colors.surfaceOffset,
    borderWidth: 0,
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
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  customerAvatarTint: {
    backgroundColor: colors.primaryLight,
    borderColor: "rgba(30,64,175,0.1)",
  },
  walkinAvatar: {
    backgroundColor: colors.successLight,
    borderColor: "rgba(22,163,74,0.1)",
  },
  customerAvatarTextTint: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  customerNameText: {
    color: colors.textPrimary,
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.md,
  },
  customerPhoneText: {
    color: colors.textSecondary,
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
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceOffset, // Light premium panel
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    ...shadow.sm,
  },
  amountCurrency: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  amountDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountSymbol: {
    fontSize: 24,
    fontWeight: fontWeight.bold,
    color: colors.primary, // Clean green symbol
    marginRight: 4,
    marginTop: 2,
  },
  amountValue: {
    fontSize: 38,
    fontWeight: fontWeight.black,
    color: colors.textPrimary, // Charcoal black text
    letterSpacing: -0.5,
  },
  blinkingCursor: {
    fontSize: 34,
    fontWeight: fontWeight.regular,
    color: colors.primary,
    marginLeft: 2,
    opacity: 0.8,
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  presetText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  clearButton: {
    flex: 1.2,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  clearText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.danger,
    letterSpacing: 0.5,
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
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  methodTab: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  methodTabLabel: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    borderColor: 'rgba(217, 119, 6, 0.4)',
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
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.md,
  },
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  qrTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 1.5,
  },
  qrFrame: {
    padding: spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
    paddingHorizontal: spacing.lg,
    gap: 8,
    marginBottom: spacing.md,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  keypadButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#f8fafc', // Beautiful off-white
    borderWidth: 1,
    borderColor: '#e2e8f0', // Soft border
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  keypadButtonPressed: {
    backgroundColor: '#e2e8f0',
    borderColor: '#cbd5e1',
  },
  keypadButtonText: {
    fontSize: 22,
    fontWeight: fontWeight.extrabold,
    color: '#0f172a', // Deep high-contrast slate text
  },
  keypadBackspace: {
    backgroundColor: '#0f172a', // Deep slate / black for backspace
    borderColor: '#0f172a',
  },
  keypadBackspacePressed: {
    backgroundColor: '#334155',
  },
  metadataContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  metadataContainerExpanded: {
    borderColor: colors.borderStrong,
  },
  metadataToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceOffset,
  },
  metadataToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metadataToggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  metadataFields: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  tabFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    backgroundColor: 'transparent',
  },
  stackFooter: {
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
