import React, { useMemo, useState, memo, useCallback } from "react";
import { 
  View, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  TextInput as RNTextInput,
  ScrollView,
  Alert
} from "react-native";
import { Searchbar, Text, Icon, TextInput, SegmentedButtons } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { Item } from "../../api/client";
import { useItemsQuery } from "../../hooks/useItems";
import { useCreateSaleMutation } from "../../hooks/useSales";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { navigate, goBack } from "../navigation-ref";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

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

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.itemSubtitle}>
            {item.sku || "No SKU"} • {money(item.defaultSellingPrice)} / {item.unit}
          </Text>
          {isOutOfStock ? (
            <View style={styles.outOfStockBadge}>
              <Text style={styles.outOfStockText}>OUT OF STOCK</Text>
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
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [cart, setCart] = useState<Record<string, { item: Item, quantity: number }>>({});
  
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedSaleNumber, setCompletedSaleNumber] = useState<string | null>(null);

  // Walk-in Customer Info
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");

  const itemsQuery = useItemsQuery({ search: debouncedSearch, limit: 50 });

  const cartArray = useMemo(() => Object.values(cart), [cart]);
  const cartItemCount = useMemo(() => cartArray.reduce((sum, i) => sum + i.quantity, 0), [cartArray]);
  const cartTotal = useMemo(() => cartArray.reduce((sum, i) => sum + (i.quantity * Number(i.item.defaultSellingPrice)), 0), [cartArray]);

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
    saleMutation.mutate({
      items: cartArray.map(i => ({ 
        itemId: i.item.id, 
        quantity: i.quantity, 
        rate: Number(i.item.defaultSellingPrice) 
      })),
      isWalkin: true,
      customerInfo: customerName || customerPhone ? {
        name: customerName || undefined,
        phone: customerPhone || undefined,
      } : undefined,
      payments: [{
        paymentMode: paymentMode,
        amount: cartTotal
      }],
    }, {
      onSuccess: (res: any) => {
        setCompletedSaleNumber(res?.saleNumber || "N/A");
        setIsCompleted(true);
      }
    });
  };

  const List = FlashList as any;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {!isCompleted && (
          <AppHeader title="Walk-in Sale" subtitle="Select items and complete checkout" showBack />
        )}
        
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {!isCompleted ? (
            <View style={styles.stepContainer}>
              <Section title="Customer Details (Optional)">
                <View style={styles.formCard}>
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
                </View>
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
                  <List
                    data={itemsQuery.data?.items ?? []}
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
                      itemsQuery.isLoading ? (
                        <SkeletonList count={4} itemHeight={90} />
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

              <Section title="Payment Mode">
                <View style={styles.paymentGrid}>
                  {(["CASH", "UPI"] as const).map((mode) => {
                    const isSelected = paymentMode === mode;
                    const label = mode === "CASH" ? "Cash" : "UPI";
                    const icon = mode === "CASH" ? "cash" : "qrcode";
                    return (
                      <Pressable 
                        key={mode}
                        onPress={() => setPaymentMode(mode)}
                        style={[
                          styles.paymentCard,
                          isSelected && styles.paymentCardSelected
                        ]}
                      >
                        <Icon source={icon} size={28} color={isSelected ? colors.primaryDark : colors.textSecondary} />
                        <Text style={[styles.paymentCardLabel, isSelected && styles.paymentCardLabelActive]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>
            </View>
          ) : (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrapper}>
                <View style={styles.successPulseCircle}>
                  <Icon source="check-circle" size={80} color={colors.primary} />
                </View>
              </View>
              <Text style={styles.successTitle}>Sale Completed!</Text>
              <Text style={styles.successSubtitle}>
                Recorded walk-in sale of {money(cartTotal)} successfully.
              </Text>
              
              <View style={styles.receiptCard}>
                <View style={styles.receiptHeader}>
                  <Text style={styles.receiptShopName}>Vardaman Sales</Text>
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
                    <Text style={styles.receiptDetailVal}>{customerName || "Walk-in Customer"}</Text>
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
                </View>

                <View style={styles.dashedDivider} />

                {/* Payment Breakdown */}
                <View style={styles.receiptSection}>
                  <View style={[styles.receiptBreakdownRow, styles.receiptTotalRow]}>
                    <Text style={styles.receiptTotalLabel}>Total Amount</Text>
                    <Text style={styles.receiptTotalVal}>{money(cartTotal)}</Text>
                  </View>
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
                    setCustomerName("");
                    setCustomerPhone("");
                    setIsCompleted(false);
                    setCompletedSaleNumber(null);
                  }}
                  style={styles.newSaleBtn}
                />
                
                <View style={styles.receiptActionRow}>
                  <Button
                    label="Print Receipt"
                    variant="ghost"
                    icon="printer"
                    onPress={() => {
                      Alert.alert("Print", "Receipt sent to printing queue.");
                    }}
                    style={styles.receiptActionBtn}
                  />
                  <Button
                    label="Share"
                    variant="ghost"
                    icon="share-variant"
                    onPress={() => {
                      Alert.alert("Share", "Receipt shared successfully.");
                    }}
                    style={styles.receiptActionBtn}
                  />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {!isCompleted && cartItemCount > 0 && (
          <View style={styles.cartSummary}>
            <View style={styles.cartInfo}>
              <Text style={styles.cartCount}>{cartItemCount} items</Text>
              <Text style={styles.cartTotal}>{money(cartTotal)}</Text>
            </View>
            <Button 
              label="COMPLETE SALE →" 
              variant="success"
              onPress={handleCompleteSale} 
              loading={saleMutation.isPending}
              style={styles.checkoutButton}
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
  scrollContent: {
    paddingBottom: 140,
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
  listContent: {
    paddingBottom: 20,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  itemInfo: {
    flex: 1,
    paddingRight: spacing.md,
  },
  itemName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
    backgroundColor: 'rgba(200, 245, 96, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  stockText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  segmentedFilter: {
    marginTop: spacing.sm,
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
    paddingHorizontal: spacing.sm,
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
    ...shadow.sm,
  },
  paymentCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
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
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bg,
    marginTop: 20,
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
  receiptDetailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  receiptDetailVal: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
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
});
