import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, View, Pressable, StyleSheet } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, TextInput, SegmentedButtons, Icon, Searchbar, List, Divider, Card } from "react-native-paper";
import { useDebounce } from "use-debounce";
import { createOrder, fetchCustomers, fetchItems, fetchStaff, fetchShops, Item, Customer, ApiUser } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { filterCachedCustomers, filterCachedProducts, setCachedCustomers, setCachedProducts, warmOfflineCache } from "../../utils/mmkvCache";
import { newIdempotencyKey } from "../../utils/idempotency";
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

  const selectedCustomer = (network.isOffline ? cachedCustomersQuery.data : customersQuery.data)?.find(c => c.id === customerId);

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.quantity * item.rate), 0);

  // Order submission
  const orderMutation = useMutation({
    mutationFn: () => {
      if (network.isOffline) {
        throw new Error(internetRequiredMessage);
      }
      const dispatchDate = new Date(Date.now() + expectedOffsetDays * 86400000);
      return createOrder(token ?? "", {
        shopId: activeShopId ?? "",
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
    setSelectedItemToAdd(item);
    setAddQuantity("1");
    setAddRate(String(item.defaultSellingPrice));
    setItemSearch("");
  };

  const handleAddCartItem = () => {
    if (!selectedItemToAdd) return;
    const qty = Number(addQuantity);
    const rate = Number(addRate);
    if (qty <= 0 || rate <= 0) return;

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
    setCart(cart.filter(c => c.id !== id));
  };

  const handlePriorityChange = (value: string) => {
    setPriority(value as OrderPriority);
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Create Order" subtitle="Book a new order for shop fulfillment" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        {/* Customer Section */}
        <Section title="Select Customer">
          {!selectedCustomer ? (
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
                  {filteredCustomers.map(c => (
                    <List.Item
                      key={c.id}
                      title={c.name}
                      titleStyle={styles.dropdownTitle}
                      description={`${c.phone || "No phone"} • Bal: ₹${Math.abs(Number(c.outstandingAmount || 0)).toLocaleString()}`}
                      descriptionStyle={styles.dropdownDesc}
                      onPress={() => {
                        setCustomerId(c.id);
                        setCustomerSearch("");
                      }}
                      right={props => <List.Icon {...props} icon="account-check-outline" color={colors.primary} />}
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
                  <Text style={styles.customerAvatarText}>{selectedCustomer.name[0].toUpperCase()}</Text>
                </View>
                <View style={styles.customerInfoCol}>
                  <Text style={styles.customerNameText}>{selectedCustomer.name}</Text>
                  <Text style={styles.customerSubText}>{selectedCustomer.phone || "No phone number"}</Text>
                </View>
                <Button 
                  mode="text" 
                  compact 
                  textColor={colors.danger} 
                  onPress={() => setCustomerId(null)}
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
                {filteredItems.map(item => (
                  <List.Item
                    key={item.id}
                    title={item.name}
                    titleStyle={styles.dropdownTitle}
                    description={`Rate: ₹${item.defaultSellingPrice} • SKU: ${item.sku || "N/A"} • ${item.availableStock && Number(item.availableStock) > 0 ? `Stock: ${item.availableStock}` : 'OUT OF STOCK'}`}
                    descriptionStyle={[styles.dropdownDesc, (!item.availableStock || Number(item.availableStock) <= 0) && { color: colors.danger, fontWeight: fontWeight.bold }]}
                    onPress={() => handleSelectItem(item)}
                    right={props => <List.Icon {...props} icon="plus-circle-outline" color={colors.primary} />}
                    style={styles.dropdownItem}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {/* Quick Add Form */}
          {selectedItemToAdd && (
            <View style={styles.quickAddForm}>
              <Text style={styles.quickAddTitle}>Adding: {selectedItemToAdd.name}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  mode="outlined"
                  label={`Qty (${selectedItemToAdd.unit})`}
                  value={addQuantity}
                  onChangeText={setAddQuantity}
                  keyboardType="numeric"
                  style={[styles.flex1, styles.input]}
                  outlineStyle={styles.inputOutline}
                />
                <TextInput
                  mode="outlined"
                  label="Rate (₹)"
                  value={addRate}
                  onChangeText={setAddRate}
                  keyboardType="numeric"
                  style={[styles.flex1, styles.input]}
                  outlineStyle={styles.inputOutline}
                />
              </View>
              <View style={styles.quickAddActions}>
                <Button mode="text" onPress={() => setSelectedItemToAdd(null)}>CANCEL</Button>
                <Button mode="contained" onPress={handleAddCartItem}>ADD TO ORDER</Button>
              </View>
            </View>
          )}

          {/* Cart Table */}
          {cart.length > 0 && (
            <View style={styles.cartContainer}>
              {cart.map((item, idx) => (
                <View key={item.id}>
                  <View style={styles.cartItem}>
                    <View style={styles.cartItemLeft}>
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      <Text style={styles.cartItemSub}>{item.quantity} {item.unit} @ ₹{item.rate}</Text>
                    </View>
                    <View style={styles.cartItemRight}>
                      <Text style={styles.cartItemTotal}>₹{(item.quantity * item.rate).toLocaleString()}</Text>
                      <Pressable onPress={() => handleRemoveCartItem(item.id)}>
                        <Icon source="close-circle" size={20} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                  {idx < cart.length - 1 && <Divider style={styles.cartDivider} />}
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>ORDER TOTAL</Text>
                <Text style={styles.totalValue}>₹{subtotal.toLocaleString()}</Text>
              </View>
            </View>
          )}
        </Section>

        {/* Fulfillment Settings */}
        <Section title="Order Details & Fulfillment">
          <View style={styles.settingsCard}>
            <Text style={styles.fieldLabel}>ASSIGN TO STAFF (OPTIONAL)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.staffScroll}>
              <Pressable
                onPress={() => setAssignedStaffId(null)}
                style={[styles.staffPill, assignedStaffId === null && styles.staffPillActive]}
              >
                <Text style={[styles.staffPillText, assignedStaffId === null && styles.staffPillTextActive]}>Any Staff</Text>
              </Pressable>
              {staffQuery.data?.map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => setAssignedStaffId(s.id)}
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
                  onPress={() => setExpectedOffsetDays(days)}
                  style={[styles.dayPill, expectedOffsetDays === days && styles.dayPillActive]}
                >
                  <Text style={[styles.dayPillText, expectedOffsetDays === days && styles.dayPillTextActive]}>{days}D</Text>
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
              style={[styles.input, { marginTop: spacing.lg }]}
              outlineStyle={styles.inputOutline}
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
          style={styles.submitBtn}
          labelStyle={styles.submitBtnLabel}
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
  },
  dropdownTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  dropdownDesc: {
    fontSize: 11,
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
    borderColor: colors.primary,
    borderRadius: radius.lg,
    elevation: 0,
  },
  customerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  customerSubText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  quickAddForm: {
    backgroundColor: colors.surfaceOffset,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  quickAddTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
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
  },
  cartContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
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
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  cartDivider: {
    backgroundColor: colors.surfaceOffset,
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
    fontSize: 11,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
  },
  totalValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.primary,
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
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  staffScroll: {
    marginHorizontal: -spacing.sm,
  },
  staffPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceOffset,
    marginHorizontal: spacing.sm,
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
    width: 48,
    height: 36,
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
    backgroundColor: colors.primary,
  },
  submitBtnLabel: {
    fontWeight: fontWeight.bold,
    paddingVertical: 4,
  },
  flex1: {
    flex: 1,
  },
});
