import React, { useState, useMemo, useRef, memo, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { Searchbar, Text, Icon, List, Divider, Card, Switch, TextInput, Modal, Portal } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { fetchCustomers, fetchItems, fetchCustomerPriceHistory, createSale, Item, Customer } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useCreateSaleMutation } from "../../hooks/useSales";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

type SaleStep = 1 | 2 | 3;
type PaymentType = "CASH" | "UPI" | "BANK_TRANSFER" | "CREDIT";

export function RegularSale() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();

  const [step, setStep] = useState<SaleStep>(1);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [debouncedItemSearch] = useDebounce(itemSearch, 300);

  // Cart: Record<itemId, { item, quantity, rate }>
  const [cart, setCart] = useState<Record<string, { item: Item, quantity: number, rate: number }>>({});
  const [isEditingItem, setIsEditingItem] = useState(false);
  const [selectedCartItem, setSelectedCartItem] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editRate, setEditRate] = useState("");

  // Payment State
  const [paymentType, setPaymentType] = useState<PaymentType>("CASH");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [isGstSale, setIsGstSale] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  // Queries
  const customersQuery = useQuery({
    queryKey: ["customers", activeShopId],
    queryFn: () => fetchCustomers(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const itemsQuery = useQuery({
    queryKey: ["items", activeShopId, debouncedItemSearch],
    queryFn: () => fetchItems(token ?? "", activeShopId ?? "", { search: debouncedItemSearch }),
    enabled: !!token && !!activeShopId,
  });

  const selectedCustomer = useMemo(() => 
    customersQuery.data?.find(c => c.id === customerId),
    [customersQuery.data, customerId]
  );

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    return (customersQuery.data ?? []).filter(c =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearch))
    ).slice(0, 5);
  }, [customersQuery.data, customerSearch]);

  const cartArray = useMemo(() => Object.values(cart), [cart]);
  const subtotal = useMemo(() => cartArray.reduce((sum, i) => sum + (i.quantity * i.rate), 0), [cartArray]);

  // Mutations
  const saleMutation = useCreateSaleMutation();

  const handleSelectItem = (item: Item) => {
    const existing = cart[item.id];
    setCart(prev => ({
      ...prev,
      [item.id]: existing 
        ? { ...existing, quantity: existing.quantity + 1 }
        : { item, quantity: 1, rate: Number(item.defaultSellingPrice) }
    }));
    setItemSearch("");
  };

  const handleEditItem = (itemId: string) => {
    const cartItem = cart[itemId];
    setSelectedCartItem(itemId);
    setEditQty(String(cartItem.quantity));
    setEditRate(String(cartItem.rate));
    setIsEditingItem(true);
  };

  const handleSaveItem = () => {
    if (!selectedCartItem) return;
    setCart(prev => ({
      ...prev,
      [selectedCartItem]: {
        ...prev[selectedCartItem],
        quantity: Number(editQty) || 1,
        rate: Number(editRate) || 0
      }
    }));
    setIsEditingItem(false);
    setSelectedCartItem(null);
  };

  const handleRemoveItem = (itemId: string) => {
    setCart(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleCompleteSale = () => {
    const payload = {
      customerId: customerId ?? "",
      items: cartArray.map(i => ({ itemId: i.item.id, quantity: i.quantity, rate: i.rate })),
      payments: paymentType !== "CREDIT" ? [{
        paymentMode: paymentType,
        amount: Number(amountPaid) || subtotal,
      }] : [],
      notes: notes || undefined,
      isGstRequired: isGstSale,
    };

    saleMutation.mutate(payload, {
      onSuccess: () => setSuccessVisible(true)
    });
  };

  const handleNext = () => {
    if (step === 1 && customerId && cartArray.length > 0) setStep(2);
    else if (step === 2) handleCompleteSale();
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Regular Sale" subtitle={step === 1 ? "Billing & Items" : "Settlement"} showBack />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex1}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          {step === 1 ? (
            <>
              {/* Customer Selection */}
              <Section title="1. Select Customer">
                {!selectedCustomer ? (
                  <View style={styles.searchSectionContainer}>
                    <Searchbar
                      placeholder="Search customer name or phone..."
                      onChangeText={setCustomerSearch}
                      value={customerSearch}
                      style={styles.searchBar}
                      inputStyle={styles.searchInput}
                    />
                    {customerSearch ? (
                      <View style={styles.searchDropdown}>
                        {filteredCustomers.map(c => (
                          <List.Item
                            key={c.id}
                            title={c.name}
                            description={c.phone}
                            onPress={() => { setCustomerId(c.id); setCustomerSearch(""); }}
                            right={props => <List.Icon {...props} icon="account-check-outline" color={colors.primary} />}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <Card style={styles.selectedCustomerCard}>
                    <Card.Content style={styles.customerCardContent}>
                      <View style={styles.customerAvatar}>
                        <Text style={styles.customerAvatarText}>{selectedCustomer.name[0].toUpperCase()}</Text>
                      </View>
                      <View style={styles.customerInfo}>
                        <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                        <Text style={styles.customerDetails}>{selectedCustomer.phone}</Text>
                      </View>
                      <Button variant="ghost" label="CHANGE" onPress={() => setCustomerId(null)} />
                    </Card.Content>
                  </Card>
                )}
              </Section>

              {/* Item Selection & Cart */}
              <Section title="2. Add Items">
                <View style={styles.searchSectionContainer}>
                  <Searchbar
                    placeholder="Search by name or SKU..."
                    onChangeText={setItemSearch}
                    value={itemSearch}
                    style={styles.searchBar}
                    inputStyle={styles.searchInput}
                  />
                  {itemSearch ? (
                    <View style={styles.searchDropdown}>
                      {itemsQuery.data?.items.map(item => (
                        <List.Item
                          key={item.id}
                          title={item.name}
                          description={`${money(item.defaultSellingPrice)} / ${item.unit}`}
                          onPress={() => handleSelectItem(item)}
                          right={props => <List.Icon {...props} icon="plus-circle-outline" color={colors.primary} />}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.cartContainer}>
                  {cartArray.map((cartItem) => (
                    <SwipeableCartItem 
                      key={cartItem.item.id} 
                      cartItem={cartItem} 
                      onEdit={() => handleEditItem(cartItem.item.id)}
                      onDelete={() => handleRemoveItem(cartItem.item.id)}
                      onQtyChange={(newQty) => {
                        setCart(prev => ({
                          ...prev,
                          [cartItem.item.id]: { ...cartItem, quantity: newQty }
                        }));
                      }}
                    />
                  ))}
                  {cartArray.length > 0 && (
                    <View style={styles.cartSubtotalContainer}>
                      <Text style={styles.cartSubtotalLabel}>Subtotal</Text>
                      <Text style={styles.cartSubtotalValue}>{money(subtotal)}</Text>
                    </View>
                  )}
                </View>
              </Section>
            </>
          ) : (
            <>
              {/* Payment & Settlement */}
              <Section title="3. Payment Mode">
                <View style={styles.paymentTypeSelectorRow}>
                  {(["CASH", "UPI", "BANK_TRANSFER", "CREDIT"] as PaymentType[]).map(type => (
                    <Pressable 
                      key={type}
                      onPress={() => setPaymentType(type)}
                      style={[styles.paymentTypeCard, paymentType === type && styles.paymentTypeCardActive]}
                    >
                      <Text style={[styles.paymentTypeTitle, paymentType === type && styles.paymentTypeTitleActive]}>{type.replace('_', ' ')}</Text>
                    </Pressable>
                  ))}
                </View>
              </Section>

              <Section title="4. Final Settlement">
                <View style={styles.termsContainer}>
                   <TextInput
                     mode="outlined"
                     label="Amount Received Now"
                     value={amountPaid}
                     onChangeText={setAmountPaid}
                     keyboardType="numeric"
                     placeholder={String(subtotal)}
                     style={styles.paymentInput}
                     outlineStyle={{ borderRadius: radius.md }}
                   />
                   
                   <View style={styles.fieldBlock}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.fieldLabel}>GST INVOICE REQUIRED?</Text>
                        <Switch value={isGstSale} onValueChange={setIsGstSale} color={colors.primary} />
                      </View>
                   </View>

                   <TextInput
                     mode="outlined"
                     label="Sale Notes (Optional)"
                     value={notes}
                     onChangeText={setNotes}
                     multiline
                     numberOfLines={3}
                     placeholder="Shipping details, reference numbers, etc."
                     outlineStyle={{ borderRadius: radius.md }}
                   />

                   <View style={styles.balanceSummary}>
                      <View style={styles.balanceInfo}>
                         <Text style={styles.balanceLabel}>Total Sale Value</Text>
                         <Text style={styles.balanceValue}>{money(subtotal)}</Text>
                      </View>
                      <View style={styles.balanceInfo}>
                         <Text style={styles.balanceLabel}>Balance to Credit</Text>
                         <Text style={[styles.balanceValue, { color: colors.danger }]}>{money(subtotal - (Number(amountPaid) || 0))}</Text>
                      </View>
                   </View>
                </View>
              </Section>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button 
            label={step === 1 ? "NEXT: SETTLEMENT →" : "FINALIZE SALE"} 
            variant="success"
            onPress={handleNext}
            disabled={!customerId || cartArray.length === 0 || saleMutation.isPending}
            loading={saleMutation.isPending}
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>

      {/* Edit Item Modal */}
      <Portal>
        <Modal visible={isEditingItem} onDismiss={() => setIsEditingItem(false)} contentContainerStyle={styles.modalContent}>
          {selectedCartItem && (
            <View>
              <Text style={styles.editItemTitle}>{cart[selectedCartItem].item.name}</Text>
              
              <View style={styles.itemFormRow}>
                <View style={styles.flex1}>
                  <Text style={styles.inputFieldLabel}>Quantity ({cart[selectedCartItem].item.unit})</Text>
                  <TextInput mode="outlined" value={editQty} onChangeText={setEditQty} keyboardType="numeric" outlineStyle={{ borderRadius: radius.md }} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.inputFieldLabel}>Rate per unit (₹)</Text>
                  <TextInput mode="outlined" value={editRate} onChangeText={setEditRate} keyboardType="numeric" outlineStyle={{ borderRadius: radius.md }} />
                </View>
              </View>

              <View style={styles.editItemActions}>
                <Button variant="ghost" label="Cancel" onPress={() => setIsEditingItem(false)} style={styles.editItemButton} />
                <Button label="Save Changes" onPress={handleSaveItem} style={styles.editItemButton} />
              </View>
            </View>
          )}
        </Modal>
      </Portal>

      <SuccessModal
        visible={successVisible}
        title="Sale Completed"
        message={`Sale has been successfully registered. Final amount: ${money(subtotal)}`}
        onClose={() => {
          setSuccessVisible(false);
          setCart({});
          goBack();
        }}
      />
    </Screen>
  );
}

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
  return (
    <View style={styles.cartItemCard}>
      <View style={styles.cartItemRow}>
        <View style={styles.cartItemInfo}>
          <Text style={styles.cartItemName} numberOfLines={1}>{cartItem.item.name}</Text>
          <Text style={styles.cartItemDetails}>
            {money(cartItem.rate)} / {cartItem.item.unit}
          </Text>
        </View>

        <View style={styles.inlineQtyContainer}>
          <Pressable onPress={() => onQtyChange(Math.max(1, cartItem.quantity - 1))} style={styles.qtyBtn}>
            <Icon source="minus" size={16} color={colors.primary} />
          </Pressable>
          <Text style={styles.qtyText}>{cartItem.quantity}</Text>
          <Pressable onPress={() => onQtyChange(cartItem.quantity + 1)} style={styles.qtyBtn}>
            <Icon source="plus" size={16} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.cartItemPriceContainer}>
          <Text style={styles.cartItemTotal}>{money(cartItem.quantity * cartItem.rate)}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Pressable onPress={onEdit}><Icon source="pencil" size={16} color={colors.info} /></Pressable>
            <Pressable onPress={onDelete}><Icon source="delete" size={16} color={colors.danger} /></Pressable>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  scrollContainer: { flexGrow: 1, paddingBottom: 140 },
  searchSectionContainer: { position: 'relative', zIndex: 10 },
  searchBar: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, elevation: 0 },
  searchInput: { fontSize: fontSize.md },
  searchDropdown: { marginTop: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.md, zIndex: 50, overflow: 'hidden' },
  selectedCustomerCard: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primaryMid, borderRadius: radius.lg, ...shadow.sm },
  customerCardContent: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  customerAvatarText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primaryDark },
  customerInfo: { flex: 1 },
  customerName: { fontSize: fontSize.md, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  customerDetails: { fontSize: fontSize.xs, color: colors.textSecondary },
  cartContainer: { gap: spacing.sm, marginTop: spacing.md },
  cartItemCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.2, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  cartItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  cartItemInfo: { flex: 1, paddingRight: spacing.sm },
  cartItemName: { fontSize: fontSize.md - 1, fontWeight: fontWeight.bold, color: colors.textPrimary },
  cartItemDetails: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 3 },
  inlineQtyContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.2, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surfaceOffset },
  qtyBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary, minWidth: 20, textAlign: 'center' },
  cartItemPriceContainer: { alignItems: 'flex-end', minWidth: 72 },
  cartItemTotal: { fontSize: fontSize.md - 1, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  cartSubtotalContainer: { backgroundColor: colors.surfaceOffset, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1.2, borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', marginTop: spacing.md },
  cartSubtotalLabel: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textSecondary },
  cartSubtotalValue: { fontSize: fontSize.xl, fontWeight: fontWeight.black, color: colors.primary },
  paymentTypeSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.lg },
  paymentTypeCard: { flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', ...shadow.sm },
  paymentTypeCardActive: { borderColor: colors.primary, backgroundColor: colors.bg },
  paymentTypeTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textSecondary },
  paymentTypeTitleActive: { color: colors.primaryDark, fontWeight: fontWeight.extrabold },
  termsContainer: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, padding: spacing.lg, gap: spacing.lg, ...shadow.sm },
  fieldBlock: { gap: spacing.sm },
  fieldLabel: { fontSize: 10, fontWeight: fontWeight.extrabold, color: colors.textSecondary, letterSpacing: 0.5 },
  paymentInput: { backgroundColor: colors.surfaceOffset },
  balanceSummary: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  balanceInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textSecondary },
  balanceValue: { fontSize: fontSize.xl, fontWeight: fontWeight.black, color: colors.textPrimary },
  footer: { padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1.5, borderTopColor: colors.border, ...shadow.lg },
  modalContent: { backgroundColor: colors.surface, margin: spacing.xl, padding: spacing.xl, borderRadius: radius.xl },
  editItemTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing.lg },
  itemFormRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  inputFieldLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSecondary, marginBottom: spacing.xs },
  editItemActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  editItemButton: { flex: 1 },
});

const Section = memo(({ title, children }: { title: string, children: React.ReactNode }) => {
  return (
    <View style={{ marginHorizontal: spacing.lg, marginVertical: spacing.md }}>
      <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing.md }}>{title}</Text>
      {children}
    </View>
  );
});
