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
import { useNavigation } from "@react-navigation/native";
import { Searchbar, Text, Icon, SegmentedButtons, Divider, Card, List, Button } from "react-native-paper";
import Svg, { Path } from "react-native-svg";

import { Item, Customer } from "../../api/client";
import { useItemsQuery } from "../../hooks/useItems";
import { useCustomersQuery } from "../../hooks/useCustomers";
import { useSalesQuery, useCreateSaleMutation } from "../../hooks/useSales";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SuccessModal } from "../../components/ui/SuccessModal";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

// Custom Signature Pad Component using Svg and PanResponder
function SignatureCanvas({ 
  onSave, 
  onClose 
}: { 
  onSave: (signatureData: string) => void;
  onClose: () => void;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath(`M${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prev) => `${prev} L${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
      },
      onPanResponderRelease: () => {
        if (currentPath) {
          setPaths((prev) => [...prev, currentPath]);
          setCurrentPath("");
        }
      },
    })
  ).current;

  const handleClear = () => {
    setPaths([]);
    setCurrentPath("");
  };

  const handleConfirm = () => {
    const fullPath = [...paths, currentPath].filter(Boolean).join(" ");
    onSave(fullPath);
  };

  const isCanvasEmpty = paths.length === 0 && !currentPath;

  return (
    <View style={styles.signatureContainer}>
      <View style={styles.signatureHeader}>
        <Text style={styles.signatureTitle}>Take Customer Signature</Text>
        <Text style={styles.signatureSubtitle}>Required for credit / afterward payments</Text>
      </View>

      <View 
        style={styles.canvas} 
        {...panResponder.panHandlers}
      >
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {paths.map((p, i) => (
            <Path key={i} d={p} fill="none" stroke="#0f172a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {currentPath ? (
            <Path d={currentPath} fill="none" stroke="#0f172a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
        </Svg>
        {isCanvasEmpty && (
          <View pointerEvents="none" style={styles.canvasPlaceholder}>
            <Icon source="draw" size={48} color={colors.textMuted} />
            <Text style={styles.placeholderText}>Sign on the screen</Text>
          </View>
        )}
      </View>

      <View style={styles.signatureActions}>
        <Button 
          mode="outlined" 
          onPress={handleClear} 
          style={[styles.sigButton, { borderColor: colors.borderStrong }]}
        >
          Clear
        </Button>
        <Button 
          mode="outlined" 
          onPress={onClose} 
          style={styles.sigButton}
        >
          Cancel
        </Button>
        <Button 
          mode="contained" 
          onPress={handleConfirm} 
          disabled={isCanvasEmpty} 
          style={[styles.sigButton, { backgroundColor: colors.primary }]}
        >
          Confirm
        </Button>
      </View>
    </View>
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
      style={{ overflow: 'hidden' }}
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
          contentContainerStyle={{ width: rowWidth + 90 }}
        >
          {/* Main Content */}
          <View style={[styles.cartItemRow, { width: rowWidth }]}>
            <View style={styles.cartItemInfo}>
              <Text style={styles.cartItemName}>{cartItem.item.name}</Text>
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

export function RegularSale() {
  const navigation = useNavigation();

  // Search & selections
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Cart state: Record of itemId -> cart item details
  const [cart, setCart] = useState<Record<string, { item: Item, quantity: number, rate: number }>>({});
  
  // Item edit overlay panel state
  const [selectedItemToEdit, setSelectedItemToEdit] = useState<Item | null>(null);
  const [editQty, setEditQty] = useState("1");
  const [editRate, setEditRate] = useState("");

  // Payment settings
  const [paidAmountStr, setPaidAmountStr] = useState("0");
  const [paymentMode, setPaymentMode] = useState<string>("CASH");
  const [creditDaysOffset, setCreditDaysOffset] = useState<number>(15); // Default 15 days credit due

  // Signature Modal & Feedback
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
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

  const saleMutation = useCreateSaleMutation();

  const handleOpenItemEdit = (item: Item) => {
    setSelectedItemToEdit(item);
    const existing = cart[item.id];
    setEditQty(existing ? String(existing.quantity) : "1");
    // Pre-fill rate with: customer's last purchased rate, or regular selling price
    const lastRate = customerLastRates[item.id];
    setEditRate(existing ? String(existing.rate) : String(lastRate ?? item.defaultSellingPrice));
    setSearch("");
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

    saleMutation.mutate({
      customerId: selectedCustomerId ?? undefined,
      isWalkin: false,
      items: cartArray.map(i => ({
        itemId: i.item.id,
        quantity: i.quantity,
        rate: i.rate,
      })),
      dueDate: balanceAmount > 0 ? dueDate.toISOString() : undefined,
      payments: paidAmount > 0 ? [{
        paymentMode,
        amount: paidAmount
      }] : [],
      customerSignature: signatureStr,
    }, {
      onSuccess: () => {
        setSignatureModalVisible(false);
        setSuccessVisible(true);
      },
      onError: (err: any) => {
        setSignatureModalVisible(false);
        setErrorMsg(err.message || "Failed to create regular sale");
      }
    });
  };

  const handleCheckout = () => {
    if (saleMutation.isPending) return;
    if (!selectedCustomerId) {
      setErrorMsg("Please select a customer first");
      return;
    }
    if (cartArray.length === 0) {
      setErrorMsg("Please add at least one item to cart");
      return;
    }

    // If credit sale / balance outstanding exists, request customer signature first
    if (balanceAmount > 0) {
      setSignatureModalVisible(true);
    } else {
      triggerCheckoutSubmit();
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Regular Sale" subtitle="Customer linked sale with credit terms" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
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
                  onPress={() => setSelectedCustomerId(null)}
                  labelStyle={styles.changeButtonLabel}
                >
                  Change
                </Button>
              </Card.Content>
            </Card>
          )}
        </Section>

        {/* Item Selection */}
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
                    onPress={() => handleOpenItemEdit(item)}
                    right={props => <List.Icon {...props} icon="cart-plus" color={colors.primary} />}
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

          {/* Quick Edit Add Item to Cart Panel */}
          {selectedItemToEdit && (
            <Card style={styles.editItemCard}>
              <Card.Content style={styles.editItemCardContent}>
                <Text style={styles.editItemTitle}>{selectedItemToEdit.name}</Text>
                
                {/* Custom price tiers pills */}
                <View style={styles.tierSection}>
                  <Text style={styles.tierLabel}>Select Pricing Tier:</Text>
                  <View style={styles.tierRow}>
                    <Pressable 
                      style={styles.tierChip}
                      onPress={() => setEditRate(String(selectedItemToEdit.defaultSellingPrice))}
                    >
                      <Text style={styles.tierChipLabel}>Regular</Text>
                      <Text style={styles.tierChipValue}>{money(selectedItemToEdit.defaultSellingPrice)}</Text>
                    </Pressable>

                    {selectedItemToEdit.minimumAllowedPrice && (
                      <Pressable 
                        style={styles.tierChip}
                        onPress={() => setEditRate(String(selectedItemToEdit.minimumAllowedPrice))}
                      >
                        <Text style={styles.tierChipLabel}>Min Price</Text>
                        <Text style={styles.tierChipValue}>{money(selectedItemToEdit.minimumAllowedPrice)}</Text>
                      </Pressable>
                    )}

                    {selectedCustomerId && customerLastRates[selectedItemToEdit.id] !== undefined && (
                      <Pressable 
                        style={[styles.tierChip, styles.lastPriceChip]}
                        onPress={() => setEditRate(String(customerLastRates[selectedItemToEdit.id]))}
                      >
                        <Text style={styles.lastPriceChipLabel}>Last Price</Text>
                        <Text style={styles.tierChipValue}>{money(customerLastRates[selectedItemToEdit.id])}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Form fields */}
                <View style={styles.itemFormRow}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Quantity"
                    value={editQty}
                    onChangeText={setEditQty}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Rate"
                    value={editRate}
                    onChangeText={setEditRate}
                    keyboardType="numeric"
                  />
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
                  <Button mode="outlined" style={styles.editItemButton} onPress={() => setSelectedItemToEdit(null)}>
                    Cancel
                  </Button>
                  <Button mode="contained" style={[styles.editItemButton, { backgroundColor: colors.primary }]} onPress={handleSaveItem}>
                    Add Item
                  </Button>
                </View>
              </Card.Content>
            </Card>
          )}
        </Section>

        {/* Cart Listing */}
        {cartArray.length > 0 && (
          <Section title="Sale Items">
            <View style={styles.cartContainer}>
              {cartArray.map((cartItem, idx) => (
                <View key={cartItem.item.id}>
                  {idx > 0 && <Divider style={styles.divider} />}
                  <SwipeableCartItem
                    cartItem={cartItem}
                    onEdit={() => handleOpenItemEdit(cartItem.item)}
                    onDelete={() => handleRemoveItem(cartItem.item.id)}
                    onQtyChange={(newQty) => handleUpdateQty(cartItem.item.id, newQty)}
                  />
                </View>
              ))}
              <View style={styles.cartSubtotalContainer}>
                <Text style={styles.cartSubtotalLabel}>Sale Total</Text>
                <Text style={styles.cartSubtotalValue}>{money(subtotal)}</Text>
              </View>
            </View>
          </Section>
        )}

        {/* Payment & Terms Section */}
        {cartArray.length > 0 && (
          <Section title="Payment Settings">
            <View style={styles.termsContainer}>
              {/* Cash Paid Amount */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>PAID AMOUNT (₹)</Text>
                <TextInput
                  style={styles.paymentInput}
                  value={paidAmountStr}
                  onChangeText={setPaidAmountStr}
                  keyboardType="numeric"
                  placeholder="0.00"
                />
              </View>

              {/* Payment Mode (only visible if paid amount is greater than 0) */}
              {paidAmount > 0 && (
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
                </View>
              )}

              {/* Outstanding Balance */}
              <View style={styles.balanceSummary}>
                <View style={styles.balanceInfo}>
                  <Text style={styles.balanceLabel}>Outstanding Balance</Text>
                  <Text style={[styles.balanceValue, balanceAmount > 0 && { color: colors.danger }]}>
                    {money(balanceAmount)}
                  </Text>
                </View>
                {balanceAmount > 0 && (
                  <View style={styles.creditDueDaysContainer}>
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
                )}
              </View>
            </View>
          </Section>
        )}

        {errorMsg && (
          <View style={styles.errorContainer}>
            <Icon source="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
      </ScrollView>

      {/* Checkout Button */}
      <View style={styles.footer}>
        <Button
          mode="contained"
          disabled={!selectedCustomerId || cartArray.length === 0 || saleMutation.isPending}
          loading={saleMutation.isPending}
          onPress={handleCheckout}
          style={[styles.checkoutButton, (!selectedCustomerId || cartArray.length === 0) && styles.checkoutButtonDisabled]}
          contentStyle={styles.checkoutButtonContent}
          labelStyle={styles.checkoutButtonLabel}
        >
          {balanceAmount > 0 ? "Sign & Confirm Sale" : "Complete Cash Sale"}
        </Button>
      </View>

      {/* Signature Modal */}
      <Modal
        visible={signatureModalVisible}
        animationType="slide"
        transparent={false}
      >
        <Screen edges={['top', 'bottom', 'left', 'right']}>
          <SignatureCanvas 
            onSave={triggerCheckoutSubmit} 
            onClose={() => setSignatureModalVisible(false)} 
          />
        </Screen>
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

const styles = StyleSheet.create({
  scrollContainer: {
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
  editItemCard: {
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.primaryMid,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  editItemCardContent: {
    padding: spacing.lg,
  },
  editItemTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  tierSection: {
    marginBottom: spacing.md,
  },
  tierLabel: {
    fontSize: fontSize.xs,
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    minWidth: 80,
  },
  tierChipLabel: {
    fontSize: fontSize.xs - 2,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  tierChipValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 2,
  },
  lastPriceChip: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryMid,
  },
  lastPriceChipLabel: {
    fontSize: fontSize.xs - 2,
    color: colors.primaryDark,
    fontWeight: fontWeight.bold,
  },
  itemFormRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  textInput: {
    flex: 1,
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
    marginBottom: spacing.md,
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
  },
  editItemButton: {
    flex: 1,
    borderRadius: radius.md,
  },
  cartContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  cartItemInfo: {
    flex: 1,
    paddingRight: spacing.md,
  },
  cartItemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cartItemDetails: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
  },
  inlineQtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
  },
  qtyBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: 'center',
  },
  cartItemPriceContainer: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  cartItemTotal: {
    fontSize: fontSize.md,
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
  divider: {
    backgroundColor: colors.border,
  },
  cartSubtotalContainer: {
    backgroundColor: colors.surfaceOffset,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
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
  termsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xl,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
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
  balanceSummary: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
    gap: spacing.md,
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
  creditDueDaysContainer: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
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

  // Signature Modal styles
  signatureContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  signatureHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  signatureTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  signatureSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  canvas: {
    height: 320,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.md,
  },
  canvasPlaceholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  placeholderText: {
    marginTop: spacing.sm,
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
  },
  signatureActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  sigButton: {
    flex: 1,
    borderRadius: radius.md,
  },
  Section: {
    marginVertical: spacing.sm,
  }
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
