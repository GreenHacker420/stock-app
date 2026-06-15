import React, { useState, useMemo, memo, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable, Modal, Alert } from "react-native";
import { Searchbar, Text, Icon, List, TextInput, Switch, SegmentedButtons, Divider } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { fetchCustomers, Item } from "../../api/client";
import { useItemsQuery } from "../../hooks/useItems";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useCreateSaleMutation } from "../../hooks/useSales";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { SignaturePad } from "../../components/ui/SignaturePad";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { goBack, navigate } from "../navigation-ref";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

type PaymentType = "CASH" | "UPI" | "BANK_TRANSFER" | "CREDIT";

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

const SwipeableCartItem = memo(({ 
  item, 
  quantity, 
  customRate,
  onUpdateRate,
  onUpdateQuantity,
  userRole
}: { 
  item: Item;
  quantity: number;
  customRate?: number;
  onUpdateRate: (rate: number | undefined) => void;
  onUpdateQuantity: (qty: number) => void;
  userRole?: string;
}) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [rateInput, setRateInput] = useState(String(customRate ?? item.defaultSellingPrice));
  const [rateError, setRateError] = useState<string | null>(null);

  useEffect(() => {
    setRateInput(String(customRate ?? item.defaultSellingPrice));
  }, [customRate, item.defaultSellingPrice]);

  const defaultPrice = Number(item.defaultSellingPrice || 0);
  const minPrice = item.minimumAllowedPrice !== null && item.minimumAllowedPrice !== undefined
    ? Number(item.minimumAllowedPrice)
    : defaultPrice;

  const currentRate = customRate !== undefined ? customRate : defaultPrice;

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);

  const handleStart = (clientX: number, clientY: number) => {
    touchStartX.current = clientX;
    touchStartY.current = clientY;
    isDragging.current = true;
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const deltaX = clientX - touchStartX.current;
    const deltaY = Math.abs(clientY - touchStartY.current);
    if (deltaX > 50 && deltaY < 30) {
      setShowEditModal(true);
      isDragging.current = false;
    }
  };

  const handleEnd = () => {
    isDragging.current = false;
  };

  return (
    <View 
      onTouchStart={(e) => {
        const touch = e.nativeEvent.touches[0];
        if (touch) handleStart(touch.pageX, touch.pageY);
      }}
      onTouchMove={(e) => {
        const touch = e.nativeEvent.touches[0];
        if (touch) handleMove(touch.pageX, touch.pageY);
      }}
      onTouchEnd={handleEnd}
      {...({
        onMouseDown: (e: any) => handleStart(e.clientX, e.clientY),
        onMouseMove: (e: any) => handleMove(e.clientX, e.clientY),
        onMouseUp: handleEnd,
        onMouseLeave: handleEnd,
        style: [styles.cartReviewRow, Platform.OS === 'web' ? { userSelect: 'none', touchAction: 'pan-y' } : {}]
      } as any)}
    >
      <View style={styles.cartItemLeft}>
        <Text style={styles.cartItemName}>{item.name}</Text>
        <View style={styles.priceEditTrigger}>
          <Text style={styles.cartItemPrice}>
            {money(currentRate)} / {item.unit}
          </Text>
          {customRate !== undefined && (
            <Text style={styles.customPriceLabel}> (Custom)</Text>
          )}
        </View>
      </View>
      
      <View style={styles.counterRow}>
        <Pressable 
          onPress={() => onUpdateQuantity(quantity - 1)}
          style={({ pressed }) => [styles.qtyButton, pressed && styles.buttonPressed]}
        >
          <Icon source="minus" size={18} color={colors.primary} />
        </Pressable>
        <View style={styles.qtyDisplay}>
          <Text style={styles.qtyText}>{quantity}</Text>
        </View>
        <Pressable 
          onPress={() => onUpdateQuantity(quantity + 1)}
          disabled={quantity >= (item.availableStock ?? 0)}
          style={({ pressed }) => [
            styles.qtyButton,
            quantity >= (item.availableStock ?? 0) && styles.disabledQtyButton,
            pressed && quantity < (item.availableStock ?? 0) && styles.buttonPressed
          ]}
        >
          <Icon source="plus" size={18} color={quantity >= (item.availableStock ?? 0) ? colors.textMuted : colors.primary} />
        </Pressable>
      </View>

      <View style={styles.cartItemRight}>
        <Text style={styles.cartItemSubtotal}>{money(quantity * currentRate)}</Text>
      </View>

      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Item Price</Text>
            <Text style={styles.modalItemName}>{item.name}</Text>
            
            <View style={styles.pricingDetailsGrid}>
              <View style={styles.pricingGridCell}>
                <Text style={styles.pricingGridLabel}>MRP</Text>
                <Text style={styles.pricingGridValue}>{item.mrp ? money(item.mrp) : "N/A"}</Text>
              </View>
              <View style={styles.pricingGridCell}>
                <Text style={styles.pricingGridLabel}>Selling Price</Text>
                <Text style={styles.pricingGridValue}>{money(item.defaultSellingPrice)}</Text>
              </View>
              <View style={styles.pricingGridCell}>
                <Text style={styles.pricingGridLabel}>Min Price</Text>
                <Text style={styles.pricingGridValue}>{item.minimumAllowedPrice ? money(item.minimumAllowedPrice) : money(item.defaultSellingPrice)}</Text>
              </View>
            </View>

            <TextInput
              mode="outlined"
              label="Selling Price (Rate)"
              value={rateInput}
              onChangeText={(val) => {
                setRateInput(val);
                const num = Number(val);
                if (isNaN(num) || num <= 0) {
                  setRateError("Please enter a valid price.");
                } else if (userRole === "STAFF" && num < minPrice) {
                  setRateError(`Staff cannot sell below minimum price of ${money(minPrice)}.`);
                } else {
                  setRateError(null);
                }
              }}
              keyboardType="numeric"
              style={styles.modalInput}
              outlineStyle={styles.inputOutline}
              left={<TextInput.Affix text="₹ " />}
              error={!!rateError}
            />
            {rateError ? (
              <Text style={styles.rateErrorText}>{rateError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <Button
                label="Reset"
                variant="ghost"
                onPress={() => {
                  setRateInput(String(item.defaultSellingPrice));
                  setRateError(null);
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setShowEditModal(false);
                  setRateInput(String(customRate ?? item.defaultSellingPrice));
                  setRateError(null);
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="Save"
                variant="success"
                disabled={!!rateError || !rateInput}
                onPress={() => {
                  const num = Number(rateInput);
                  if (!isNaN(num) && num > 0) {
                    if (num === defaultPrice) {
                      onUpdateRate(undefined); // Reset to default
                    } else {
                      onUpdateRate(num);
                    }
                    setShowEditModal(false);
                  }
                }}
                style={{ flex: 1.5 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}, (p, n) => 
  p.item.id === n.item.id && 
  p.quantity === n.quantity && 
  p.customRate === n.customRate && 
  p.userRole === n.userRole
);

export function RegularSale() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { activeShopId } = useShopStore();

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [debouncedItemSearch] = useDebounce(itemSearch, 300);

  const [cart, setCart] = useState<Record<string, { item: Item, quantity: number, customRate?: number }>>({});
  
  const [paymentType, setPaymentType] = useState<PaymentType>("CASH");
  const [partialPaymentMode, setPartialPaymentMode] = useState<"CASH" | "UPI">("CASH");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [isGstSale, setIsGstSale] = useState(false);
  const [customerSignature, setCustomerSignature] = useState<string | undefined>();
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const customersQuery = useQuery({
    queryKey: ["customers", activeShopId],
    queryFn: () => fetchCustomers(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const itemsQuery = useItemsQuery({ search: debouncedItemSearch, limit: 50 });

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
  const cartItemCount = useMemo(() => cartArray.reduce((sum, i) => sum + i.quantity, 0), [cartArray]);
  const cartTotal = useMemo(() => 
    cartArray.reduce((sum, i) => sum + (i.quantity * (i.customRate !== undefined ? i.customRate : Number(i.item.defaultSellingPrice))), 0), 
    [cartArray]
  );

  useEffect(() => {
    if (cartItemCount === 0 && currentStep > 1 && currentStep < 4) {
      setCurrentStep(1);
    }
  }, [cartItemCount, currentStep]);

  const balance = cartTotal - (Number(amountPaid) || (paymentType === "CREDIT" ? 0 : cartTotal));
  const isCredit = paymentType === "CREDIT" || balance > 0.01;

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
    if (!activeShopId) return;

    const payments = [];
    const paid = Number(amountPaid);
    if (paymentType !== "CREDIT") {
       const finalAmount = amountPaid === "" ? cartTotal : paid;
       if (finalAmount > 0) {
         payments.push({
           paymentMode: paymentType,
           amount: finalAmount,
         });
       }
    } else if (paid > 0) {
       payments.push({
         paymentMode: partialPaymentMode,
         amount: paid,
       });
     }

    const payload = {
      shopId: activeShopId,
      customerId: customerId || undefined,
      items: cartArray.map(i => ({ 
        itemId: i.item.id, 
        quantity: i.quantity, 
        rate: i.customRate !== undefined ? i.customRate : Number(i.item.defaultSellingPrice) 
      })),
      payments: payments.length > 0 ? payments : undefined,
      notes: notes || undefined,
      gstRequired: isGstSale,
      customerSignature,
    };

    saleMutation.mutate(payload, {
      onSuccess: () => {
        setCurrentStep(4);
      }
    });
  };

  const isFormValid = customerId && cartArray.length > 0 && (!isCredit || !!customerSignature);

  const FlashListAny = FlashList as any;

  const handleHeaderBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    } else if (currentStep === 3) {
      setCurrentStep(2);
    } else {
      goBack();
    }
  };

  const ProgressIndicator = ({ step }: { step: number }) => {
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressLine} />
        <View style={[styles.progressLineActive, { width: `${((step - 1) / 2) * 100}%` }]} />
        
        <View style={styles.progressStepsRow}>
          {[1, 2, 3].map((s) => {
            const isActive = s <= step;
            const isCurrent = s === step;
            return (
              <View key={s} style={[
                styles.progressNode,
                isActive && styles.progressNodeActive,
                isCurrent && styles.progressNodeCurrent
              ]}>
                {s < step ? (
                  <Icon source="check" size={14} color={colors.textInverse} />
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

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {currentStep < 4 && (
          <>
            <AppHeader 
              title="Regular Sale" 
              subtitle={currentStep === 1 ? "Select customer and items" : currentStep === 2 ? "Review items & settings" : "Payment & Settlement"} 
              showBack={true} 
              onBack={handleHeaderBack}
            />
            <ProgressIndicator step={currentStep} />
          </>
        )}

        <ScrollView 
          scrollEnabled={scrollEnabled} 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
        >
          {currentStep === 1 && (
            <View style={styles.stepContainer}>
              <Section title="Customer Details">
                {!selectedCustomer ? (
                  <View style={styles.formCard}>
                    <View style={styles.searchRow}>
                      <Searchbar
                        placeholder="Search customer name or phone..."
                        onChangeText={setCustomerSearch}
                        value={customerSearch}
                        style={[styles.searchBar, { flex: 1, marginBottom: 0 }]}
                        inputStyle={styles.searchInput}
                        elevation={0}
                      />
                      <Pressable 
                        onPress={() => navigate("AddEditCustomer")}
                        style={({ pressed }) => [styles.searchAddBtn, pressed && styles.pressed]}
                      >
                        <Icon source="account-plus" size={24} color={colors.primary} />
                      </Pressable>
                    </View>

                    {customerSearch && filteredCustomers.length === 0 ? (
                      <Pressable 
                        onPress={() => navigate("AddEditCustomer", { customer: { name: customerSearch } })}
                        style={styles.addNewCustomerRow}
                      >
                        <Icon source="account-plus-outline" size={20} color={colors.primary} />
                        <Text style={styles.addNewCustomerText}>
                          No matches. Create "{customerSearch}"?
                        </Text>
                      </Pressable>
                    ) : null}

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
                  </View>
                ) : (
                  <View style={styles.compactCustomerCard}>
                    <View style={styles.customerHeader}>
                      <View style={styles.customerAvatar}>
                        <Text style={styles.customerAvatarText}>{selectedCustomer.name[0].toUpperCase()}</Text>
                      </View>
                      <View style={styles.customerInfo}>
                        <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                        <Text style={styles.customerDetails}>{selectedCustomer.phone || "No phone"}</Text>
                      </View>
                      <Pressable onPress={() => setCustomerId(null)} style={styles.changeCustomerBtn}>
                         <Text style={styles.changeCustomerText}>CHANGE</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </Section>

              <Section title="Select Items">
                <Searchbar
                  placeholder="Search name or SKU..."
                  onChangeText={setItemSearch}
                  value={itemSearch}
                  style={styles.searchBar}
                  inputStyle={styles.searchInput}
                  elevation={0}
                />
                
                <View style={styles.listContainer}>
                  <FlashListAny
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
            </View>
          )}

          {currentStep === 2 && (
            <View style={styles.stepContainer}>
              <Section title="Selected Items">
                <View style={styles.formCard}>
                  {cartArray.map(({ item, quantity, customRate }) => (
                    <SwipeableCartItem
                      key={item.id}
                      item={item}
                      quantity={quantity}
                      customRate={customRate}
                      onUpdateRate={(rate) => {
                        setCart(prev => {
                          if (!prev[item.id]) return prev;
                          return {
                            ...prev,
                            [item.id]: {
                              ...prev[item.id],
                              customRate: rate
                            }
                          };
                        });
                      }}
                      onUpdateQuantity={(qty) => {
                        setCart(prev => {
                          if (!prev[item.id]) return prev;
                          if (qty === 0) {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          }
                          return {
                            ...prev,
                            [item.id]: {
                              ...prev[item.id],
                              quantity: qty
                            }
                          };
                        });
                      }}
                      userRole={user?.role}
                    />
                  ))}

                  <View style={styles.billSummaryBox}>
                    <View style={styles.billSummaryRow}>
                      <Text style={styles.billLabel}>Subtotal</Text>
                      <Text style={styles.billValue}>{money(cartTotal)}</Text>
                    </View>
                    <View style={styles.billSummaryRow}>
                      <Text style={styles.billLabel}>Discount</Text>
                      <Text style={styles.billValue}>₹0</Text>
                    </View>
                    <Divider style={styles.cardDivider} />
                    <View style={styles.billSummaryRow}>
                      <Text style={[styles.billLabel, styles.billLabelTotal]}>Total Amount</Text>
                      <Text style={[styles.billValue, styles.billValueTotal]}>{money(cartTotal)}</Text>
                    </View>
                  </View>
                </View>
              </Section>

              <Section title="Sale Settings">
                <View style={styles.formCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.fieldLabel}>GST INVOICE REQUIRED?</Text>
                    <Switch value={isGstSale} onValueChange={setIsGstSale} color={colors.primary} />
                  </View>

                  <TextInput
                    mode="outlined"
                    label="Sale Notes (Optional)"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={3}
                    style={styles.input}
                    outlineStyle={styles.inputOutline}
                  />
                </View>
              </Section>
            </View>
          )}

          {currentStep === 3 && (
            <View style={styles.stepContainer}>
              <View style={styles.totalDueCard}>
                <Text style={styles.totalDueLabel}>TOTAL AMOUNT DUE</Text>
                <Text style={styles.totalDueValue}>{money(cartTotal)}</Text>
              </View>

              <Section title="Payment Mode">
                <View style={styles.paymentGrid}>
                  {(["CASH", "UPI", "BANK_TRANSFER", "CREDIT"] as const).map((mode) => {
                    const isSelected = paymentType === mode;
                    const label = mode === "CASH" ? "Cash" : mode === "UPI" ? "UPI" : mode === "BANK_TRANSFER" ? "Bank" : "Credit";
                    const icon = mode === "CASH" ? "cash" : mode === "UPI" ? "qrcode" : mode === "BANK_TRANSFER" ? "bank" : "card-text-outline";
                    return (
                      <Pressable 
                        key={mode}
                        onPress={() => {
                          setPaymentType(mode);
                          if (mode === "CREDIT") {
                            setAmountPaid("0");
                          } else {
                            setAmountPaid(String(cartTotal));
                          }
                        }}
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

              {paymentType !== "CREDIT" && (
                <Section title="Amount Received">
                  <View style={styles.formCard}>
                    <TextInput
                      mode="outlined"
                      label="Amount Paid"
                      value={amountPaid}
                      onChangeText={setAmountPaid}
                      keyboardType="numeric"
                      style={styles.input}
                      outlineStyle={styles.inputOutline}
                      left={<TextInput.Affix text="₹ " />}
                    />
                    <View style={styles.suggestionsRow}>
                      <Pressable onPress={() => setAmountPaid(String(cartTotal))} style={styles.suggestionPill}>
                        <Text style={styles.suggestionPillText}>Exact</Text>
                      </Pressable>
                      {[100, 500, 1000, 2000].map((amt) => (
                        <Pressable 
                          key={amt} 
                          onPress={() => {
                            const current = Number(amountPaid) || 0;
                            setAmountPaid(String(current + amt));
                          }} 
                          style={styles.suggestionPill}
                        >
                          <Text style={styles.suggestionPillText}>+{money(amt)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </Section>
              )}

              {paymentType === "CREDIT" && Number(amountPaid) > 0 && (
                 <Section title="Partial Payment Details">
                   <View style={styles.formCard}>
                      <Text style={styles.fieldLabel}>HOW WAS THE {money(amountPaid)} PAID?</Text>
                      <SegmentedButtons
                        value={partialPaymentMode}
                        onValueChange={v => setPartialPaymentMode(v as any)}
                        buttons={[
                          { value: "CASH", label: "Cash", icon: "cash" },
                          { value: "UPI", label: "UPI", icon: "qrcode" },
                        ]}
                        theme={{ colors: { primary: colors.primary } }}
                      />
                   </View>
                 </Section>
              )}

              {isCredit && (
                <Section title="Customer Credit Authorization">
                  <View style={styles.formCard}>
                    <View style={styles.authHeader}>
                      <Text style={styles.signatureHeader}>CREDIT ACKNOWLEDGMENT</Text>
                      <Text style={styles.signatureSub}>Amount being credited: {money(balance)}</Text>
                    </View>
                    
                    <View style={styles.signaturePadWrapper}>
                       <SignaturePad 
                          onSave={setCustomerSignature} 
                          onClear={() => setCustomerSignature(undefined)} 
                          onDrawingStateChange={(isDrawing) => setScrollEnabled(!isDrawing)}
                       />
                    </View>
                    
                    <View style={styles.infoBox}>
                       <Icon source="information" size={16} color={colors.info} />
                       <Text style={styles.infoText}>Signature is mandatory for credit transactions.</Text>
                    </View>
                  </View>
                </Section>
              )}
            </View>
          )}

          {currentStep === 4 && (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrapper}>
                <Icon source="check-circle" size={80} color={colors.success} />
              </View>
              <Text style={styles.successTitle}>Sale Completed!</Text>
              <Text style={styles.successSubtitle}>
                Recorded sale of {money(cartTotal)} successfully.
              </Text>
              
              <View style={styles.receiptCard}>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Sale Number</Text>
                  <Text style={styles.receiptValue}>{(saleMutation.data as any)?.saleNumber || "N/A"}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Customer</Text>
                  <Text style={styles.receiptValue}>{selectedCustomer?.name}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Payment Mode</Text>
                  <Text style={styles.receiptValue}>{paymentType}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Amount Received</Text>
                  <Text style={styles.receiptValue}>{money(amountPaid || (paymentType === "CREDIT" ? 0 : cartTotal))}</Text>
                </View>
                {Number(amountPaid) > cartTotal && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Change Returned</Text>
                    <Text style={[styles.receiptValue, { color: colors.success }]}>
                      {money(Number(amountPaid) - cartTotal)}
                    </Text>
                  </View>
                )}
                {isCredit && balance > 0 && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Balance to Credit</Text>
                    <Text style={[styles.receiptValue, { color: colors.danger }]}>
                      {money(balance)}
                    </Text>
                  </View>
                )}
              </View>
              
              <Button
                label="START NEW SALE"
                variant="success"
                onPress={() => {
                  setCart({});
                  setCustomerId(null);
                  setAmountPaid("");
                  setNotes("");
                  setCustomerSignature(undefined);
                  setIsGstSale(false);
                  setCurrentStep(1);
                }}
                style={styles.newSaleBtn}
              />
            </View>
          )}

        </ScrollView>

        {currentStep === 1 && (
          <View style={styles.bottomBar}>
            <View style={styles.bottomBarLeft}>
              <Text style={styles.bottomBarCount}>{cartItemCount} items</Text>
              <Text style={styles.bottomBarTotal}>{money(cartTotal)}</Text>
            </View>
            <View style={{ flex: 1.5, gap: 4 }}>
              <Button 
                label="Proceed to Checkout →" 
                variant="success"
                onPress={() => setCurrentStep(2)} 
                disabled={!customerId || cartItemCount === 0}
              />
              {!customerId && cartItemCount > 0 && (
                <Text style={styles.helperWarning}>* Select a customer above to proceed</Text>
              )}
            </View>
          </View>
        )}

        {currentStep === 2 && (
          <View style={styles.bottomBar}>
            <Button 
              label="← Add Items" 
              variant="ghost"
              onPress={() => setCurrentStep(1)} 
              style={{ flex: 1 }}
            />
            <Button 
              label={`Payment (${money(cartTotal)}) →`} 
              variant="success"
              onPress={() => setCurrentStep(3)} 
              style={{ flex: 1.5 }}
            />
          </View>
        )}

        {currentStep === 3 && (
          <View style={styles.bottomBar}>
            <Button 
              label="← Review" 
              variant="ghost"
              onPress={() => setCurrentStep(2)} 
              style={{ flex: 1 }}
            />
            <Button 
              label="COMPLETE SALE →" 
              variant="success"
              onPress={handleCompleteSale} 
              loading={saleMutation.isPending}
              disabled={!isFormValid}
              style={{ flex: 1.5 }}
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
  stepContainer: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
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
    marginBottom: spacing.xs,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
  searchDropdown: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listContainer: {
    minHeight: 200,
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
  selectedCustomerCard: {
    gap: spacing.md,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  },
  changeCustomerBtn: {
    backgroundColor: colors.surfaceOffset,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
  },
  changeCustomerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  authHeader: {
    marginBottom: spacing.sm,
  },
  signatureHeader: {
    fontSize: 12,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  signatureSub: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.danger,
    marginTop: 2,
  },
  signaturePadWrapper: {
    height: 350,
    backgroundColor: colors.surface,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  infoText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  progressContainer: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 60,
  },
  progressLine: {
    position: 'absolute',
    height: 3,
    backgroundColor: colors.surfaceOffset,
    left: 80,
    right: 80,
    zIndex: 1,
  },
  progressLineActive: {
    position: 'absolute',
    height: 3,
    backgroundColor: colors.primary,
    left: 80,
    zIndex: 2,
  },
  progressStepsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  progressNode: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressNodeActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  progressNodeCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  progressNodeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  progressNodeTextActive: {
    color: colors.textPrimary,
  },
  bottomBar: {
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
    gap: spacing.md,
    ...shadow.lg,
  },
  bottomBarLeft: {
    flex: 1,
  },
  bottomBarCount: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  bottomBarTotal: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  compactCustomerCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cartReviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  cartItemLeft: {
    flex: 1.5,
    marginRight: spacing.sm,
  },
  cartItemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cartItemPrice: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cartItemRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cartItemSubtotal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  billSummaryBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  billSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  billValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  billLabelTotal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  billValueTotal: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
  },
  cardDivider: {
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  totalDueCard: {
    backgroundColor: colors.primaryLight,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  totalDueLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
    letterSpacing: 1,
  },
  totalDueValue: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  paymentCard: {
    flex: 1,
    minWidth: '45%',
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
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  suggestionPill: {
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bg,
    marginTop: 40,
  },
  successIconWrapper: {
    marginBottom: spacing.lg,
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
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  receiptValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  newSaleBtn: {
    width: '100%',
  },
  helperWarning: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.danger,
    textAlign: 'center',
  },
  priceEditTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  customPriceLabel: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: fontWeight.bold,
    marginRight: spacing.xs,
  },
  pencilIconWrapper: {
    opacity: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  modalItemName: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  pricingDetailsGrid: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.md,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  pricingGridCell: {
    alignItems: 'center',
    flex: 1,
  },
  pricingGridLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
    marginBottom: 2,
  },
  pricingGridValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  modalInput: {
    backgroundColor: colors.surface,
  },
  rateErrorText: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
  addNewCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
  },
  addNewCustomerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
