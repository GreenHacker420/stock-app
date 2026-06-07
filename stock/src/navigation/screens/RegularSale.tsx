import React, { useMemo, useState, memo, useCallback, useRef } from "react";
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  Pressable, 
  TextInput,
  PanResponder,
  Modal,
  Platform
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import { Searchbar, Text, Icon, SegmentedButtons, Divider, Card, List, Button } from "react-native-paper";
import Svg, { Path } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";

import { Item, Customer } from "../../api/client";
import { useItemsQuery } from "../../hooks/useItems";
import { useCustomersQuery } from "../../hooks/useCustomers";
import { useSalesQuery, useCreateSaleMutation } from "../../hooks/useSales";
import { useShopStore } from "../../auth/shop-store";
import { useShopsQuery } from "../../hooks/useShops";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SuccessModal } from "../../components/ui/SuccessModal";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}



export function RegularSale() {
  const navigation = useNavigation();
  const { activeShopId } = useShopStore();
  const shopsQuery = useShopsQuery();
  const activeShop = shopsQuery.data?.find(s => s.id === activeShopId);

  // Wizard Navigation State
  const [step, setStep] = useState(1);
  const [paymentType, setPaymentType] = useState<"PAID" | "SIGNED">("PAID");

  // Search & selections
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Cart state: Record of itemId -> cart item details
  const [cart, setCart] = useState<Record<string, { item: Item, quantity: number, rate: number }>>({});
  
  // Item edit overlay panel state (modal now)
  const [selectedItemToEdit, setSelectedItemToEdit] = useState<Item | null>(null);
  const [editQty, setEditQty] = useState("1");
  const [editRate, setEditRate] = useState("");

  // Payment settings
  const [paidAmountStr, setPaidAmountStr] = useState("0");
  const [paymentMode, setPaymentMode] = useState<string>("CASH");
  const [creditDaysOffset, setCreditDaysOffset] = useState<number>(15); // Default 15 days credit due

  // Signature state
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [sigPaths, setSigPaths] = useState<string[]>([]);
  const [sigCurrentPath, setSigCurrentPath] = useState<string>("");
  const isSigEmpty = sigPaths.length === 0 && !sigCurrentPath;

  const touchStart = useRef({ x: 0, y: 0 });
  const sigCurrentPathRef = useRef("");
  const sigPathsRef = useRef<string[]>([]);

  // Feedback modals
  const [successVisible, setSuccessVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Queries
  const customersQuery = useCustomersQuery();
  const itemsQuery = useItemsQuery({ search, limit: 50 });
  const salesQuery = useSalesQuery();

  const selectedCustomer = useMemo(() => {
    return customersQuery.data?.find(c => c.id === selectedCustomerId);
  }, [customersQuery.data, selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    return (customersQuery.data ?? []).filter(c =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone?.includes(customerSearch)
    ).slice(0, 5);
  }, [customersQuery.data, customerSearch]);

  // Resolve custom historical purchase rates for this customer
  const customerLastRates = useMemo(() => {
    if (!selectedCustomerId || !salesQuery.data) return {} as Record<string, number>;
    const rates: Record<string, number> = {};
    const customerSales = [...salesQuery.data]
      .filter(s => s.customerId === selectedCustomerId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
    for (const sale of customerSales) {
      if (sale.items) {
        for (const saleItem of sale.items) {
          rates[saleItem.item.id] = Number(saleItem.rate);
        }
      }
    }
    return rates;
  }, [salesQuery.data, selectedCustomerId]);

  const cartArray = useMemo(() => Object.values(cart), [cart]);
  const subtotal = useMemo(() => cartArray.reduce((sum, i) => sum + (i.quantity * i.rate), 0), [cartArray]);
  
  const paidAmount = Number(paidAmountStr) || 0;
  const balanceAmount = Math.max(0, subtotal - paidAmount);

  const upiPayload = useMemo(() => {
    if (!activeShop?.upiId || !paidAmount) return "";
    const name = encodeURIComponent(activeShop.upiName || activeShop.name);
    return `upi://pay?pa=${activeShop.upiId}&pn=${name}&am=${paidAmount}&cu=INR`;
  }, [activeShop, paidAmount]);

  const saleMutation = useCreateSaleMutation();

  // Auto-fill paid amount when total changes in Fully Paid mode
  React.useEffect(() => {
    if (paymentType === "PAID") {
      setPaidAmountStr(String(subtotal));
    }
  }, [subtotal, paymentType]);

  const handleAddItemDirectly = (item: Item) => {
    const existing = cart[item.id];
    let qty = 1;
    let rate = Number(item.defaultSellingPrice);

    // Pre-fill rate with customer's last purchased rate, or regular selling price
    const lastRate = customerLastRates[item.id];
    if (lastRate !== undefined) {
      rate = lastRate;
    }

    if (existing) {
      qty = existing.quantity + 1;
      rate = existing.rate; // Keep the existing rate if already in cart
    }

    setCart(prev => ({
      ...prev,
      [item.id]: {
        item,
        quantity: qty,
        rate
      }
    }));
    setSearch("");
  };

  const handleOpenItemEdit = (item: Item) => {
    setSelectedItemToEdit(item);
    const existing = cart[item.id];
    setEditQty(existing ? String(existing.quantity) : "1");
    const lastRate = customerLastRates[item.id];
    setEditRate(existing ? String(existing.rate) : String(lastRate ?? item.defaultSellingPrice));
  };

  const handleSaveItem = () => {
    if (!selectedItemToEdit) return;
    const qty = Number(editQty);
    const rate = Number(editRate);
    if (qty <= 0 || rate <= 0) return;

    setCart(prev => ({
      ...prev,
      [selectedItemToEdit.id]: {
        item: selectedItemToEdit,
        quantity: qty,
        rate
      }
    }));
    setSelectedItemToEdit(null);
  };

  const handleRemoveItem = (id: string) => {
    setCart(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleUpdateQty = (itemId: string, newQty: number) => {
    setCart(prev => {
      if (!prev[itemId]) return prev;
      return {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          quantity: newQty
        }
      };
    });
  };

  const triggerCheckoutSubmit = (signatureStr?: string) => {
    if (saleMutation.isPending) return;
    setErrorMsg(null);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + creditDaysOffset);

    // If fully paid, no outstanding balance/due date
    const finalOutstanding = paymentType === "PAID" ? 0 : balanceAmount;

    saleMutation.mutate({
      customerId: selectedCustomerId ?? undefined,
      isWalkin: false,
      items: cartArray.map(i => ({
        itemId: i.item.id,
        quantity: i.quantity,
        rate: i.rate,
      })),
      dueDate: finalOutstanding > 0 ? dueDate.toISOString() : undefined,
      payments: paidAmount > 0 ? [{
        paymentMode,
        amount: paidAmount
      }] : [],
      customerSignature: signatureStr,
    }, {
      onSuccess: () => {
        setSuccessVisible(true);
      },
      onError: (err: any) => {
        setErrorMsg(err.message || "Failed to create regular sale");
      }
    });
  };

  const handleStep1Submit = () => {
    if (!selectedCustomerId) {
      setErrorMsg("Please select a customer first");
      return;
    }
    if (cartArray.length === 0) {
      setErrorMsg("Please add at least one item to cart");
      return;
    }
    setErrorMsg(null);
    setStep(2);
  };

  const handleStep2Submit = () => {
    if (paymentType === "PAID" || balanceAmount === 0) {
      // Fully paid sale - directly check out, bypass signature
      triggerCheckoutSubmit();
    } else {
      // Outstanding balance exists, proceed to signature
      setStep(3);
    }
  };

  const handleConfirmSignature = () => {
    const fullPath = [...sigPaths, sigCurrentPath].filter(Boolean).join(" ");
    triggerCheckoutSubmit(fullPath);
  };

  const handleClearSignature = () => {
    sigCurrentPathRef.current = "";
    sigPathsRef.current = [];
    setSigPaths([]);
    setSigCurrentPath("");
  };

  // PanResponder for step 3 signature pad with scroll lock & touch mapping fixes
  const signaturePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        setScrollEnabled(false);
        const { locationX, locationY } = evt.nativeEvent;
        if (typeof locationX !== 'number' || typeof locationY !== 'number' || isNaN(locationX) || isNaN(locationY)) {
          return;
        }
        touchStart.current = { x: locationX, y: locationY };
        const startPath = `M${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        sigCurrentPathRef.current = startPath;
        setSigCurrentPath(startPath);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        if (typeof locationX !== 'number' || typeof locationY !== 'number' || isNaN(locationX) || isNaN(locationY)) {
          return;
        }
        const nextPath = `${sigCurrentPathRef.current} L${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        sigCurrentPathRef.current = nextPath;
        setSigCurrentPath(nextPath);
      },
      onPanResponderRelease: () => {
        setScrollEnabled(true);
        if (sigCurrentPathRef.current) {
          sigPathsRef.current = [...sigPathsRef.current, sigCurrentPathRef.current];
          setSigPaths(sigPathsRef.current);
          sigCurrentPathRef.current = "";
          setSigCurrentPath("");
        }
      },
      onPanResponderTerminate: () => {
        setScrollEnabled(true);
        if (sigCurrentPathRef.current) {
          sigPathsRef.current = [...sigPathsRef.current, sigCurrentPathRef.current];
          setSigPaths(sigPathsRef.current);
          sigCurrentPathRef.current = "";
          setSigCurrentPath("");
        }
      },
    })
  ).current;

  // Custom step indicator component
  const renderStepIndicator = () => {
    return (
      <View style={styles.stepIndicatorContainer}>
        <View style={styles.stepWrapper}>
          <View style={[styles.stepCircle, step >= 1 && styles.stepCircleActive]}>
            {step > 1 ? (
              <Icon source="check" size={16} color="#ffffff" />
            ) : (
              <Text style={[styles.stepNumber, step >= 1 && styles.stepNumberActive]}>1</Text>
            )}
          </View>
          <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>Items</Text>
        </View>

        <View style={[styles.stepConnector, step >= 2 && styles.stepConnectorActive]} />

        <View style={styles.stepWrapper}>
          <View style={[styles.stepCircle, step >= 2 && styles.stepCircleActive]}>
            {step > 2 ? (
              <Icon source="check" size={16} color="#ffffff" />
            ) : (
              <Text style={[styles.stepNumber, step >= 2 && styles.stepNumberActive]}>2</Text>
            )}
          </View>
          <Text style={[styles.stepLabel, step === 2 && styles.stepLabelActive]}>Payment</Text>
        </View>

        <View style={[styles.stepConnector, step >= 3 && styles.stepConnectorActive]} />

        <View style={styles.stepWrapper}>
          <View style={[styles.stepCircle, step >= 3 && styles.stepCircleActive]}>
            <Text style={[styles.stepNumber, step >= 3 && styles.stepNumberActive]}>3</Text>
          </View>
          <Text style={[styles.stepLabel, step === 3 && styles.stepLabelActive]}>Signature</Text>
        </View>
      </View>
    );
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Regular Sale" subtitle="Customer linked sale with credit terms" />
      
      {renderStepIndicator()}

      <ScrollView scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        
        {/* ================= STEP 1: ITEMS & CUSTOMER ================= */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            {/* Customer Selection */}
            <Section title="Customer Account">
              {!selectedCustomer ? (
                <View style={styles.searchSectionContainer}>
                  <Searchbar
                    placeholder="Search customer by name or phone..."
                    onChangeText={setCustomerSearch}
                    value={customerSearch}
                    style={styles.searchBar}
                    inputStyle={styles.searchInput}
                    placeholderTextColor={colors.textMuted}
                    iconColor={colors.primary}
                  />
                  {customerSearch ? (
                    <View style={styles.searchDropdown}>
                      {filteredCustomers.map(c => (
                        <List.Item
                          key={c.id}
                          title={c.name}
                          titleStyle={styles.dropdownTitle}
                          description={`${c.phone || "No phone"} • Bal: ₹${Math.abs(Number(c.outstandingAmount || 0)).toLocaleString()}`}
                          descriptionStyle={styles.dropdownDesc}
                          onPress={() => {
                            setSelectedCustomerId(c.id);
                            setCustomerSearch("");
                          }}
                          right={props => <List.Icon {...props} icon="account-check" color={colors.primary} />}
                          style={styles.dropdownItem}
                        />
                      ))}
                      {filteredCustomers.length === 0 && (
                        <View style={styles.dropdownEmpty}>
                          <Text style={styles.dropdownEmptyText}>No customers found</Text>
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
              ) : (
                <Card style={styles.selectedCustomerCard}>
                  <Card.Content style={styles.customerCardContent}>
                    <View style={styles.customerAvatar}>
                      <Text style={styles.customerAvatarText}>
                        {selectedCustomer.name.substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.customerInfo}>
                      <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                      <Text style={styles.customerDetails}>{selectedCustomer.phone || "No phone"}</Text>
                      <Text style={styles.customerDetails}>
                        Outstanding Balance: <Text style={Number(selectedCustomer.outstandingAmount || 0) < 0 ? styles.balanceNegative : styles.balancePositive}>₹{Math.abs(Number(selectedCustomer.outstandingAmount || 0)).toLocaleString()}</Text>
                      </Text>
                    </View>
                    <Button 
                      mode="outlined" 
                      compact 
                      onPress={() => {
                        setSelectedCustomerId(null);
                        setCart({}); // Reset cart if customer changes to avoid price conflicts
                      }}
                      labelStyle={styles.changeButtonLabel}
                      style={{ borderColor: colors.borderStrong }}
                    >
                      Change
                    </Button>
                  </Card.Content>
                </Card>
              )}
            </Section>

            {/* Item Selection */}
            {selectedCustomerId && (
              <Section title="Add Products">
                <View style={styles.searchSectionContainer}>
                  <Searchbar
                    placeholder="Search items by name or SKU..."
                    onChangeText={setSearch}
                    value={search}
                    style={styles.searchBar}
                    inputStyle={styles.searchInput}
                    placeholderTextColor={colors.textMuted}
                    iconColor={colors.primary}
                  />
                  {search ? (
                    <View style={styles.searchDropdown}>
                      {(itemsQuery.data?.items ?? []).filter(i =>
                        i.name.toLowerCase().includes(search.toLowerCase()) ||
                        i.sku?.toLowerCase().includes(search.toLowerCase())
                      ).slice(0, 5).map(item => (
                        <List.Item
                          key={item.id}
                          title={item.name}
                          titleStyle={styles.dropdownTitle}
                          description={`Regular: ₹${item.defaultSellingPrice} • Min: ₹${item.minimumAllowedPrice || "N/A"}`}
                          descriptionStyle={styles.dropdownDesc}
                          onPress={() => handleAddItemDirectly(item)}
                          right={props => <List.Icon {...props} icon="plus-circle" color={colors.primary} />}
                          style={styles.dropdownItem}
                        />
                      ))}
                      {(itemsQuery.data?.items ?? []).length === 0 && (
                        <View style={styles.dropdownEmpty}>
                          <Text style={styles.dropdownEmptyText}>No products found</Text>
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
              </Section>
            )}

            {/* Cart Listing */}
            {cartArray.length > 0 && (
              <Section title="Sale Items">
                <View style={styles.cartContainer}>
                  {cartArray.map((cartItem) => (
                    <SwipeableCartItem
                      key={cartItem.item.id}
                      cartItem={cartItem}
                      onEdit={() => handleOpenItemEdit(cartItem.item)}
                      onDelete={() => handleRemoveItem(cartItem.item.id)}
                      onQtyChange={(newQty) => handleUpdateQty(cartItem.item.id, newQty)}
                    />
                  ))}
                  <View style={styles.cartSubtotalContainer}>
                    <Text style={styles.cartSubtotalLabel}>Sale Total</Text>
                    <Text style={styles.cartSubtotalValue}>{money(subtotal)}</Text>
                  </View>
                </View>
              </Section>
            )}

            {cartArray.length === 0 && selectedCustomerId && (
              <View style={styles.emptyCartCard}>
                <Icon source="cart-outline" size={40} color={colors.textMuted} />
                <Text style={styles.emptyCartText}>Cart is empty. Search products above to add them.</Text>
              </View>
            )}
          </View>
        )}

        {/* ================= STEP 2: PAYMENT & TERMS ================= */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            {/* Sale brief header */}
            <Card style={styles.briefSummaryCard}>
              <Card.Content style={styles.briefSummaryContent}>
                <View>
                  <Text style={styles.briefLabel}>Customer</Text>
                  <Text style={styles.briefValueText}>{selectedCustomer?.name}</Text>
                </View>
                <View style={styles.briefDivider} />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.briefLabel}>Total Amount</Text>
                  <Text style={styles.briefTotalText}>{money(subtotal)}</Text>
                </View>
              </Card.Content>
            </Card>

            <Section title="Choose Settlement Option">
              <View style={styles.paymentTypeSelectorRow}>
                <Pressable
                  style={[
                    styles.paymentTypeCard,
                    paymentType === "PAID" && styles.paymentTypeCardActive,
                  ]}
                  onPress={() => {
                    setPaymentType("PAID");
                    setPaidAmountStr(String(subtotal));
                  }}
                >
                  <View style={styles.paymentTypeHeader}>
                    <Icon
                      source="cash-check"
                      size={24}
                      color={paymentType === "PAID" ? colors.primary : colors.textSecondary}
                    />
                    {paymentType === "PAID" && (
                      <Icon source="check-circle" size={18} color={colors.primary} />
                    )}
                  </View>
                  <Text style={[styles.paymentTypeTitle, paymentType === "PAID" && styles.paymentTypeTitleActive]}>
                    Fully Paid
                  </Text>
                  <Text style={styles.paymentTypeSubtitle}>
                    Payment collected in full. No outstanding balance.
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.paymentTypeCard,
                    paymentType === "SIGNED" && styles.paymentTypeCardActive,
                  ]}
                  onPress={() => {
                    setPaymentType("SIGNED");
                    setPaidAmountStr("0");
                  }}
                >
                  <View style={styles.paymentTypeHeader}>
                    <Icon
                      source="file-sign"
                      size={24}
                      color={paymentType === "SIGNED" ? colors.primary : colors.textSecondary}
                    />
                    {paymentType === "SIGNED" && (
                      <Icon source="check-circle" size={18} color={colors.primary} />
                    )}
                  </View>
                  <Text style={[styles.paymentTypeTitle, paymentType === "SIGNED" && styles.paymentTypeTitleActive]}>
                    Signed / Credit
                  </Text>
                  <Text style={styles.paymentTypeSubtitle}>
                    Credit terms registered. Requires customer signature.
                  </Text>
                </Pressable>
              </View>
            </Section>

            <Section title="Payment Settings">
              <View style={styles.termsContainer}>
                
                {/* Fully Paid Options */}
                {paymentType === "PAID" ? (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>PAYMENT MODE</Text>
                    <SegmentedButtons
                      value={paymentMode}
                      onValueChange={setPaymentMode}
                      buttons={[
                        { value: "CASH", label: "Cash" },
                        { value: "UPI", label: "UPI" },
                        { value: "BANK_TRANSFER", label: "Bank" },
                        { value: "CHEQUE", label: "Cheque" },
                      ]}
                      theme={{ colors: { primary: colors.primary } }}
                      style={styles.segmentedFilter}
                    />
                    <View style={styles.paymentDisplayRow}>
                      <Text style={styles.paymentDisplayLabel}>Amount collected:</Text>
                      <Text style={styles.paymentDisplayValue}>{money(subtotal)}</Text>
                    </View>
                  </View>
                ) : (
                  // Signed / Credit Options
                  <View style={{ gap: spacing.lg }}>
                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>PARTIAL PAYMENT RECEIVED (OPTIONAL)</Text>
                      <TextInput
                        style={styles.paymentInput}
                        value={paidAmountStr}
                        onChangeText={setPaidAmountStr}
                        keyboardType="numeric"
                        placeholder="0.00"
                      />
                    </View>

                    {paidAmount > 0 && (
                      <View style={styles.fieldBlock}>
                        <Text style={styles.fieldLabel}>PARTIAL PAYMENT MODE</Text>
                        <SegmentedButtons
                          value={paymentMode}
                          onValueChange={setPaymentMode}
                          buttons={[
                            { value: "CASH", label: "Cash" },
                            { value: "UPI", label: "UPI" },
                            { value: "BANK_TRANSFER", label: "Bank" },
                            { value: "CHEQUE", label: "Cheque" },
                          ]}
                          theme={{ colors: { primary: colors.primary } }}
                          style={styles.segmentedFilter}
                        />
                      </View>
                    )}

                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>CREDIT DUE OFFSET</Text>
                      <SegmentedButtons
                        value={String(creditDaysOffset)}
                        onValueChange={v => setCreditDaysOffset(Number(v))}
                        buttons={[
                          { value: "7", label: "7 Days" },
                          { value: "15", label: "15 Days" },
                          { value: "30", label: "30 Days" },
                        ]}
                        theme={{ colors: { primary: colors.primary } }}
                        style={styles.segmentedFilter}
                      />
                    </View>
                  </View>
                )}

                {/* QR Display Area */}
                {paymentMode === "UPI" && paidAmount > 0 && (
                  <View style={styles.qrDisplayCard}>
                    {activeShop?.upiId ? (
                      <View style={styles.qrContent}>
                        <QRCode value={upiPayload} size={150} />
                        <Text style={styles.qrAmountText}>{money(paidAmount)}</Text>
                        <Text style={styles.qrInstructionsText}>
                          Scan QR with any UPI app to pay to {activeShop.upiName || activeShop.name}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.qrErrorContent}>
                        <Icon source="alert-circle-outline" size={24} color={colors.warning} />
                        <Text style={styles.qrErrorText}>
                          UPI ID not configured in shop settings.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Bank Display Area */}
                {paymentMode === "BANK_TRANSFER" && paidAmount > 0 && (
                  <View style={styles.bankDisplayCard}>
                    <Text style={styles.bankTitleText}>Bank Transfer Details</Text>
                    
                    <View style={styles.bankRow}>
                      <View style={styles.bankCol}>
                        <Text style={styles.bankLabel}>BANK NAME</Text>
                        <Text style={styles.bankValue}>HDFC Bank</Text>
                      </View>
                    </View>

                    <View style={styles.bankRow}>
                      <View style={styles.bankCol}>
                        <Text style={styles.bankLabel}>BENEFICIARY</Text>
                        <Text style={styles.bankValue}>{activeShop?.name || "Vardaman Sales"}</Text>
                      </View>
                    </View>

                    <View style={styles.bankRow}>
                      <View style={styles.bankCol}>
                        <Text style={styles.bankLabel}>ACCOUNT NUMBER</Text>
                        <Text style={styles.bankValue}>50200086754321</Text>
                      </View>
                      <Pressable 
                        style={styles.copyBtn} 
                        onPress={() => {
                          Clipboard.setStringAsync("50200086754321");
                        }}
                      >
                        <Icon source="content-copy" size={16} color={colors.primary} />
                      </Pressable>
                    </View>

                    <View style={styles.bankRow}>
                      <View style={styles.bankCol}>
                        <Text style={styles.bankLabel}>IFSC CODE</Text>
                        <Text style={styles.bankValue}>HDFC0001203</Text>
                      </View>
                      <Pressable 
                        style={styles.copyBtn} 
                        onPress={() => {
                          Clipboard.setStringAsync("HDFC0001203");
                        }}
                      >
                        <Icon source="content-copy" size={16} color={colors.primary} />
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Outstanding Balance summary */}
                <View style={styles.balanceSummary}>
                  <View style={styles.balanceInfo}>
                    <Text style={styles.balanceLabel}>Outstanding Balance</Text>
                    <Text style={[styles.balanceValue, balanceAmount > 0 && { color: colors.danger }]}>
                      {money(balanceAmount)}
                    </Text>
                  </View>
                </View>
              </View>
            </Section>
          </View>
        )}

        {/* ================= STEP 3: SIGNATURE ================= */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <View style={styles.signatureCanvasContainer}>
              <View style={styles.signatureHeaderInline}>
                <Text style={styles.signatureTitleInline}>Take Customer Signature</Text>
                <Text style={styles.signatureSubtitleInline}>
                  Please ask <Text style={{ fontWeight: fontWeight.bold }}>{selectedCustomer?.name}</Text> to sign below to authorize credit outstanding of <Text style={{ color: colors.danger, fontWeight: fontWeight.extrabold }}>{money(balanceAmount)}</Text>.
                </Text>
              </View>

              <View 
                style={styles.canvasInline} 
                {...signaturePanResponder.panHandlers}
              >
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
                  {sigPaths.map((p, i) => (
                    <Path key={i} d={p} fill="none" stroke="#111827" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  {sigCurrentPath ? (
                    <Path d={sigCurrentPath} fill="none" stroke="#111827" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                </Svg>
                {isSigEmpty && (
                  <View pointerEvents="none" style={styles.canvasPlaceholderInline}>
                    <Icon source="gesture-double-tap" size={40} color={colors.textMuted} />
                    <Text style={styles.placeholderTextInline}>Sign on the screen</Text>
                  </View>
                )}
              </View>

              <Button 
                mode="outlined" 
                onPress={handleClearSignature} 
                style={styles.sigClearButton}
                labelStyle={{ color: colors.danger, fontWeight: fontWeight.bold }}
              >
                Clear Drawing
              </Button>
            </View>
          </View>
        )}

        {errorMsg && (
          <View style={styles.errorContainer}>
            <Icon source="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
      </ScrollView>

      {/* ================= FOOTER / ACTION CONTROLS ================= */}
      <View style={styles.footer}>
        {step === 1 && (
          <Button
            mode="contained"
            disabled={!selectedCustomerId || cartArray.length === 0}
            onPress={handleStep1Submit}
            style={[styles.checkoutButton, (!selectedCustomerId || cartArray.length === 0) && styles.checkoutButtonDisabled]}
            contentStyle={styles.checkoutButtonContent}
            labelStyle={styles.checkoutButtonLabel}
          >
            Continue to Payment
          </Button>
        )}

        {step === 2 && (
          <View style={styles.footerButtonsRow}>
            <Button
              mode="outlined"
              onPress={() => setStep(1)}
              style={styles.secondaryFooterBtn}
              contentStyle={styles.checkoutButtonContent}
              labelStyle={styles.secondaryFooterBtnLabel}
            >
              Back to Items
            </Button>
            <Button
              mode="contained"
              disabled={saleMutation.isPending}
              loading={saleMutation.isPending}
              onPress={handleStep2Submit}
              style={styles.primaryFooterBtn}
              contentStyle={styles.checkoutButtonContent}
              labelStyle={styles.checkoutButtonLabel}
            >
              {paymentType === "PAID" || balanceAmount === 0 ? "Complete Cash Sale" : "Go to Signature"}
            </Button>
          </View>
        )}

        {step === 3 && (
          <View style={styles.footerButtonsRow}>
            <Button
              mode="outlined"
              onPress={() => setStep(2)}
              style={styles.secondaryFooterBtn}
              contentStyle={styles.checkoutButtonContent}
              labelStyle={styles.secondaryFooterBtnLabel}
            >
              Back
            </Button>
            <Button
              mode="contained"
              disabled={isSigEmpty || saleMutation.isPending}
              loading={saleMutation.isPending}
              onPress={handleConfirmSignature}
              style={[styles.primaryFooterBtn, isSigEmpty && styles.checkoutButtonDisabled]}
              contentStyle={styles.checkoutButtonContent}
              labelStyle={styles.checkoutButtonLabel}
            >
              Sign & Confirm Sale
            </Button>
          </View>
        )}
      </View>

      {/* ================= EDIT CART ITEM MODAL (SWIPE TO EDIT) ================= */}
      <Modal
        visible={selectedItemToEdit !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedItemToEdit(null)}
      >
        <View style={styles.modalBackdrop}>
          {selectedItemToEdit && (
            <Card style={styles.editItemModalCard}>
              <Card.Content style={styles.editItemCardContent}>
                <Text style={styles.editItemTitle}>{selectedItemToEdit.name}</Text>
                
                {/* Custom price tiers pills */}
                <View style={styles.tierSection}>
                  <Text style={styles.tierLabel}>Select Pricing Tier:</Text>
                  <View style={styles.tierRow}>
                    <Pressable 
                      style={[
                        styles.tierChip,
                        editRate === String(selectedItemToEdit.defaultSellingPrice) && styles.tierChipActive
                      ]}
                      onPress={() => setEditRate(String(selectedItemToEdit.defaultSellingPrice))}
                    >
                      <Text style={[styles.tierChipLabel, editRate === String(selectedItemToEdit.defaultSellingPrice) && styles.tierChipLabelActive]}>Regular</Text>
                      <Text style={[styles.tierChipValue, editRate === String(selectedItemToEdit.defaultSellingPrice) && styles.tierChipValueActive]}>{money(selectedItemToEdit.defaultSellingPrice)}</Text>
                    </Pressable>

                    {selectedItemToEdit.minimumAllowedPrice && (
                      <Pressable 
                        style={[
                          styles.tierChip,
                          editRate === String(selectedItemToEdit.minimumAllowedPrice) && styles.tierChipActive
                        ]}
                        onPress={() => setEditRate(String(selectedItemToEdit.minimumAllowedPrice))}
                      >
                        <Text style={[styles.tierChipLabel, editRate === String(selectedItemToEdit.minimumAllowedPrice) && styles.tierChipLabelActive]}>Min Price</Text>
                        <Text style={[styles.tierChipValue, editRate === String(selectedItemToEdit.minimumAllowedPrice) && styles.tierChipValueActive]}>{money(selectedItemToEdit.minimumAllowedPrice)}</Text>
                      </Pressable>
                    )}

                    {selectedCustomerId && customerLastRates[selectedItemToEdit.id] !== undefined && (
                      <Pressable 
                        style={[
                          styles.tierChip, 
                          styles.lastPriceChip,
                          editRate === String(customerLastRates[selectedItemToEdit.id]) && styles.lastPriceChipActive
                        ]}
                        onPress={() => setEditRate(String(customerLastRates[selectedItemToEdit.id]))}
                      >
                        <Text style={[styles.lastPriceChipLabel, editRate === String(customerLastRates[selectedItemToEdit.id]) && styles.lastPriceChipLabelActive]}>Last Price</Text>
                        <Text style={[styles.tierChipValue, editRate === String(customerLastRates[selectedItemToEdit.id]) && styles.tierChipValueActive]}>{money(customerLastRates[selectedItemToEdit.id])}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Form fields */}
                <View style={styles.itemFormRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputFieldLabel}>Quantity</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Quantity"
                      value={editQty}
                      onChangeText={setEditQty}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputFieldLabel}>Rate (₹)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Rate"
                      value={editRate}
                      onChangeText={setEditRate}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Validation Warning */}
                {selectedItemToEdit.minimumAllowedPrice && Number(editRate) < Number(selectedItemToEdit.minimumAllowedPrice) && (
                  <View style={styles.warningContainer}>
                    <Icon source="alert-decagram" size={16} color={colors.danger} />
                    <Text style={styles.warningText}>
                      Warning: Price is below the minimum allowed rate of {money(selectedItemToEdit.minimumAllowedPrice)}
                    </Text>
                  </View>
                )}

                <View style={styles.editItemActions}>
                  <Button mode="outlined" style={[styles.editItemButton, { borderColor: colors.borderStrong }]} onPress={() => setSelectedItemToEdit(null)}>
                    Cancel
                  </Button>
                  <Button mode="contained" style={[styles.editItemButton, { backgroundColor: colors.primary }]} onPress={handleSaveItem}>
                    Save Changes
                  </Button>
                </View>
              </Card.Content>
            </Card>
          )}
        </View>
      </Modal>

      <SuccessModal
        visible={successVisible}
        title="Sale Completed"
        message={`Sale has been successfully registered. Final amount: ${money(subtotal)}`}
        onClose={() => {
          setSuccessVisible(false);
          setCart({});
          navigation.goBack();
        }}
      />
    </Screen>
  );
}

// Swipeable Cart Item Component using horizontal ScrollView snapping
const SwipeableCartItem = memo(({ 
  cartItem, 
  onEdit, 
  onDelete, 
  onQtyChange, 
}: { 
  cartItem: { item: Item, quantity: number, rate: number };
  onEdit: () => void;
  onDelete: () => void;
  onQtyChange: (newQty: number) => void;
}) => {
  const [rowWidth, setRowWidth] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  
  return (
    <View 
      style={styles.cartItemCard}
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
    >
      {rowWidth > 0 && (
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={90}
          decelerationRate="fast"
          bounces={false}
          style={{ width: rowWidth }}
          contentContainerStyle={{ width: rowWidth + 90 }}
        >
          {/* Main Content */}
          <View style={[styles.cartItemRow, { width: rowWidth }]}>
            <View style={styles.cartItemInfo}>
              <Text style={styles.cartItemName} numberOfLines={1}>{cartItem.item.name}</Text>
              <Text style={styles.cartItemDetails}>
                {money(cartItem.rate)} / {cartItem.item.unit}
              </Text>
            </View>

            {/* Inline Quantity Controls */}
            <View style={styles.inlineQtyContainer}>
              <Pressable 
                onPress={() => onQtyChange(Math.max(1, cartItem.quantity - 1))} 
                style={styles.qtyBtn}
              >
                <Icon source="minus" size={16} color={colors.primary} />
              </Pressable>
              
              <Text style={styles.qtyText}>{cartItem.quantity}</Text>
              
              <Pressable 
                onPress={() => onQtyChange(cartItem.quantity + 1)} 
                style={styles.qtyBtn}
              >
                <Icon source="plus" size={16} color={colors.primary} />
              </Pressable>
            </View>

            <View style={styles.cartItemPriceContainer}>
              <Text style={styles.cartItemTotal}>{money(cartItem.quantity * cartItem.rate)}</Text>
            </View>
          </View>

          {/* Swipe-left Revealed Actions */}
          <View style={styles.swipeActionsContainer}>
            <Pressable 
              onPress={() => {
                scrollViewRef.current?.scrollTo({ x: 0, animated: true });
                onEdit();
              }} 
              style={[styles.swipeActionBtn, { backgroundColor: '#3b82f6' }]}
            >
              <Icon source="pencil" size={20} color="#ffffff" />
            </Pressable>
            <Pressable 
              onPress={() => {
                scrollViewRef.current?.scrollTo({ x: 0, animated: true });
                onDelete();
              }} 
              style={[styles.swipeActionBtn, { backgroundColor: colors.danger }]}
            >
              <Icon source="delete" size={20} color="#ffffff" />
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // Wizard Styles
  stepIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepNumber: {
    fontSize: fontSize.xs + 1,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  stepNumberActive: {
    color: '#ffffff',
  },
  stepLabel: {
    fontSize: fontSize.xs - 1,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  stepLabelActive: {
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
    marginTop: -14, // align with circle centers
  },
  stepConnectorActive: {
    backgroundColor: colors.primary,
  },
  stepContainer: {
    flex: 1,
  },

  // Scroll content
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 140,
  },
  searchSectionContainer: {
    position: 'relative',
    zIndex: 10,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    elevation: 0,
    height: 52,
    justifyContent: 'center',
    shadowOpacity: 0,
  },
  searchInput: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  searchDropdown: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 50,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  dropdownTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  dropdownDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dropdownEmpty: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },

  // Selected Customer Card
  selectedCustomerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primaryMid,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  customerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  customerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  customerAvatarText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  customerDetails: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  balancePositive: {
    color: colors.success,
    fontWeight: fontWeight.bold,
  },
  balanceNegative: {
    color: colors.danger,
    fontWeight: fontWeight.bold,
  },
  changeButtonLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },

  // Cart
  cartContainer: {
    gap: spacing.sm,
  },
  cartItemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.2,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  cartItemInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  cartItemName: {
    fontSize: fontSize.md - 1,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cartItemDetails: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 3,
  },
  inlineQtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
  },
  qtyBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    minWidth: 20,
    textAlign: 'center',
  },
  cartItemPriceContainer: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  cartItemTotal: {
    fontSize: fontSize.md - 1,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  swipeActionsContainer: {
    width: 90,
    flexDirection: 'row',
  },
  swipeActionBtn: {
    width: 45,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartSubtotalContainer: {
    backgroundColor: colors.surfaceOffset,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1.2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  cartSubtotalLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  cartSubtotalValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.primary,
  },
  emptyCartCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  emptyCartText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.md,
    fontWeight: fontWeight.medium,
  },

  // Step 2 Brief Card
  briefSummaryCard: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryMid,
    borderWidth: 1,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    elevation: 0,
    shadowOpacity: 0,
  },
  briefSummaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  briefLabel: {
    fontSize: fontSize.xs - 2,
    color: colors.primaryDark,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  briefValueText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  briefTotalText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.primaryDark,
    marginTop: 2,
  },
  briefDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(22, 163, 74, 0.2)',
  },

  // Payment Type Selector (Step 2)
  paymentTypeSelectorRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  paymentTypeCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.sm,
  },
  paymentTypeCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.bg,
  },
  paymentTypeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentTypeTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  paymentTypeTitleActive: {
    color: colors.primaryDark,
    fontWeight: fontWeight.extrabold,
  },
  paymentTypeSubtitle: {
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    lineHeight: 14,
  },

  // Settlement block
  termsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.sm,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.xs - 1,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  paymentInput: {
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceOffset,
  },
  segmentedFilter: {
    borderRadius: radius.md,
  },
  paymentDisplayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  paymentDisplayLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  paymentDisplayValue: {
    color: colors.primaryDark,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  balanceSummary: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  balanceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  balanceValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },

  // Step 3 Signature Pad Styles
  signatureCanvasContainer: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.sm,
  },
  signatureHeaderInline: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  signatureTitleInline: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  signatureSubtitleInline: {
    fontSize: fontSize.sm - 1,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  canvasInline: {
    flex: 1,
    minHeight: 260,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  canvasPlaceholderInline: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  placeholderTextInline: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
  },
  sigClearButton: {
    alignSelf: 'center',
    borderRadius: radius.md,
    borderColor: colors.dangerLight,
  },

  // Footer & Buttons
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  checkoutButton: {
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  checkoutButtonDisabled: {
    backgroundColor: colors.textDisabled,
  },
  checkoutButtonContent: {
    height: 54,
  },
  checkoutButtonLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: '#ffffff',
  },
  footerButtonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondaryFooterBtn: {
    flex: 1,
    borderRadius: radius.lg,
    borderColor: colors.borderStrong,
  },
  secondaryFooterBtnLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  primaryFooterBtn: {
    flex: 2,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },

  // Modal Backdrop & Edit Item Modal Card
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  editItemModalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow.lg,
  },
  editItemCardContent: {
    padding: spacing.lg,
  },
  editItemTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  tierSection: {
    marginBottom: spacing.lg,
  },
  tierLabel: {
    fontSize: fontSize.xs - 1,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  tierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tierChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    minWidth: 80,
  },
  tierChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryMid,
  },
  tierChipLabel: {
    fontSize: fontSize.xs - 2,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  tierChipLabelActive: {
    color: colors.primaryDark,
  },
  tierChipValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 2,
  },
  tierChipValueActive: {
    color: colors.primaryDark,
  },
  lastPriceChip: {
    borderColor: colors.border,
  },
  lastPriceChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryMid,
  },
  lastPriceChipLabel: {
    fontSize: fontSize.xs - 2,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  lastPriceChipLabelActive: {
    color: colors.primaryDark,
  },
  itemFormRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  inputFieldLabel: {
    fontSize: fontSize.xs - 1,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  textInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.12)',
  },
  warningText: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  editItemActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  editItemButton: {
    flex: 1,
    borderRadius: radius.md,
  },

  // Error block
  errorContainer: {
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.15)',
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeight.bold,
    flex: 1,
    fontSize: fontSize.sm,
  },
  qrDisplayCard: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: colors.borderStrong,
    marginTop: spacing.md,
  },
  qrContent: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  qrAmountText: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  qrInstructionsText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  qrErrorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
  },
  qrErrorText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  bankDisplayCard: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1.2,
    borderColor: colors.borderStrong,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  bankTitleText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
  },
  bankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bankCol: {
    flex: 1,
    gap: 2,
  },
  bankLabel: {
    fontSize: fontSize.xs - 2,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  bankValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  copyBtn: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
  },
});

// Section component proxying styles if not locally defined
const Section = memo(({ title, children }: { title: string, children: React.ReactNode }) => {
  return (
    <View style={{ marginHorizontal: spacing.lg, marginVertical: spacing.md }}>
      <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing.md }}>
        {title}
      </Text>
      {children}
    </View>
  );
});

