import { useMemo, useState } from "react";
import { Alert, ScrollView, View, Pressable, StyleSheet, Platform, TextInput as RNTextInput, KeyboardAvoidingView, useWindowDimensions, PixelRatio } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, Searchbar, List, Divider, Card, Icon, SegmentedButtons, TextInput } from "react-native-paper";
import { useDebounce } from "use-debounce";
import * as Haptics from "expo-haptics";

import { createOrder, fetchItems, fetchStaff, Item, Customer } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { useCustomersQuery } from "../../hooks/useCustomers";
import { newIdempotencyKey } from "../../utils/idempotency";
import { requireActiveShopId } from "../../hooks/useActiveShop";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../../theme';
import { goBack } from "../navigation-ref";

const internetRequiredMessage = "Internet connection required. Please connect to the internet to complete this action.";

type OrderPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

interface PriorityButton {
  label: string;
  value: OrderPriority;
}

const priorities: PriorityButton[] = [
  { label: "Low", value: "LOW" },
  { label: "Normal", value: "NORMAL" },
  { label: "High", value: "HIGH" },
  { label: "Urgent", value: "URGENT" },
];

interface CartItem {
  id: string;
  name: string;
  quantity: number;
  rate: number;
  unit: string;
}

export function CreateOrder() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();
  const network = useNetworkStatus();

  // Screen Dimensions for Responsive / Mobile-First UI
  const { width: screenWidth } = useWindowDimensions();
  const isTablet = screenWidth > 768; // Tablet breakpoint
  const isSmallMobile = screenWidth < 365;

  // Dynamic Font Size scale factor
  const fontScale = useMemo(() => {
    if (isTablet) return 1.15;
    if (isSmallMobile) return 0.9;
    return 1.0;
  }, [isTablet, isSmallMobile]);

  const dynamicFontSize = (baseSize: number) => {
    return Math.round(baseSize * fontScale);
  };

  // Selected party object
  const [selectedParty, setSelectedParty] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch] = useDebounce(customerSearch, 300);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [debouncedItemSearch] = useDebounce(itemSearch, 300);

  // Advanced details collapse toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Order settings
  const [assignedStaffId, setAssignedStaffId] = useState<string | null>(null);
  const [expectedOffsetDays, setExpectedOffsetDays] = useState<number>(1); // default: 1 day (tomorrow)
  const [priority, setPriority] = useState<OrderPriority>("NORMAL");
  const [notes, setNotes] = useState("");

  // Modal feedback
  const [successVisible, setSuccessVisible] = useState(false);
  const [lastPlacedPartyName, setLastPlacedPartyName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Queries
  const customersQuery = useCustomersQuery({
    search: debouncedCustomerSearch,
    limit: debouncedCustomerSearch ? 20 : 50,
    enabled: !network.isOffline,
  });

  const itemsQuery = useQuery({
    queryKey: ["items", activeShopId, debouncedItemSearch],
    queryFn: () => {
      if (!token) return Promise.resolve({ items: [], total: 0, page: 1, limit: 50, hasMore: false });
      return fetchItems(token, activeShopId ?? "", {
        search: debouncedItemSearch,
        limit: debouncedItemSearch ? 20 : 50,
      });
    },
    enabled: !!token && !!activeShopId && !network.isOffline,
  });

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => {
      if (!token) return Promise.resolve([]);
      return fetchStaff(token);
    },
    enabled: !!token,
  });

  // Filters for dropdown lists
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    const source = customersQuery.data ?? [];
    return source.slice(0, 5);
  }, [customersQuery.data, customerSearch]);

  const filteredItems = useMemo(() => {
    if (!itemSearch) return [];
    const source = network.isOffline ? [] : (itemsQuery.data?.items ?? []);
    return source.slice(0, 5);
  }, [itemSearch, itemsQuery.data, network.isOffline]);

  // Recent lists when searches are empty
  const recentParties = useMemo(() => {
    const source = customersQuery.data ?? [];
    return source.slice(0, 5);
  }, [customersQuery.data]);

  const recentItems = useMemo(() => {
    const source = network.isOffline ? [] : (itemsQuery.data?.items ?? []);
    return source.slice(0, 5);
  }, [itemsQuery.data, network.isOffline]);

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  }, [cart]);

  // Expected dispatch date formatter
  const dispatchDateText = useMemo(() => {
    const dispatchDate = new Date(Date.now() + expectedOffsetDays * 86400000);
    const dateStr = dispatchDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    if (expectedOffsetDays === 1) {
      return `Tomorrow (${dateStr})`;
    }
    return `In ${expectedOffsetDays} Days (${dateStr})`;
  }, [expectedOffsetDays]);

  // Responsive expected dispatch pills width calculations
  const dayPillWidth = useMemo(() => {
    const gaps = 4 * spacing.sm;
    // On tablet, the right column holds advanced details (width = 48% of screen)
    const containerWidth = isTablet ? (screenWidth * 0.48) : screenWidth;
    const margins = isTablet ? (spacing.lg * 2) : (spacing.lg * 4);
    const availableWidth = containerWidth - margins - gaps;
    return Math.floor(availableWidth / 5);
  }, [screenWidth, isTablet]);

  // Order submission mutation
  const orderMutation = useMutation({
    mutationFn: () => {
      if (!token) {
        throw new Error("User token missing. Please log in again.");
      }
      if (network.isOffline) {
        throw new Error(internetRequiredMessage);
      }
      if (!selectedParty) {
        throw new Error("Please select a party first.");
      }
      if (cart.length === 0) {
        throw new Error("Your cart is empty.");
      }

      const dispatchDate = new Date(Date.now() + expectedOffsetDays * 86400000);
      return createOrder(token, {
        shopId: requireActiveShopId(activeShopId),
        customerId: selectedParty.id,
        assignedStaffId: assignedStaffId || undefined,
        expectedDispatchDate: dispatchDate.toISOString(),
        priority,
        ownerNotes: notes || undefined,
        items: cart.map(i => ({
          itemId: i.id,
          quantityOrdered: i.quantity,
          rate: i.rate,
        })),
      }, { idempotencyKey: newIdempotencyKey("ORDER") });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      // Preserve party name before resetting state
      setLastPlacedPartyName(selectedParty?.name || "Party");
      setCart([]);
      setSelectedParty(null);
      setAssignedStaffId(null);
      setNotes("");
      setExpectedOffsetDays(1);
      setPriority("NORMAL");
      setSuccessVisible(true);
      setErrorMsg(null);
    },
    onError: (err: Error) => {
      if (err.message === internetRequiredMessage) {
        Alert.alert("Internet required", internetRequiredMessage);
      }
      setErrorMsg(err.message || "Failed to create order");
    }
  });

  // POS Add Item Action
  const handleAddItemToCart = (item: Item) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    setCart(prevCart => {
      const existing = prevCart.find(c => c.id === item.id);
      if (existing) {
        return prevCart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      } else {
        return [...prevCart, {
          id: item.id,
          name: item.name,
          quantity: 1,
          rate: Number(item.defaultSellingPrice) || 0,
          unit: item.unit
        }];
      }
    });
    setItemSearch(""); // Clear search bar for fast consecutive inputs
  };

  // Stepper handlers
  const handleUpdateQty = (itemId: string, delta: number) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setCart(prev => prev.map(c => {
      if (c.id === itemId) {
        const nextQty = Math.max(1, c.quantity + delta);
        return { ...c, quantity: nextQty };
      }
      return c;
    }));
  };

  const handleUpdateRate = (itemId: string, newRateStr: string) => {
    const rate = Number(newRateStr);
    if (!isNaN(rate)) {
      setCart(prev => prev.map(c => c.id === itemId ? { ...c, rate } : c));
    }
  };

  const handleRemoveCartItem = (itemId: string) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setCart(prev => prev.filter(c => c.id !== itemId));
  };

  const handleStaffSelect = (staffId: string | null) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setAssignedStaffId(staffId);
  };

  const handlePriorityChange = (value: string) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setPriority(value as OrderPriority);
  };

  const handleOffsetSelect = (days: number) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setExpectedOffsetDays(days);
  };

  // Inline validation label
  const validationMessage = useMemo(() => {
    if (!selectedParty) {
      return "Select a party to place order";
    }
    if (cart.length === 0) {
      return "Add items to cart to place order";
    }
    if (network.isOffline) {
      return "App is offline. Connection required to place order.";
    }
    return null;
  }, [selectedParty, cart, network.isOffline]);

  // Shared Collapsible Advanced Section UI
  const renderAdvancedDetails = () => (
    <View style={styles.sectionContainer}>
      <Pressable 
        onPress={() => {
          if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setShowAdvanced(prev => !prev);
        }}
        style={styles.advancedHeaderCard}
      >
        <View style={styles.advancedHeaderLeft}>
          <Icon source="cog-outline" size={18} color={colors.primary} />
          <Text style={[styles.advancedHeaderTitle, { fontSize: dynamicFontSize(13) }]}>Advanced Details (Optional)</Text>
        </View>
        <Icon source={showAdvanced ? "chevron-up" : "chevron-down"} size={20} color={colors.textMuted} />
      </Pressable>

      {showAdvanced && (
        <Card style={styles.advancedSettingsCard}>
          <Card.Content style={styles.advancedContent}>
            {/* Staff Select */}
            <Text style={styles.fieldLabel}>ASSIGN STAFF</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffScroll}>
              <Pressable
                onPress={() => handleStaffSelect(null)}
                style={[styles.staffPill, assignedStaffId === null && styles.staffPillActive]}
              >
                <Text style={[styles.staffPillText, assignedStaffId === null && styles.staffPillTextActive]}>Any Staff</Text>
              </Pressable>
              {staffQuery.data?.map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => handleStaffSelect(s.id)}
                  style={[styles.staffPill, assignedStaffId === s.id && styles.staffPillActive]}
                >
                  <Text style={[styles.staffPillText, assignedStaffId === s.id && styles.staffPillTextActive]}>{s.name.split(' ')[0]}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Priority */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>PRIORITY</Text>
            <SegmentedButtons
              value={priority}
              onValueChange={handlePriorityChange}
              buttons={priorities}
              style={styles.priorityBtns}
              theme={{ colors: { primary: colors.primary } }}
            />

            {/* Offset days */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>EXPECTED DISPATCH</Text>
            <View style={styles.dispatchRow}>
              {[1, 2, 3, 5, 7].map(days => (
                <Pressable
                  key={days}
                  onPress={() => handleOffsetSelect(days)}
                  style={[
                    styles.dayPill, 
                    expectedOffsetDays === days && styles.dayPillActive,
                    { width: dayPillWidth }
                  ]}
                >
                  <Text style={[styles.dayPillText, expectedOffsetDays === days && styles.dayPillTextActive]}>{days}D</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.dispatchHelperText}>Dispatch: <Text style={{ fontWeight: 'bold' }}>{dispatchDateText}</Text></Text>

            {/* Notes */}
            <TextInput
              mode="outlined"
              label="Fulfillment Notes"
              placeholder="Packaging instructions or delivery notes..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.notesTextInput}
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
            />
          </Card.Content>
        </Card>
      )}
    </View>
  );

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Create Order" subtitle="Take party order" />

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={[
            styles.scrollContainer, 
            { paddingBottom: isTablet ? spacing.xl : (isSmallMobile ? 150 : 160) }
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {isTablet ? (
            /* RESPONSIVE TABLET TWO-COLUMN SPLIT POS */
            <View style={styles.tabletContainer}>
              {/* Left Column - Party & Products */}
              <View style={styles.tabletColumnLeft}>
                {/* PARTY SECTION */}
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, { fontSize: dynamicFontSize(14) }]}>Party</Text>
                  
                  {!selectedParty ? (
                    <View style={styles.searchSectionContainer}>
                      <Searchbar
                        placeholder="Search party by name or phone..."
                        onChangeText={setCustomerSearch}
                        value={customerSearch}
                        style={styles.searchBar}
                        inputStyle={styles.searchInput}
                        placeholderTextColor={colors.textMuted}
                        iconColor={colors.primary}
                      />
                      
                      {customerSearch ? (
                        <View style={styles.searchDropdownInline}>
                          {filteredCustomers.map(c => (
                            <List.Item
                              key={c.id}
                              title={c.name}
                              titleStyle={[styles.dropdownTitle, { fontSize: dynamicFontSize(14) }]}
                              description={`${c.phone || "No phone"} • Outstanding: ₹${Math.abs(Number(c.outstandingAmount || 0)).toLocaleString()}`}
                              descriptionStyle={styles.dropdownDesc}
                              onPress={() => {
                                if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                                setSelectedParty(c);
                                setCustomerSearch("");
                              }}
                              right={props => <List.Icon {...props} icon="account-plus-outline" color={colors.primary} />}
                              style={styles.dropdownItem}
                            />
                          ))}
                          {filteredCustomers.length === 0 && (
                            <View style={styles.dropdownEmpty}>
                              <Text style={styles.dropdownEmptyText}>No parties found</Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        recentParties.length > 0 && (
                          <View style={styles.recentContainer}>
                            <Text style={styles.recentLabel}>RECENT PARTIES</Text>
                            {recentParties.map(c => (
                              <Pressable 
                                key={c.id}
                                onPress={() => {
                                  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                                  setSelectedParty(c);
                                }}
                                style={styles.recentPartyRow}
                              >
                                <View style={styles.recentPartyInfo}>
                                  <Icon source="account-outline" size={16} color={colors.textSecondary} />
                                  <Text style={[styles.recentPartyName, { fontSize: dynamicFontSize(13) }]}>{c.name}</Text>
                                </View>
                                <Text style={styles.recentPartySub}>{c.phone || "No phone"}</Text>
                              </Pressable>
                            ))}
                          </View>
                        )
                      )}
                    </View>
                  ) : (
                    <Card style={styles.selectedCustomerCard}>
                      <Card.Content style={styles.customerCardContent}>
                        <View style={styles.customerAvatar}>
                          <Text style={[styles.customerAvatarText, { fontSize: dynamicFontSize(16) }]}>{selectedParty.name[0].toUpperCase()}</Text>
                        </View>
                        <View style={styles.customerInfoCol}>
                          <Text style={[styles.customerNameText, { fontSize: dynamicFontSize(15) }]}>{selectedParty.name}</Text>
                          <Text style={styles.customerSubText}>{selectedParty.phone || "No phone number"}</Text>
                          <View style={styles.outstandingBadge}>
                            <Text style={styles.outstandingBadgeLabel}>OUTSTANDING: </Text>
                            <Text style={[
                              styles.outstandingBadgeVal, 
                              { color: Number(selectedParty.outstandingAmount || 0) > 0 ? colors.danger : colors.success }
                            ]}>
                              ₹{Math.abs(Number(selectedParty.outstandingAmount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </Text>
                          </View>
                        </View>
                        <Button 
                          mode="outlined" 
                          compact 
                          textColor={colors.danger}
                          style={styles.changeCustomerBtn}
                          onPress={() => {
                            if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            setSelectedParty(null);
                          }}
                        >
                          CHANGE
                        </Button>
                      </Card.Content>
                    </Card>
                  )}
                </View>

                {/* PRODUCT ADDITION SECTION */}
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, { fontSize: dynamicFontSize(14) }]}>Add Products</Text>
                  <View style={styles.searchSectionContainer}>
                    <Searchbar
                      placeholder="Search item, SKU, or barcode..."
                      onChangeText={setItemSearch}
                      value={itemSearch}
                      style={styles.searchBar}
                      inputStyle={styles.searchInput}
                      placeholderTextColor={colors.textMuted}
                      iconColor={colors.primary}
                    />

                    {itemSearch ? (
                      <View style={styles.searchDropdownInline}>
                        {filteredItems.map(item => {
                          const stockNum = Number(item.availableStock || 0);
                          const inStock = stockNum > 0;
                          return (
                            <List.Item
                              key={item.id}
                              title={item.name}
                              titleStyle={[styles.dropdownTitle, { fontSize: dynamicFontSize(14) }]}
                              description={`Rate: ₹${item.defaultSellingPrice} • SKU: ${item.sku || "N/A"} • ${inStock ? `Stock: ${stockNum} ${item.unit}` : 'OUT OF STOCK'}`}
                              descriptionStyle={[
                                styles.dropdownDesc, 
                                !inStock && { color: colors.danger, fontWeight: fontWeight.bold }
                              ]}
                              onPress={() => handleAddItemToCart(item)}
                              right={props => <List.Icon {...props} icon="plus-circle" color={colors.primary} />}
                              style={styles.dropdownItem}
                            />
                          );
                        })}
                        {filteredItems.length === 0 && (
                          <View style={styles.dropdownEmpty}>
                            <Text style={styles.dropdownEmptyText}>No products found</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      recentItems.length > 0 && (
                        <View style={styles.recentContainer}>
                          <Text style={styles.recentLabel}>FREQUENT / RECENT ITEMS (TAP TO ADD)</Text>
                          {recentItems.map(item => (
                            <Pressable
                              key={item.id}
                              onPress={() => handleAddItemToCart(item)}
                              style={styles.recentItemRow}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.recentItemName, { fontSize: dynamicFontSize(13) }]} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.recentItemSub}>SKU: {item.sku || "N/A"} • Rate: ₹{item.defaultSellingPrice}</Text>
                              </View>
                              <View style={styles.quickAddIconCircle}>
                                <Icon source="plus" size={16} color={colors.primary} />
                              </View>
                            </Pressable>
                          ))}
                        </View>
                      )
                    )}
                  </View>
                </View>
              </View>

              {/* Right Column - Cart Review, Details & checkout card */}
              <View style={styles.tabletColumnRight}>
                {/* CART ITEMS REVIEW */}
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, { fontSize: dynamicFontSize(14) }]}>Cart Items ({cart.length})</Text>
                  {cart.length > 0 ? (
                    <View style={styles.cartContainer}>
                      {cart.map((item, idx) => (
                        <View key={item.id}>
                          <View style={styles.cartRow}>
                            <View style={styles.cartRowLeft}>
                              <Text style={[styles.cartRowName, { fontSize: dynamicFontSize(13) }]} numberOfLines={1}>{item.name}</Text>
                              <Text style={styles.cartRowUnit}>Unit: {item.unit}</Text>
                              <View style={styles.inlineRateInputContainer}>
                                <Text style={styles.inlineRateSymbol}>Rate: ₹</Text>
                                <RNTextInput
                                  style={styles.inlineRateInput}
                                  keyboardType="numeric"
                                  value={String(item.rate)}
                                  onChangeText={(text) => handleUpdateRate(item.id, text)}
                                  selectTextOnFocus
                                />
                              </View>
                            </View>

                            <View style={styles.cartRowRight}>
                              <View style={styles.stepperContainer}>
                                <Pressable onPress={() => handleUpdateQty(item.id, -1)} style={styles.stepperBtn} hitSlop={8}>
                                  <Icon source="minus" size={16} color={colors.textSecondary} />
                                </Pressable>
                                <Text style={styles.stepperValue}>{item.quantity}</Text>
                                <Pressable onPress={() => handleUpdateQty(item.id, 1)} style={styles.stepperBtn} hitSlop={8}>
                                  <Icon source="plus" size={16} color={colors.textSecondary} />
                                </Pressable>
                              </View>
                              <View style={styles.cartRowTotalCol}>
                                <Text style={styles.cartRowTotal}>₹{(item.quantity * item.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Text>
                                <Pressable onPress={() => handleRemoveCartItem(item.id)} style={styles.cartRowDelete} hitSlop={12}>
                                  <Text style={styles.cartRowDeleteText}>Delete</Text>
                                </Pressable>
                              </View>
                            </View>
                          </View>
                          {idx < cart.length - 1 && <Divider style={styles.cartDivider} />}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Card style={styles.tabletEmptyCard}>
                      <Card.Content style={styles.tabletEmptyCardContent}>
                        <Icon source="cart-outline" size={48} color={colors.textMuted} />
                        <Text style={styles.tabletEmptyCardText}>Your cart is empty. Tap products on the left panel to add.</Text>
                      </Card.Content>
                    </Card>
                  )}
                </View>

                {/* ADVANCED FULFILLMENT NOTES */}
                {renderAdvancedDetails()}

                {/* INLINE CHECKOUT CARD */}
                <Card style={styles.tabletCheckoutCard}>
                  <Card.Content>
                    <View style={styles.tabletCheckoutTotalRow}>
                      <Text style={styles.footerTotalLabel}>ORDER TOTAL</Text>
                      <Text style={[styles.footerTotalVal, { fontSize: dynamicFontSize(18) }]}>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Text>
                    </View>
                    
                    {validationMessage && (
                      <Text style={styles.tabletValidationText}>{validationMessage}</Text>
                    )}
                    
                    {errorMsg && (
                      <Text style={styles.inlineError}>{errorMsg}</Text>
                    )}

                    <Button
                      mode="contained"
                      onPress={() => orderMutation.mutate()}
                      loading={orderMutation.isPending}
                      disabled={!selectedParty || cart.length === 0 || orderMutation.isPending}
                      style={[styles.submitBtn, (!selectedParty || cart.length === 0) && styles.submitBtnDisabled]}
                      labelStyle={styles.submitBtnLabel}
                      buttonColor={colors.primary}
                    >
                      PLACE ORDER
                    </Button>
                  </Card.Content>
                </Card>
              </View>
            </View>
          ) : (
            /* STANDARD MOBILE LAYOUT */
            <View>
              {/* PARTY SECTION */}
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { fontSize: dynamicFontSize(14) }]}>Party</Text>
                
                {!selectedParty ? (
                  <View style={styles.searchSectionContainer}>
                    <Searchbar
                      placeholder="Search party by name or phone..."
                      onChangeText={setCustomerSearch}
                      value={customerSearch}
                      style={styles.searchBar}
                      inputStyle={styles.searchInput}
                      placeholderTextColor={colors.textMuted}
                      iconColor={colors.primary}
                    />
                    
                    {customerSearch ? (
                      <View style={styles.searchDropdownInline}>
                        {filteredCustomers.map(c => (
                          <List.Item
                            key={c.id}
                            title={c.name}
                            titleStyle={[styles.dropdownTitle, { fontSize: dynamicFontSize(14) }]}
                            description={`${c.phone || "No phone"} • Outstanding: ₹${Math.abs(Number(c.outstandingAmount || 0)).toLocaleString()}`}
                            descriptionStyle={styles.dropdownDesc}
                            onPress={() => {
                              if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                              setSelectedParty(c);
                              setCustomerSearch("");
                            }}
                            right={props => <List.Icon {...props} icon="account-plus-outline" color={colors.primary} />}
                            style={styles.dropdownItem}
                          />
                        ))}
                        {filteredCustomers.length === 0 && (
                          <View style={styles.dropdownEmpty}>
                            <Text style={styles.dropdownEmptyText}>No parties found</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      recentParties.length > 0 && (
                        <View style={styles.recentContainer}>
                          <Text style={styles.recentLabel}>RECENT PARTIES</Text>
                          {recentParties.map(c => (
                            <Pressable 
                              key={c.id}
                              onPress={() => {
                                if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                                setSelectedParty(c);
                              }}
                              style={styles.recentPartyRow}
                            >
                              <View style={styles.recentPartyInfo}>
                                <Icon source="account-outline" size={16} color={colors.textSecondary} />
                                  <Text style={[styles.recentPartyName, { fontSize: dynamicFontSize(13) }]}>{c.name}</Text>
                              </View>
                              <Text style={styles.recentPartySub}>{c.phone || "No phone"}</Text>
                            </Pressable>
                          ))}
                        </View>
                      )
                    )}
                  </View>
                ) : (
                  <Card style={styles.selectedCustomerCard}>
                    <Card.Content style={styles.customerCardContent}>
                      <View style={styles.customerAvatar}>
                        <Text style={[styles.customerAvatarText, { fontSize: dynamicFontSize(16) }]}>{selectedParty.name[0].toUpperCase()}</Text>
                      </View>
                      <View style={styles.customerInfoCol}>
                        <Text style={[styles.customerNameText, { fontSize: dynamicFontSize(15) }]}>{selectedParty.name}</Text>
                        <Text style={styles.customerSubText}>{selectedParty.phone || "No phone number"}</Text>
                        <View style={styles.outstandingBadge}>
                          <Text style={styles.outstandingBadgeLabel}>OUTSTANDING: </Text>
                          <Text style={[
                            styles.outstandingBadgeVal, 
                            { color: Number(selectedParty.outstandingAmount || 0) > 0 ? colors.danger : colors.success }
                          ]}>
                            ₹{Math.abs(Number(selectedParty.outstandingAmount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </Text>
                        </View>
                      </View>
                      <Button 
                        mode="outlined" 
                        compact 
                        textColor={colors.danger}
                        style={styles.changeCustomerBtn}
                        onPress={() => {
                          if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setSelectedParty(null);
                        }}
                      >
                        CHANGE
                      </Button>
                    </Card.Content>
                  </Card>
                )}
              </View>

              {/* PRODUCT ADDITION SECTION */}
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { fontSize: dynamicFontSize(14) }]}>Add Products</Text>
                <View style={styles.searchSectionContainer}>
                  <Searchbar
                    placeholder="Search item, SKU, or barcode..."
                    onChangeText={setItemSearch}
                    value={itemSearch}
                    style={styles.searchBar}
                    inputStyle={styles.searchInput}
                    placeholderTextColor={colors.textMuted}
                    iconColor={colors.primary}
                  />

                  {itemSearch ? (
                    <View style={styles.searchDropdownInline}>
                      {filteredItems.map(item => {
                        const stockNum = Number(item.availableStock || 0);
                        const inStock = stockNum > 0;
                        return (
                          <List.Item
                            key={item.id}
                            title={item.name}
                            titleStyle={[styles.dropdownTitle, { fontSize: dynamicFontSize(14) }]}
                            description={`Rate: ₹${item.defaultSellingPrice} • SKU: ${item.sku || "N/A"} • ${inStock ? `Stock: ${stockNum} ${item.unit}` : 'OUT OF STOCK'}`}
                            descriptionStyle={[
                              styles.dropdownDesc, 
                              !inStock && { color: colors.danger, fontWeight: fontWeight.bold }
                            ]}
                            onPress={() => handleAddItemToCart(item)}
                            right={props => <List.Icon {...props} icon="plus-circle" color={colors.primary} />}
                            style={styles.dropdownItem}
                          />
                        );
                      })}
                      {filteredItems.length === 0 && (
                        <View style={styles.dropdownEmpty}>
                          <Text style={styles.dropdownEmptyText}>No products found</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    recentItems.length > 0 && (
                      <View style={styles.recentContainer}>
                        <Text style={styles.recentLabel}>FREQUENT / RECENT ITEMS (TAP TO ADD)</Text>
                        {recentItems.map(item => (
                          <Pressable
                            key={item.id}
                            onPress={() => handleAddItemToCart(item)}
                            style={styles.recentItemRow}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.recentItemName, { fontSize: dynamicFontSize(13) }]} numberOfLines={1}>{item.name}</Text>
                              <Text style={styles.recentItemSub}>SKU: {item.sku || "N/A"} • Rate: ₹{item.defaultSellingPrice}</Text>
                            </View>
                            <View style={styles.quickAddIconCircle}>
                              <Icon source="plus" size={16} color={colors.primary} />
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )
                  )}
                </View>
              </View>

              {/* CART SECTION */}
              {cart.length > 0 && (
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, { fontSize: dynamicFontSize(14) }]}>Cart Items ({cart.length})</Text>
                  <View style={styles.cartContainer}>
                    {cart.map((item, idx) => (
                      <View key={item.id}>
                        <View style={[styles.cartRow, isSmallMobile && { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm }]}>
                          <View style={styles.cartRowLeft}>
                            <Text style={[styles.cartRowName, { fontSize: isSmallMobile ? dynamicFontSize(12) : dynamicFontSize(13) }]} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.cartRowUnit}>Unit: {item.unit}</Text>
                            
                            {/* Editable Rate Field */}
                            <View style={styles.inlineRateInputContainer}>
                              <Text style={styles.inlineRateSymbol}>Rate: ₹</Text>
                              <RNTextInput
                                style={styles.inlineRateInput}
                                keyboardType="numeric"
                                value={String(item.rate)}
                                onChangeText={(text) => handleUpdateRate(item.id, text)}
                                selectTextOnFocus
                              />
                            </View>
                          </View>

                          <View style={[styles.cartRowRight, isSmallMobile && { justifyContent: 'space-between', marginTop: 4 }]}>
                            <View style={styles.stepperContainer}>
                              <Pressable
                                onPress={() => handleUpdateQty(item.id, -1)}
                                style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
                                hitSlop={8}
                              >
                                <Icon source="minus" size={16} color={colors.textSecondary} />
                              </Pressable>
                              
                              <Text style={styles.stepperValue}>{item.quantity}</Text>
                              
                              <Pressable
                                onPress={() => handleUpdateQty(item.id, 1)}
                                style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
                                hitSlop={8}
                              >
                                <Icon source="plus" size={16} color={colors.textSecondary} />
                              </Pressable>
                            </View>
                            
                            <View style={styles.cartRowTotalCol}>
                              <Text style={styles.cartRowTotal}>₹{(item.quantity * item.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Text>
                              <Pressable 
                                onPress={() => handleRemoveCartItem(item.id)}
                                style={styles.cartRowDelete}
                                hitSlop={12}
                              >
                                <Text style={styles.cartRowDeleteText}>Delete</Text>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                        {idx < cart.length - 1 && <Divider style={styles.cartDivider} />}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* ADVANCED DETAILS */}
              {renderAdvancedDetails()}
            </View>
          )}
        </ScrollView>

        {/* STICKY FOOTER (Phone layout only) */}
        {!isTablet && (
          <View style={styles.footer}>
            <View style={styles.footerTopRow}>
              <View>
                <Text style={styles.footerTotalLabel}>ORDER TOTAL</Text>
                <Text style={[styles.footerTotalVal, { fontSize: dynamicFontSize(16) }]}>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Text>
              </View>
              {validationMessage && (
                <View style={styles.validationContainer}>
                  <Text style={styles.validationText}>{validationMessage}</Text>
                </View>
              )}
            </View>

            {errorMsg && (
              <Text style={styles.inlineError}>{errorMsg}</Text>
            )}

            <Button
              mode="contained"
              onPress={() => orderMutation.mutate()}
              loading={orderMutation.isPending}
              disabled={!selectedParty || cart.length === 0 || orderMutation.isPending}
              style={[styles.submitBtn, (!selectedParty || cart.length === 0) && styles.submitBtnDisabled]}
              labelStyle={styles.submitBtnLabel}
              buttonColor={colors.primary}
            >
              PLACE ORDER
            </Button>
          </View>
        )}
      </KeyboardAvoidingView>

      <SuccessModal
        visible={successVisible}
        title="Order Created"
        message={`Order for ${lastPlacedPartyName} has been placed successfully.`}
        onClose={() => {
          setSuccessVisible(false);
          goBack();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sectionContainer: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  searchSectionContainer: {
    position: 'relative',
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
    height: 48,
  },
  searchInput: {
    fontSize: 14,
  },
  searchDropdownInline: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  dropdownItem: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  dropdownTitle: {
    fontWeight: fontWeight.bold,
  },
  dropdownDesc: {
    fontSize: 11,
    marginTop: 2,
    color: colors.textSecondary,
  },
  dropdownEmpty: {
    padding: spacing.md,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  recentContainer: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentLabel: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  recentPartyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentPartyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  recentPartyName: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  recentPartySub: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  recentItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentItemName: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  recentItemSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  quickAddIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCustomerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    ...shadow.sm,
    elevation: 0,
  },
  customerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    color: colors.primaryDark,
    fontWeight: fontWeight.bold,
  },
  customerInfoCol: {
    flex: 1,
    marginLeft: spacing.md,
  },
  customerNameText: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  customerSubText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  outstandingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outstandingBadgeLabel: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  outstandingBadgeVal: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  changeCustomerBtn: {
    borderColor: colors.danger,
    borderRadius: radius.md,
  },
  cartContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.sm,
  },
  cartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cartRowLeft: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  cartRowName: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cartRowUnit: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  inlineRateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    height: 28,
  },
  inlineRateSymbol: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  inlineRateInput: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    minWidth: 50,
    height: '100%',
    padding: 0,
    marginLeft: 2,
  },
  cartRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    height: 44,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 44,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  cartRowTotalCol: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  cartRowTotal: {
    fontSize: 13,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  cartRowDelete: {
    marginTop: 4,
  },
  cartRowDeleteText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: fontWeight.bold,
  },
  cartDivider: {
    backgroundColor: colors.surfaceOffset,
    marginVertical: 4,
  },
  advancedHeaderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  advancedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  advancedHeaderTitle: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  advancedSettingsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    marginTop: spacing.sm,
    ...shadow.sm,
    elevation: 0,
  },
  advancedContent: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  staffScroll: {
    paddingVertical: spacing.xs,
  },
  staffPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  staffPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  staffPillText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  staffPillTextActive: {
    color: 'white',
  },
  dispatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayPill: {
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayPillText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  dayPillTextActive: {
    color: 'white',
  },
  dispatchHelperText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  priorityBtns: {
    height: 36,
  },
  notesTextInput: {
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.md,
  },
  footerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  footerTotalLabel: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  footerTotalVal: {
    fontWeight: fontWeight.black,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  validationContainer: {
    flex: 1,
    marginLeft: spacing.md,
    alignItems: 'flex-end',
  },
  validationText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: fontWeight.bold,
    textAlign: 'right',
  },
  inlineError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  submitBtn: {
    borderRadius: radius.lg,
    paddingVertical: 4,
    elevation: 0,
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
    opacity: 0.5,
  },
  submitBtnLabel: {
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  pressed: {
    opacity: 0.5,
  },

  // Tablet Responsive Styles
  tabletContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    width: '100%',
  },
  tabletColumnLeft: {
    flex: 1.1, // slightly wider left column for search convenience
    gap: spacing.md,
  },
  tabletColumnRight: {
    flex: 0.9,
    gap: spacing.md,
  },
  tabletEmptyCard: {
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 0,
  },
  tabletEmptyCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  tabletEmptyCardText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  tabletCheckoutCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    ...shadow.md,
    elevation: 0,
  },
  tabletCheckoutTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tabletValidationText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
});
