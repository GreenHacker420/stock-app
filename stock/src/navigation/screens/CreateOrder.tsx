import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, View, Pressable, StyleSheet, Platform } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, TextInput, SegmentedButtons, Icon, Searchbar, List, Divider, Card } from "react-native-paper";
import { useDebounce } from "use-debounce";
import * as Haptics from "expo-haptics";

import { createOrder, fetchCustomers, fetchItems, fetchStaff, fetchShops, Item, Customer, ApiUser } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { filterCachedCustomers, filterCachedProducts, setCachedCustomers, setCachedProducts, warmOfflineCache } from "../../utils/mmkvCache";
import { newIdempotencyKey } from "../../utils/idempotency";
import { requireActiveShopId } from "../../hooks/useActiveShop";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../../theme';
import { navigate, goBack } from "../navigation-ref";

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

  // Selected customer
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch] = useDebounce(customerSearch, 300);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [debouncedItemSearch] = useDebounce(itemSearch, 300);

  // Item detail form for the active item being added/edited
  const [selectedItemToAdd, setSelectedItemToAdd] = useState<Item | null>(null);
  const [addQuantity, setAddQuantity] = useState("1");
  const [addRate, setAddRate] = useState("");

  // Order settings
  const [assignedStaffId, setAssignedStaffId] = useState<string | null>(null);
  const [expectedOffsetDays, setExpectedOffsetDays] = useState<number>(1); // default: 1 day (tomorrow)
  const [priority, setPriority] = useState<OrderPriority>("NORMAL");
  const [notes, setNotes] = useState("");

  // Modal feedback
  const [successVisible, setSuccessVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Queries
  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  
  const customersQuery = useQuery({
    queryKey: ["customers", activeShopId, debouncedCustomerSearch],
    queryFn: () => fetchCustomers(token ?? "", activeShopId ?? "", false, {
      search: debouncedCustomerSearch,
      limit: debouncedCustomerSearch ? 20 : 50,
    }),
    enabled: !!token && !!activeShopId && !network.isOffline,
  });
  const cachedCustomersQuery = useQuery({
    queryKey: ["cached-customers", activeShopId, debouncedCustomerSearch],
    queryFn: () => filterCachedCustomers(activeShopId ?? "", debouncedCustomerSearch),
    enabled: !!activeShopId && network.isOffline,
  });

  const itemsQuery = useQuery({
    queryKey: ["items", activeShopId, debouncedItemSearch],
    queryFn: () => fetchItems(token ?? "", activeShopId ?? "", {
      search: debouncedItemSearch,
      limit: debouncedItemSearch ? 20 : 50,
    }),
    enabled: !!token && !!activeShopId && !network.isOffline,
  });
  const cachedItemsQuery = useQuery({
    queryKey: ["cached-items", activeShopId, debouncedItemSearch],
    queryFn: () => filterCachedProducts(activeShopId ?? "", debouncedItemSearch),
    enabled: !!activeShopId && network.isOffline,
  });

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => fetchStaff(token ?? ""),
    enabled: !!token,
  });

  useEffect(() => {
    if (activeShopId && customersQuery.data) setCachedCustomers(activeShopId, customersQuery.data);
  }, [activeShopId, customersQuery.data]);

  useEffect(() => {
    if (activeShopId && itemsQuery.data?.items) setCachedProducts(activeShopId, itemsQuery.data.items);
  }, [activeShopId, itemsQuery.data]);

  // Filters
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    const source = network.isOffline ? (cachedCustomersQuery.data ?? []) : (customersQuery.data ?? []);
    return source.slice(0, 5);
  }, [cachedCustomersQuery.data, customersQuery.data, customerSearch, network.isOffline]);

  const filteredItems = useMemo(() => {
    if (!itemSearch) return [];
    const source = network.isOffline ? (cachedItemsQuery.data ?? []) : (itemsQuery.data?.items ?? []);
    return source.slice(0, 5);
  }, [cachedItemsQuery.data, itemSearch, itemsQuery.data, network.isOffline]);

  const selectedCustomer = useMemo(() => {
    const list = network.isOffline ? (cachedCustomersQuery.data ?? []) : (customersQuery.data ?? []);
    return list.find(c => c.id === customerId);
  }, [cachedCustomersQuery.data, customersQuery.data, customerId, network.isOffline]);

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  }, [cart]);

  // Order submission
  const orderMutation = useMutation({
    mutationFn: () => {
      if (network.isOffline) {
        throw new Error(internetRequiredMessage);
      }
      const dispatchDate = new Date(Date.now() + expectedOffsetDays * 86400000);
      return createOrder(token ?? "", {
        shopId: requireActiveShopId(activeShopId),
        customerId: customerId ?? "",
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
      if (activeShopId && token) warmOfflineCache(activeShopId, token).catch(() => {});
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setCart([]);
      setCustomerId(null);
      setAssignedStaffId(null);
      setNotes("");
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

  const handleSelectItem = (item: Item) => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedItemToAdd(item);
    setAddQuantity("1");
    setAddRate(String(item.defaultSellingPrice));
    setItemSearch("");
  };

  const handleAddCartItem = () => {
    if (!selectedItemToAdd) return;
    const qty = Number(addQuantity);
    const rate = Number(addRate);
    if (isNaN(qty) || qty <= 0 || isNaN(rate) || rate <= 0) {
      Alert.alert("Invalid input", "Please check your quantity and rate.");
      return;
    }

    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const existing = cart.find(c => c.id === selectedItemToAdd.id);
    if (existing) {
      setCart(cart.map(c => c.id === selectedItemToAdd.id ? { ...c, quantity: qty, rate: rate } : c));
    } else {
      setCart([...cart, {
        id: selectedItemToAdd.id,
        name: selectedItemToAdd.name,
        quantity: qty,
        rate: rate,
        unit: selectedItemToAdd.unit
      }]);
    }
    setSelectedItemToAdd(null);
  };

  const handleRemoveCartItem = (id: string) => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart(cart.filter(c => c.id !== id));
  };

  const handlePriorityChange = (value: string) => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPriority(value as OrderPriority);
  };

  const handleStaffSelect = (staffId: string | null) => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAssignedStaffId(staffId);
  };

  const handleOffsetSelect = (days: number) => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setExpectedOffsetDays(days);
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Create Order" subtitle="Book a new order for shop fulfillment" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        {/* Customer Section */}
        <Section title="Select Customer">
          {!customerId || !selectedCustomer ? (
            <View style={styles.searchSectionContainer}>
              <Searchbar
                placeholder="Search customer name or phone..."
                onChangeText={setCustomerSearch}
                value={customerSearch}
                style={styles.searchBar}
                inputStyle={styles.searchInput}
                placeholderTextColor={colors.textMuted}
                iconColor={colors.primary}
              />
              {customerSearch ? (
                <View style={styles.searchDropdown}>
                  {filteredCustomers.map(c => {
                    const balance = Number(c.outstandingAmount || 0);
                    const isCredit = balance < 0;
                    const balanceColor = balance > 0 ? colors.danger : isCredit ? colors.success : colors.textMuted;
                    
                    return (
                      <List.Item
                        key={c.id}
                        title={c.name}
                        titleStyle={styles.dropdownTitle}
                        description={`${c.phone || "No phone"} • Outstanding: ₹${Math.abs(balance).toLocaleString()}`}
                        descriptionStyle={[styles.dropdownDesc, { color: balanceColor }]}
                        onPress={() => {
                          if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                          setCustomerId(c.id);
                          setCustomerSearch("");
                        }}
                        right={props => <List.Icon {...props} icon="account-plus-outline" color={colors.primary} />}
                        style={styles.dropdownItem}
                      />
                    );
                  })}
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
                  <Text style={styles.customerAvatarText}>{selectedCustomer.name[0].toUpperCase()}</Text>
                </View>
                <View style={styles.customerInfoCol}>
                  <Text style={styles.customerNameText}>{selectedCustomer.name}</Text>
                  <Text style={styles.customerSubText}>{selectedCustomer.phone || "No phone number"}</Text>
                  {selectedCustomer.gstin ? (
                    <Text style={styles.customerGstinText}>GSTIN: {selectedCustomer.gstin}</Text>
                  ) : null}
                  <View style={styles.outstandingBadge}>
                    <Text style={styles.outstandingBadgeLabel}>OUTSTANDING: </Text>
                    <Text style={[
                      styles.outstandingBadgeVal, 
                      { color: Number(selectedCustomer.outstandingAmount || 0) > 0 ? colors.danger : colors.success }
                    ]}>
                      ₹{Math.abs(Number(selectedCustomer.outstandingAmount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
                    setCustomerId(null);
                  }}
                >
                  CHANGE
                </Button>
              </Card.Content>
            </Card>
          )}
        </Section>

        {/* Items Section */}
        <Section title="Add Items to Order">
          <View style={styles.searchSectionContainer}>
            <Searchbar
              placeholder="Search items by name or SKU..."
              onChangeText={setItemSearch}
              value={itemSearch}
              style={styles.searchBar}
              inputStyle={styles.searchInput}
              placeholderTextColor={colors.textMuted}
              iconColor={colors.primary}
            />
            {itemSearch ? (
              <View style={styles.searchDropdown}>
                {filteredItems.map(item => {
                  const stockNum = Number(item.availableStock || 0);
                  const inStock = stockNum > 0;
                  
                  return (
                    <List.Item
                      key={item.id}
                      title={item.name}
                      titleStyle={styles.dropdownTitle}
                      description={`Rate: ₹${item.defaultSellingPrice} • SKU: ${item.sku || "N/A"} • ${inStock ? `Stock: ${stockNum} ${item.unit}` : 'OUT OF STOCK'}`}
                      descriptionStyle={[
                        styles.dropdownDesc, 
                        !inStock && { color: colors.danger, fontWeight: fontWeight.bold }
                      ]}
                      onPress={() => handleSelectItem(item)}
                      right={props => <List.Icon {...props} icon="plus" color={inStock ? colors.primary : colors.textMuted} />}
                      style={styles.dropdownItem}
                    />
                  );
                })}
                {filteredItems.length === 0 && (
                  <View style={styles.dropdownEmpty}>
                    <Text style={styles.dropdownEmptyText}>No items found</Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          {/* Quick Add Form */}
          {selectedItemToAdd && (
            <View style={styles.quickAddForm}>
              <View style={styles.quickAddHeader}>
                <View style={styles.quickAddIcon}>
                  <Icon source="package-variant" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickAddTitle}>{selectedItemToAdd.name}</Text>
                  <Text style={styles.quickAddSub}>MRP: ₹{selectedItemToAdd.mrp || "N/A"} • Min Price: ₹{selectedItemToAdd.minimumAllowedPrice || "N/A"}</Text>
                </View>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  mode="outlined"
                  label={`Qty (${selectedItemToAdd.unit})`}
                  value={addQuantity}
                  onChangeText={setAddQuantity}
                  keyboardType="numeric"
                  style={[styles.flex1, styles.input]}
                  outlineStyle={styles.inputOutline}
                  activeOutlineColor={colors.primary}
                />
                <TextInput
                  mode="outlined"
                  label="Rate (₹)"
                  value={addRate}
                  onChangeText={setAddRate}
                  keyboardType="numeric"
                  style={[styles.flex1, styles.input]}
                  outlineStyle={styles.inputOutline}
                  activeOutlineColor={colors.primary}
                />
              </View>
              <View style={styles.quickAddActions}>
                <Button mode="text" textColor={colors.textSecondary} onPress={() => setSelectedItemToAdd(null)}>CANCEL</Button>
                <Button 
                  mode="contained" 
                  buttonColor={colors.primary} 
                  onPress={handleAddCartItem}
                  disabled={!addQuantity || !addRate}
                >
                  ADD TO ORDER
                </Button>
              </View>
            </View>
          )}

          {/* Cart Table */}
          {cart.length > 0 && (
            <View style={styles.cartContainer}>
              <Text style={styles.cartHeader}>ITEMS IN ORDER ({cart.length})</Text>
              {cart.map((item, idx) => (
                <View key={item.id}>
                  <View style={styles.cartItem}>
                    <View style={styles.cartItemLeft}>
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      <Text style={styles.cartItemSub}>{item.quantity} {item.unit} × ₹{item.rate.toLocaleString("en-IN")}</Text>
                    </View>
                    <View style={styles.cartItemRight}>
                      <Text style={styles.cartItemTotal}>₹{(item.quantity * item.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Text>
                      <Pressable 
                        onPress={() => handleRemoveCartItem(item.id)}
                        style={({ pressed }) => [styles.cartDeleteBtn, pressed && styles.pressed]}
                      >
                        <Icon source="close" size={16} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                  {idx < cart.length - 1 && <Divider style={styles.cartDivider} />}
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>ORDER TOTAL</Text>
                <Text style={styles.totalValue}>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Text>
              </View>
            </View>
          )}
        </Section>

        {/* Fulfillment Settings */}
        <Section title="Fulfillment & Details">
          <View style={styles.settingsCard}>
            <Text style={styles.fieldLabel}>ASSIGN TO STAFF (OPTIONAL)</Text>
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

            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>ORDER PRIORITY</Text>
            <SegmentedButtons
              value={priority}
              onValueChange={handlePriorityChange}
              buttons={priorities}
              style={styles.priorityBtns}
              theme={{ colors: { primary: colors.primary } }}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>EXPECTED DISPATCH</Text>
            <View style={styles.dispatchRow}>
              {[1, 2, 3, 5, 7].map(days => (
                <Pressable
                  key={days}
                  onPress={() => handleOffsetSelect(days)}
                  style={[styles.dayPill, expectedOffsetDays === days && styles.dayPillActive]}
                >
                  <Text style={[styles.dayPillText, expectedOffsetDays === days && styles.dayPillTextActive]}>{days} Day{days > 1 ? 's' : ''}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              mode="outlined"
              label="Fulfillment Notes"
              placeholder="Packaging instructions or delivery notes..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={[styles.notesTextInput, { marginTop: spacing.lg }]}
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
            />
          </View>
        </Section>

        {errorMsg && (
          <View style={styles.errorBox}>
            <Icon source="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <Button
          mode="contained"
          onPress={() => orderMutation.mutate()}
          loading={orderMutation.isPending}
          disabled={!customerId || cart.length === 0}
          style={[styles.submitBtn, (!customerId || cart.length === 0) && styles.submitBtnDisabled]}
          labelStyle={styles.submitBtnLabel}
          buttonColor={colors.primary}
        >
          CONFIRM & CREATE ORDER
        </Button>
      </ScrollView>

      <SuccessModal
        visible={successVisible}
        title="Order Created"
        message={`Order for ${selectedCustomer?.name} has been placed successfully.`}
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
    paddingTop: spacing.xs,
    paddingBottom: 100,
  },
  searchSectionContainer: {
    zIndex: 10,
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
  searchDropdown: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
    maxHeight: 250,
  },
  dropdownItem: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  dropdownTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  dropdownDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  dropdownEmpty: {
    padding: spacing.md,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: 12,
    color: colors.textMuted,
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
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  customerInfoCol: {
    flex: 1,
    marginLeft: spacing.md,
  },
  customerNameText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  customerSubText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  customerGstinText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
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
  quickAddForm: {
    backgroundColor: colors.surfaceOffset,
    padding: spacing.lg,
    borderRadius: 16,
    marginTop: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickAddHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  quickAddIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  quickAddSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  quickAddActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    alignItems: 'center',
  },
  cartContainer: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadow.sm,
  },
  cartHeader: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cartItemLeft: {
    flex: 1,
  },
  cartItemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cartItemSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cartItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cartItemTotal: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  cartDeleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartDivider: {
    backgroundColor: colors.surfaceOffset,
    marginVertical: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  staffScroll: {
    paddingVertical: spacing.xs,
  },
  staffPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  staffPillTextActive: {
    color: 'white',
  },
  dispatchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dayPill: {
    flex: 1,
    height: 38,
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
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  dayPillTextActive: {
    color: 'white',
  },
  priorityBtns: {
    height: 40,
  },
  notesTextInput: {
    backgroundColor: colors.surface,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  submitBtn: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    paddingVertical: 6,
    elevation: 0,
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  submitBtnLabel: {
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  flex1: {
    flex: 1,
  },
  pressed: {
    opacity: 0.5,
  },
});
