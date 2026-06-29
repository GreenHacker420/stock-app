import React, { useMemo, useState, memo, useCallback } from "react";
import { 
  View, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  TextInput as RNTextInput,
  ScrollView,
  Alert,
  Linking
} from "react-native";
import { Searchbar, Text, Icon, TextInput, SegmentedButtons, List, Divider } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { Item, Customer } from "../../api/client";
import { useItemsQuery } from "../../hooks/useItems";
import { useCreateSaleMutation } from "../../hooks/useSales";
import { useCustomersQuery } from "../../hooks/useCustomers";
import { useShopsQuery } from "../../hooks/useShops";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { useQuery } from "@tanstack/react-query";
import { filterCachedCustomers, filterCachedProducts } from "../../utils/mmkvCache";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { shareSaleInvoicePdf, printSaleInvoiceDirect } from "../../utils/pdf";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}
const internetRequiredMessage = "Internet connection required. Please connect to the internet to complete this action.";

const SaleItemCard = memo(({ 
  item, 
  quantity, 
  onAdd, 
  onRemove 
}: { 
  item: Item, 
  quantity: number, 
  onAdd: () => void, 
  onRemove: () => void 
}) => {
  const stockQty = item.availableStock ?? 0;
  const isOutOfStock = stockQty <= 0;
  const isMaxStockReached = quantity >= stockQty;
  const hasQty = quantity > 0;

  return (
    <View style={[
      styles.itemCard,
      hasQty && styles.itemCardActive
    ]}>
      {/* Left Icon Avatar */}
      <View style={[
        styles.itemAvatarContainer,
        hasQty && styles.itemAvatarContainerActive
      ]}>
        <Icon 
          source="package-variant-closed" 
          size={22} 
          color={hasQty ? colors.primary : colors.textSecondary} 
        />
      </View>

      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.itemSubtitle}>
            {item.sku || "No SKU"} • {money(item.defaultSellingPrice)} / {item.unit}
          </Text>
          {isOutOfStock ? (
            <View style={styles.outOfStockBadge}>
              <Text style={styles.outOfStockText}>OUT OF STOCK</Text>
            </View>
          ) : stockQty <= 10 ? (
            <View style={[styles.stockBadge, styles.stockBadgeLow]}>
              <Text style={[styles.stockText, styles.stockTextLow]}>Low Stock: {stockQty}</Text>
            </View>
          ) : (
            <View style={styles.stockBadge}>
              <Text style={styles.stockText}>Stock: {stockQty} {item.unit}</Text>
            </View>
          )}
        </View>
      </View>
      
      <View style={styles.quantityControls}>
        {quantity === 0 ? (
          <Pressable 
            onPress={onAdd}
            disabled={isOutOfStock}
            style={({ pressed }) => [
              styles.addButton,
              isOutOfStock && styles.disabledButton,
              pressed && !isOutOfStock && styles.buttonPressed
            ]}
          >
            <Icon source="plus" size={24} color={isOutOfStock ? colors.textMuted : colors.primary} />
            <Text style={[styles.addButtonLabel, isOutOfStock && styles.disabledButtonLabel]}>
              {isOutOfStock ? "NO STOCK" : "ADD"}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.counterRow}>
            <Pressable 
              onPress={onRemove}
              style={({ pressed }) => [
                styles.qtyButton,
                pressed && styles.buttonPressed
              ]}
            >
              <Icon source="minus" size={20} color={colors.primary} />
            </Pressable>
            
            <View style={styles.qtyDisplay}>
              <Text style={styles.qtyText}>{quantity}</Text>
            </View>
            
            <Pressable 
              onPress={onAdd}
              disabled={isMaxStockReached}
              style={({ pressed }) => [
                styles.qtyButton,
                isMaxStockReached && styles.disabledQtyButton,
                pressed && !isMaxStockReached && styles.buttonPressed
              ]}
            >
              <Icon source="plus" size={20} color={isMaxStockReached ? colors.textMuted : colors.primary} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}, (p, n) => p.item.id === n.item.id && p.quantity === n.quantity);

export function WalkInSale() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const { activeShopId } = useShopStore();
  const network = useNetworkStatus();
  const shopsQuery = useShopsQuery();

  const selectedShop = useMemo(() => 
    shopsQuery.data?.find(s => s.id === activeShopId), 
    [shopsQuery.data, activeShopId]
  );

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [cart, setCart] = useState<Record<string, { item: Item, quantity: number }>>({});
  
  const [completedSaleNumber, setCompletedSaleNumber] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Customer selection & search states
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDetailsExpanded, setCustomerDetailsExpanded] = useState(false);

  // Custom Walk-in Customer Info
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");

  // Step 2 Settlement inputs
  const [amountReceived, setAmountReceived] = useState("");
  const [notes, setNotes] = useState("");

  const itemsQuery = useItemsQuery({ search: debouncedSearch, limit: 50, enabled: !network.isOffline });
  const customersQuery = useCustomersQuery({ enabled: !network.isOffline });
  const localCustomersQuery = useQuery({
    queryKey: ["cached-customers", activeShopId, customerSearch],
    queryFn: () => filterCachedCustomers(activeShopId ?? "", customerSearch),
    enabled: !!activeShopId && network.isOffline,
  });
  const localItemsQuery = useQuery({
    queryKey: ["cached-items", activeShopId, debouncedSearch],
    queryFn: () => filterCachedProducts(activeShopId ?? "", debouncedSearch),
    enabled: !!activeShopId && network.isOffline,
  });
  const mergedCustomers = useMemo(() => {
    return network.isOffline ? (localCustomersQuery.data ?? []) : (customersQuery.data ?? []);
  }, [customersQuery.data, localCustomersQuery.data, network.isOffline]);
  const displayItems = useMemo(() => {
    if (!network.isOffline) return itemsQuery.data?.items ?? [];
    return localItemsQuery.data ?? [];
  }, [itemsQuery.data, localItemsQuery.data, network.isOffline]);

  const selectedCustomer = useMemo(() => 
    mergedCustomers.find((c: any) => c.id === customerId),
    [mergedCustomers, customerId]
  );

  const customerSummaryText = useMemo(() => {
    if (selectedCustomer) {
      return `Customer: ${selectedCustomer.name}`;
    }
    if (customerName.trim()) {
      return `Walk-in: ${customerName.trim()}`;
    }
    return "Default Walk-In (Anonymous)";
  }, [selectedCustomer, customerName]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    return mergedCustomers.filter((c: any) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearch))
    ).slice(0, 5);
  }, [mergedCustomers, customerSearch]);

  const cartArray = useMemo(() => Object.values(cart), [cart]);
  const cartItemCount = useMemo(() => cartArray.reduce((sum, i) => sum + i.quantity, 0), [cartArray]);
  const cartTotal = useMemo(() => cartArray.reduce((sum, i) => sum + (i.quantity * Number(i.item.defaultSellingPrice)), 0), [cartArray]);

  // Settlement Calculations
  const calculatedChange = useMemo(() => {
    const received = Number(amountReceived);
    if (isNaN(received) || received <= cartTotal) return 0;
    return received - cartTotal;
  }, [amountReceived, cartTotal]);

  const isPaymentValid = useMemo(() => {
    if (paymentMode === "UPI") return true;
    const received = Number(amountReceived);
    return !isNaN(received) && received >= cartTotal;
  }, [paymentMode, amountReceived, cartTotal]);

  const updateQuantity = useCallback((item: Item, delta: number) => {
    setCart(prev => {
      const current = prev[item.id] || { item, quantity: 0 };
      const nextQty = Math.max(0, current.quantity + delta);
      
      const nextCart = { ...prev };
      if (nextQty === 0) {
        delete nextCart[item.id];
      } else {
        nextCart[item.id] = { ...current, quantity: nextQty };
      }
      return nextCart;
    });
  }, []);

  const saleMutation = useCreateSaleMutation();

  const handleCompleteSale = () => {
    if (saleMutation.isPending) return;
    if (network.isOffline) {
      Alert.alert("Internet required", internetRequiredMessage);
      return;
    }
    saleMutation.mutate({
      items: cartArray.map(i => ({ 
        itemId: i.item.id, 
        quantity: i.quantity, 
        rate: Number(i.item.defaultSellingPrice) 
      })),
      isWalkin: !customerId,
      customerId: customerId || undefined,
      customerInfo: !customerId && (customerName || customerPhone) ? {
        name: customerName || undefined,
        phone: customerPhone || undefined,
      } : undefined,
      payments: [{
        paymentMode: paymentMode,
        amount: cartTotal
      }],
      notes: notes || undefined,
    }, {
      onSuccess: (res: any) => {
        setCompletedSale(res);
        setCompletedSaleNumber(res?.saleNumber || "N/A");
        setCurrentStep(3);
      },
      onError: (error: any) => {
        if (String(error?.message || "").toLowerCase().includes("network")) {
          Alert.alert("Internet required", internetRequiredMessage);
        }
      }
    });
  };

  const handleHeaderBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    } else {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate(user?.role === "OWNER" ? "OwnerDashboard" : "StaffWork");
      }
    }
  };

  const ProgressIndicator = ({ step }: { step: number }) => {
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressLineTrack}>
          <View style={styles.progressLine} />
          <View style={[styles.progressLineActive, { width: step === 2 ? '100%' : '0%' }]} />
        </View>
        
        <View style={styles.progressStepsRow}>
          {[1, 2].map((s) => {
            const isActive = s <= step;
            return (
              <View key={s} style={[
                styles.progressNode,
                isActive && styles.progressNodeActive
              ]}>
                {s === 1 && step > 1 ? (
                  <Icon source="check" size={14} color="#ffffff" />
                ) : (
                  <Text style={[
                    styles.progressNodeText,
                    isActive && styles.progressNodeTextActive
                  ]}>{s}</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const bottomPadding = insets.bottom > 0 ? insets.bottom + 12 : spacing.lg;
  const FlashListAny = FlashList as any;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {currentStep < 3 && (
          <>
            <AppHeader 
              title="Walk-in Sale" 
              subtitle={currentStep === 1 ? "Select items and customer info" : "Settle payment & complete"} 
              showBack={true} 
              onBack={handleHeaderBack}
            />
            <ProgressIndicator step={currentStep} />
          </>
        )}
        
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={[
            styles.scrollContent, 
            { paddingBottom: currentStep === 1 ? (cartItemCount > 0 ? 140 : 100) : 120 }
          ]}
        >
          {currentStep === 1 && (
            <View style={styles.stepContainer}>
              <Section title="Customer Details (Optional)">
                <Pressable
                  onPress={() => setCustomerDetailsExpanded(prev => !prev)}
                  style={styles.accordionHeader}
                >
                  <View style={styles.accordionLeft}>
                    <Icon source="account-outline" size={20} color={colors.textSecondary} />
                    <Text style={styles.accordionSummaryText}>{customerSummaryText}</Text>
                  </View>
                  <Icon 
                    source={customerDetailsExpanded ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color={colors.primary} 
                  />
                </Pressable>

                {customerDetailsExpanded && (
                  <View style={styles.formCard}>
                    {!selectedCustomer ? (
                      <>
                        <View style={styles.searchRow}>
                          <Searchbar
                            placeholder="Search existing customer..."
                            onChangeText={setCustomerSearch}
                            value={customerSearch}
                            style={[styles.searchBar, { flex: 1, marginBottom: 0 }]}
                            inputStyle={styles.searchInput}
                            elevation={0}
                          />
                          <Pressable 
                            onPress={() => navigation.navigate("AddEditCustomer")}
                            style={({ pressed }) => [styles.searchAddBtn, pressed && styles.pressed]}
                          >
                            <Icon source="account-plus" size={24} color={colors.primary} />
                          </Pressable>
                        </View>

                        {customerSearch && filteredCustomers.length > 0 ? (
                          <View style={styles.searchDropdown}>
                            {filteredCustomers.map(c => (
                              <List.Item
                                key={c.id}
                                title={c.name}
                                description={c.phone || "No phone"}
                                onPress={() => { setCustomerId(c.id); setCustomerSearch(""); }}
                                right={props => <List.Icon {...props} icon="account-check-outline" color={colors.primary} />}
                              />
                            ))}
                          </View>
                        ) : null}

                        <View style={styles.orRow}>
                          <Divider style={styles.orDivider} />
                          <Text style={styles.orText}>OR QUICK WALK-IN DETAILS</Text>
                          <Divider style={styles.orDivider} />
                        </View>

                        <TextInput
                          mode="outlined"
                          label="Customer Name"
                          value={customerName}
                          onChangeText={setCustomerName}
                          style={styles.input}
                          outlineStyle={styles.inputOutline}
                          left={<TextInput.Icon icon="account-outline" />}
                        />
                        <TextInput
                          mode="outlined"
                          label="Mobile Number"
                          value={customerPhone}
                          onChangeText={setCustomerPhone}
                          keyboardType="phone-pad"
                          style={styles.input}
                          outlineStyle={styles.inputOutline}
                          left={<TextInput.Icon icon="phone-outline" />}
                        />
                      </>
                    ) : (
                      <View style={styles.selectedCustomerCard}>
                        <View style={styles.customerRow}>
                          <View style={styles.customerAvatar}>
                            <Text style={styles.customerAvatarText}>
                              {selectedCustomer.name[0].toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.flex1}>
                            <Text style={styles.customerNameText}>{selectedCustomer.name}</Text>
                            <Text style={styles.customerPhoneText}>{selectedCustomer.phone || "No phone"}</Text>
                          </View>
                        </View>
                        <Pressable 
                          onPress={() => setCustomerId(null)}
                          style={({ pressed }) => [styles.changeCustBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.changeCustText}>CHANGE</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </Section>

              <Section title="Select Items">
                <Searchbar
                  placeholder="Search name or SKU..."
                  onChangeText={setSearch}
                  value={search}
                  style={styles.searchBar}
                  inputStyle={styles.searchInput}
                  elevation={0}
                />
                
                <View style={styles.listContainer}>
                  <FlashListAny
                    data={displayItems}
                    keyExtractor={(item: Item) => item.id}
                    renderItem={({ item }: { item: Item }) => (
                      <SaleItemCard 
                        item={item} 
                        quantity={cart[item.id]?.quantity ?? 0}
                        onAdd={() => updateQuantity(item, 1)}
                        onRemove={() => updateQuantity(item, -1)}
                      />
                    )}
                    estimatedItemSize={90}
                    ListEmptyComponent={
                      itemsQuery.isLoading && !network.isOffline ? (
                        <SkeletonList count={4} itemHeight={90} />
                      ) : network.isOffline ? (
                        <EmptyState
                          icon="cloud-off-outline"
                          title="Items unavailable offline"
                          subtitle="Open this shop online once to sync items."
                        />
                      ) : (
                        <EmptyState 
                          icon="magnify" 
                          title="No products found" 
                          subtitle="Try searching by name or SKU" 
                        />
                      )
                    }
                    scrollEnabled={false}
                  />
                </View>
              </Section>
            </View>
          )}

          {currentStep === 2 && (
            <View style={styles.stepContainer}>
              <Section title="Settle & Pay">
                {/* Total Due Premium Card */}
                <View style={styles.totalDueCard}>
                  <Text style={styles.totalDueLabel}>TOTAL DUE</Text>
                  <Text style={styles.totalDueVal}>{money(cartTotal)}</Text>
                  <View style={styles.totalDueFooter}>
                    <Icon source="information-outline" size={14} color={colors.primaryDark} />
                    <Text style={styles.totalDueFooterText}>
                      Walk-in sales require instant settlement
                    </Text>
                  </View>
                </View>

                {/* Custom Card Selection Grid */}
                <Text style={styles.paymentSectionLabel}>Select Payment Mode</Text>
                <View style={styles.paymentGrid}>
                  {(["CASH", "UPI"] as const).map((mode) => {
                    const isSelected = paymentMode === mode;
                    const label = mode === "CASH" ? "Cash" : "UPI";
                    const icon = mode === "CASH" ? "cash-multiple" : "qrcode-scan";
                    
                    return (
                      <Pressable 
                        key={mode}
                        onPress={() => {
                          setPaymentMode(mode);
                          if (mode === "UPI") {
                            setAmountReceived(String(cartTotal));
                          } else {
                            setAmountReceived("");
                          }
                        }}
                        style={({ pressed }) => [
                          styles.paymentCard,
                          isSelected && styles.paymentCardSelected,
                          pressed && styles.pressed
                        ]}
                      >
                        <View style={[
                          styles.paymentCardIconWrapper,
                          isSelected && styles.paymentCardIconWrapperActive
                        ]}>
                          <Icon 
                            source={icon} 
                            size={28} 
                            color={isSelected ? colors.primary : colors.textSecondary} 
                          />
                        </View>
                        <Text style={[
                          styles.paymentCardLabel, 
                          isSelected && styles.paymentCardLabelActive
                        ]}>
                          {label}
                        </Text>
                        {isSelected && (
                          <View style={styles.paymentCardCheck}>
                            <Icon source="check-circle" size={18} color={colors.primary} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Amount Received Input (Only for Cash) */}
                {paymentMode === "CASH" ? (
                  <View style={styles.cashCalculationContainer}>
                    <TextInput
                      mode="outlined"
                      label="Amount Received"
                      value={amountReceived}
                      onChangeText={setAmountReceived}
                      keyboardType="numeric"
                      style={styles.input}
                      outlineStyle={styles.inputOutline}
                      placeholder={`Min ${money(cartTotal)}`}
                      left={<TextInput.Icon icon="cash" />}
                    />
                    
                    {amountReceived ? (
                      Number(amountReceived) < cartTotal ? (
                        <View style={[styles.calcInfoBox, styles.calcInfoBoxError]}>
                          <Icon source="alert-circle-outline" size={16} color={colors.danger} />
                          <Text style={styles.calcErrorText}>
                            Received amount cannot be less than total due.
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.calcInfoBox, styles.calcInfoBoxSuccess]}>
                          <Icon source="swap-horizontal" size={16} color={colors.success} />
                          <Text style={styles.calcSuccessText}>
                            Change to Return: <Text style={styles.boldText}>{money(calculatedChange)}</Text>
                          </Text>
                        </View>
                      )
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.upiDisclaimerContainer}>
                    <Icon source="information" size={16} color={colors.info} />
                    <Text style={styles.upiDisclaimerText}>
                      Customer pays {money(cartTotal)} via UPI. Ensure transaction status is verified before completing checkout.
                    </Text>
                  </View>
                )}

                {/* Notes Input */}
                <View style={styles.notesContainer}>
                  <TextInput
                    mode="outlined"
                    label="Transaction Notes (Optional)"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={3}
                    style={styles.notesInput}
                    outlineStyle={styles.inputOutline}
                    placeholder="Add billing comments, product batch details etc."
                    left={<TextInput.Icon icon="note-text-outline" />}
                  />
                </View>
              </Section>
            </View>
          )}

          {currentStep === 3 && (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrapper}>
                <View style={styles.successPulseCircle}>
                  <Icon source="check-circle" size={80} color={colors.primary} />
                </View>
              </View>
              <Text style={styles.successTitle}>Sale Completed!</Text>
              <Text style={styles.successSubtitle}>
                {`Recorded walk-in sale of ${money(cartTotal)} successfully.`}
              </Text>
              
              {/* Receipt / Invoice Mock */}
              <View style={styles.receiptCard}>
                <View style={styles.receiptHeader}>
                  <Text style={styles.receiptShopName}>{selectedShop?.name ?? "Vardaman Sales"}</Text>
                  <Text style={styles.receiptMetaSub}>WALK-IN RECEIPT</Text>
                  <Text style={styles.receiptMetaDate}>
                    {new Date().toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <View style={styles.dashedDivider} />

                {/* Items List */}
                <View style={styles.receiptSection}>
                  <Text style={styles.receiptSectionTitle}>ITEMS</Text>
                  {cartArray.map(({ item, quantity }) => (
                    <View key={item.id} style={styles.receiptItemRow}>
                      <View style={{ flex: 1, marginRight: spacing.sm }}>
                        <Text style={styles.receiptItemName}>{item.name}</Text>
                        <Text style={styles.receiptItemSubText}>
                          {quantity} {item.unit} x {money(item.defaultSellingPrice)}
                        </Text>
                      </View>
                      <Text style={styles.receiptItemSubtotal}>{money(quantity * Number(item.defaultSellingPrice))}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.dashedDivider} />

                {/* Transaction Details */}
                <View style={styles.receiptSection}>
                  <View style={styles.receiptDetailRow}>
                    <Text style={styles.receiptDetailLabel}>Sale Number</Text>
                    <Text style={styles.receiptDetailVal}>{completedSaleNumber || "N/A"}</Text>
                  </View>
                  <View style={styles.receiptDetailRow}>
                    <Text style={styles.receiptDetailLabel}>Customer</Text>
                    <Text style={styles.receiptDetailVal}>{customerId ? selectedCustomer?.name : (customerName || "Walk-in Customer")}</Text>
                  </View>
                  {customerPhone ? (
                    <View style={styles.receiptDetailRow}>
                      <Text style={styles.receiptDetailLabel}>Mobile</Text>
                      <Text style={styles.receiptDetailVal}>{customerPhone}</Text>
                    </View>
                  ) : null}
                  <View style={styles.receiptDetailRow}>
                    <Text style={styles.receiptDetailLabel}>Payment Mode</Text>
                    <Text style={styles.receiptDetailVal}>{paymentMode}</Text>
                  </View>
                  {notes ? (
                    <View style={styles.receiptDetailRowCol}>
                      <Text style={styles.receiptDetailLabel}>Notes</Text>
                      <Text style={styles.receiptDetailValNotes}>{notes}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.dashedDivider} />

                {/* Payment Breakdown */}
                <View style={styles.receiptSection}>
                  <View style={[styles.receiptBreakdownRow, styles.receiptTotalRow]}>
                    <Text style={styles.receiptTotalLabel}>Total Amount</Text>
                    <Text style={styles.receiptTotalVal}>{money(cartTotal)}</Text>
                  </View>
                  {paymentMode === "CASH" && amountReceived ? (
                    <>
                      <View style={styles.receiptBreakdownRow}>
                        <Text style={styles.receiptBreakdownLabel}>Amount Received</Text>
                        <Text style={styles.receiptBreakdownVal}>{money(amountReceived)}</Text>
                      </View>
                      <View style={styles.receiptBreakdownRow}>
                        <Text style={styles.receiptBreakdownLabel}>Change Returned</Text>
                        <Text style={[styles.receiptBreakdownVal, { color: colors.success }]}>{money(calculatedChange)}</Text>
                      </View>
                    </>
                  ) : null}
                </View>

                {/* Receipt Footer */}
                <View style={styles.receiptFooter}>
                  <Text style={styles.receiptThankYou}>Thank you for your business!</Text>
                  <Text style={styles.receiptPowered}>Powered by ShopControl</Text>
                </View>
              </View>
              
              <View style={styles.successActionsContainer}>
                <Button
                  label="START NEW WALK-IN"
                  variant="success"
                  onPress={() => {
                    setCart({});
                    setCustomerId(null);
                    setCustomerSearch("");
                    setCustomerName("");
                    setCustomerPhone("");
                    setPaymentMode("CASH");
                    setAmountReceived("");
                    setNotes("");
                    setCompletedSaleNumber(null);
                    saleMutation.reset();
                    setCurrentStep(1);
                  }}
                  style={styles.newSaleBtn}
                />
                
                <View style={styles.receiptActionRow}>
                  <Button
                    label="Print Receipt"
                    variant="ghost"
                    icon="printer"
                    loading={isPrinting}
                    disabled={isSharing}
                    onPress={async () => {
                      setIsPrinting(true);
                      try {
                        await printSaleInvoiceDirect({
                          sale: completedSale || {
                            saleNumber: completedSaleNumber || "N/A",
                            totalAmount: String(cartTotal),
                            paidAmount: String(cartTotal),
                            balanceAmount: "0",
                            isWalkin: !customerId,
                            createdAt: new Date().toISOString(),
                            items: cartArray.map(i => ({
                              id: i.item.id,
                              quantity: String(i.quantity),
                              rate: String(i.item.defaultSellingPrice),
                              totalAmount: String(i.quantity * Number(i.item.defaultSellingPrice)),
                              item: i.item,
                            })),
                            notes: notes || null,
                            payments: [{
                              paymentMode: paymentMode,
                              amount: String(cartTotal),
                              receivedAt: new Date().toISOString()
                            }]
                          },
                          shop: selectedShop,
                        });
                      } finally {
                        setIsPrinting(false);
                      }
                    }}
                    style={styles.receiptActionBtn}
                  />
                  <Button
                    label="Share"
                    variant="ghost"
                    icon="share-variant"
                    loading={isSharing}
                    disabled={isPrinting}
                    onPress={async () => {
                      setIsSharing(true);
                      try {
                        await shareSaleInvoicePdf({
                          sale: completedSale || {
                            saleNumber: completedSaleNumber || "N/A",
                            totalAmount: String(cartTotal),
                            paidAmount: String(cartTotal),
                            balanceAmount: "0",
                            isWalkin: !customerId,
                            createdAt: new Date().toISOString(),
                            items: cartArray.map(i => ({
                              id: i.item.id,
                              quantity: String(i.quantity),
                              rate: String(i.item.defaultSellingPrice),
                              totalAmount: String(i.quantity * Number(i.item.defaultSellingPrice)),
                              item: i.item,
                            })),
                            notes: notes || null,
                            payments: [{
                              paymentMode: paymentMode,
                              amount: String(cartTotal),
                              receivedAt: new Date().toISOString()
                            }]
                          },
                          shop: selectedShop,
                        });
                      } finally {
                        setIsSharing(false);
                      }
                    }}
                    style={styles.receiptActionBtn}
                  />
                  <Button
                    label="WhatsApp"
                    variant="ghost"
                    icon="whatsapp"
                    disabled={isPrinting || isSharing}
                    onPress={() => {
                      const saleObj = completedSale || {
                        saleNumber: completedSaleNumber || "N/A",
                        totalAmount: String(cartTotal),
                        paidAmount: String(cartTotal),
                        balanceAmount: "0",
                        isWalkin: !customerId,
                        createdAt: new Date().toISOString(),
                        customer: customerId ? selectedCustomer : null,
                      };
                      const shopName = selectedShop?.name || "Vardaman Sales";
                      const text = `*${shopName}*\n` +
                        `Invoice: *#${saleObj.saleNumber}*\n` +
                        `Date: ${new Date(saleObj.createdAt).toLocaleDateString("en-IN")}\n` +
                        `Customer: ${saleObj.isWalkin ? "Walk-in" : saleObj.customer?.name || "Customer"}\n` +
                        `Total Amount: *₹${Number(saleObj.totalAmount).toLocaleString("en-IN")}*\n` +
                        `Paid: ₹${Number(saleObj.paidAmount).toLocaleString("en-IN")}\n` +
                        `Balance: *₹${Number(saleObj.balanceAmount).toLocaleString("en-IN")}*\n` +
                        `Status: *PAID*\n\n` +
                        `Thank you for your business!`;
                      
                      let url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                      if (saleObj.customer?.phone) {
                        const cleanPhone = saleObj.customer.phone.replace(/\D/g, "");
                        const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                        url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
                      } else if (customerPhone) {
                        const cleanPhone = customerPhone.replace(/\D/g, "");
                        const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                        url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
                      }

                      Linking.openURL(url).catch(() => {
                        Alert.alert("Error", "Could not open WhatsApp.");
                      });
                    }}
                    style={styles.receiptActionBtn}
                  />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Action Bottom Bars */}
        {currentStep === 1 && cartItemCount > 0 && (
          <View style={[styles.cartSummary, { paddingBottom: bottomPadding }]}>
            <View style={styles.cartInfo}>
              <Text style={styles.cartCount}>{cartItemCount} items</Text>
              <Text style={styles.cartTotal}>{money(cartTotal)}</Text>
            </View>
            <Button 
              label="Proceed to Payment →" 
              variant="success"
              onPress={() => {
                setCurrentStep(2);
                if (paymentMode === "UPI") {
                  setAmountReceived(String(cartTotal));
                }
              }} 
              style={styles.checkoutButton}
            />
          </View>
        )}

        {currentStep === 2 && (
          <View style={[styles.cartSummary, { paddingBottom: bottomPadding, gap: spacing.md }]}>
            <Button 
              label="← Back" 
              variant="ghost"
              onPress={() => setCurrentStep(1)} 
              style={{ flex: 1 }}
            />
            <Button 
              label="Complete Checkout" 
              variant="success"
              onPress={handleCompleteSale} 
              loading={saleMutation.isPending}
              disabled={!isPaymentValid}
              style={{ flex: 1.8 }}
            />
          </View>
        )}
      </KeyboardAvoidingView>
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
    paddingTop: spacing.md,
  },
  formCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
  listContainer: {
    minHeight: 200,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  itemCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#f0fdf4',
  },
  itemAvatarContainer: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  itemAvatarContainerActive: {
    backgroundColor: colors.primaryLight,
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  stockBadgeLow: {
    backgroundColor: colors.warningLight,
  },
  stockTextLow: {
    color: colors.warning,
  },
  quantityControls: {
    minWidth: 120,
    alignItems: 'flex-end',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
    minWidth: 80,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addButtonLabel: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  qtyButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  qtyDisplay: {
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  disabledButton: {
    backgroundColor: colors.surfaceOffset,
  },
  disabledButtonLabel: {
    color: colors.textMuted,
  },
  disabledQtyButton: {
    backgroundColor: colors.surfaceOffset,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  outOfStockBadge: {
    backgroundColor: 'rgba(255, 74, 74, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  outOfStockText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  stockBadge: {
    backgroundColor: 'rgba(20, 163, 74, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  stockText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  cartSummary: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.lg,
  },
  cartInfo: {
    flex: 1,
  },
  cartCount: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  cartTotal: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  checkoutButton: {
    flex: 1.5,
  },
  stepContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  paymentGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  paymentCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    position: 'relative',
    ...shadow.sm,
  },
  paymentCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  paymentCardIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentCardIconWrapperActive: {
    backgroundColor: 'white',
  },
  paymentCardLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  paymentCardLabelActive: {
    color: colors.primaryDark,
    fontWeight: fontWeight.extrabold,
  },
  paymentCardCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  totalDueCard: {
    backgroundColor: colors.primaryLight,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  totalDueLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
    letterSpacing: 1,
  },
  totalDueVal: {
    fontSize: 36,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
  },
  totalDueFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  totalDueFooterText: {
    fontSize: 11,
    color: colors.primaryDark,
    opacity: 0.8,
    fontWeight: fontWeight.medium,
  },
  paymentSectionLabel: {
    fontSize: 14,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  cashCalculationContainer: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  calcInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  calcInfoBoxError: {
    backgroundColor: 'rgba(255, 74, 74, 0.08)',
    borderColor: 'rgba(255, 74, 74, 0.2)',
  },
  calcInfoBoxSuccess: {
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderColor: 'rgba(22, 163, 74, 0.2)',
  },
  calcErrorText: {
    fontSize: fontSize.sm,
    color: colors.danger,
    fontWeight: fontWeight.medium,
  },
  calcSuccessText: {
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    fontWeight: fontWeight.medium,
  },
  boldText: {
    fontWeight: fontWeight.black,
  },
  upiDisclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceOffset,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  upiDisclaimerText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  notesContainer: {
    marginBottom: spacing.lg,
  },
  notesInput: {
    backgroundColor: colors.surface,
  },
  successContainer: {
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    backgroundColor: colors.bg,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accordionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  accordionSummaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  successIconWrapper: {
    marginBottom: spacing.lg,
  },
  successPulseCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  successSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  receiptCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.xxxl,
    ...shadow.md,
  },
  receiptHeader: {
    alignItems: 'center',
    gap: 2,
  },
  receiptShopName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  receiptMetaSub: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  receiptMetaDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  dashedDivider: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginVertical: spacing.md,
    height: 0,
  },
  receiptSection: {
    gap: spacing.sm,
  },
  receiptSectionTitle: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptItemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  receiptItemSubText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  receiptItemSubtotal: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  receiptDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptDetailRowCol: {
    flexDirection: 'column',
    gap: 4,
    marginTop: 4,
  },
  receiptDetailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  receiptDetailVal: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  receiptDetailValNotes: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 2,
  },
  receiptBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptBreakdownLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  receiptBreakdownVal: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  receiptTotalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  receiptTotalLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  receiptTotalVal: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
  },
  receiptFooter: {
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
  },
  receiptThankYou: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  receiptPowered: {
    fontSize: 10,
    color: colors.textMuted,
  },
  successActionsContainer: {
    width: '100%',
    gap: spacing.md,
  },
  newSaleBtn: {
    width: '100%',
  },
  receiptActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  receiptActionBtn: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  searchAddBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchDropdown: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  orDivider: {
    flex: 1,
    backgroundColor: colors.border,
  },
  orText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  selectedCustomerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    color: 'white',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  customerNameText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.primaryDark,
  },
  customerPhoneText: {
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    opacity: 0.8,
  },
  changeCustBtn: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
  },
  changeCustText: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.primary,
  },
  flex1: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
  // Progress Indicator Styles
  progressContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  progressLineTrack: {
    position: 'absolute',
    top: spacing.md + 14,
    left: spacing.lg + 24,
    right: spacing.lg + 24,
    height: 3,
    backgroundColor: colors.surfaceOffset,
    zIndex: 1,
  },
  progressLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.border,
  },
  progressLineActive: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: colors.primary,
  },
  progressStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    zIndex: 2,
    paddingHorizontal: 12,
  },
  progressNode: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  progressNodeActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  progressNodeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  progressNodeTextActive: {
    color: '#ffffff',
  },
});
