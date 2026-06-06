import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable, StyleSheet } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Button, Text, TextInput, SegmentedButtons, Icon, Searchbar, List, Divider, Card } from "react-native-paper";
import { createOrder, fetchCustomers, fetchItems, fetchStaff, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../../theme';

const priorities = [
  { label: "Low", value: "LOW" },
  { label: "Normal", value: "NORMAL" },
  { label: "High", value: "HIGH" },
  { label: "Urgent", value: "URGENT" },
] as const;

export function CreateOrder() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();
  const navigation = useNavigation();

  // Selected customer
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  // Cart state
  const [cart, setCart] = useState<Array<{ id: string, name: string, quantity: number, rate: number, unit: string }>>([]);
  const [itemSearch, setItemSearch] = useState("");

  // Item detail form for the active item being added/edited
  const [selectedItemToAdd, setSelectedItemToAdd] = useState<any>(null);
  const [addQuantity, setAddQuantity] = useState("1");
  const [addRate, setAddRate] = useState("");

  // Order settings
  const [assignedStaffId, setAssignedStaffId] = useState<string | null>(null);
  const [expectedOffsetDays, setExpectedOffsetDays] = useState<number>(1); // default: 1 day (tomorrow)
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [notes, setNotes] = useState("");

  // Modal feedback
  const [successVisible, setSuccessVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Queries
  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const activeShop = shopsQuery.data?.find(s => s.id === activeShopId);

  const customersQuery = useQuery({
    queryKey: ["customers", activeShopId],
    queryFn: () => fetchCustomers(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const itemsQuery = useQuery({
    queryKey: ["items", activeShopId],
    queryFn: () => fetchItems(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => fetchStaff(token ?? ""),
    enabled: !!token,
  });

  // Filters
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    return (customersQuery.data ?? []).filter(c =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone?.includes(customerSearch)
    ).slice(0, 5);
  }, [customersQuery.data, customerSearch]);

  const filteredItems = useMemo(() => {
    if (!itemSearch) return [];
    return (itemsQuery.data?.items ?? []).filter(i =>
      i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      i.sku?.toLowerCase().includes(itemSearch.toLowerCase())
    ).slice(0, 5);
  }, [itemsQuery.data, itemSearch]);

  const selectedCustomer = customersQuery.data?.find(c => c.id === customerId);

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.quantity * item.rate), 0);

  // Order submission
  const orderMutation = useMutation({
    mutationFn: () => {
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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      setCart([]);
      setCustomerId(null);
      setAssignedStaffId(null);
      setNotes("");
      setSuccessVisible(true);
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to create order");
    }
  });

  const handleSelectItem = (item: any) => {
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
                  <Text style={styles.customerAvatarText}>
                    {selectedCustomer?.name?.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{selectedCustomer?.name}</Text>
                  <Text style={styles.customerDetails}>
                    {selectedCustomer?.phone || "No phone"}
                  </Text>
                  <Text style={styles.customerBalance}>
                    Balance: <Text style={Number(selectedCustomer?.outstandingAmount || 0) < 0 ? styles.balanceNegative : styles.balancePositive}>₹{Math.abs(Number(selectedCustomer?.outstandingAmount || 0)).toLocaleString()}</Text>
                  </Text>
                </View>
                <Button 
                  mode="outlined" 
                  compact 
                  onPress={() => setCustomerId(null)}
                  style={styles.changeButton}
                  labelStyle={styles.changeButtonLabel}
                >
                  Change
                </Button>
              </Card.Content>
            </Card>
          )}
        </Section>

        {/* Item Selection Section */}
        <Section title="Add Items">
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
                {filteredItems.map(i => (
                  <List.Item
                    key={i.id}
                    title={i.name}
                    titleStyle={styles.dropdownTitle}
                    description={`Price: ₹${i.defaultSellingPrice} / ${i.unit}`}
                    descriptionStyle={styles.dropdownDesc}
                    onPress={() => handleSelectItem(i)}
                    right={props => <List.Icon {...props} icon="plus-circle-outline" color={colors.primary} />}
                    style={styles.dropdownItem}
                  />
                ))}
                {filteredItems.length === 0 && (
                  <View style={styles.dropdownEmpty}>
                    <Text style={styles.dropdownEmptyText}>No items found</Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          {/* Quick Item Add Overlay Panel */}
          {selectedItemToAdd && (
            <Card style={styles.itemAddCard}>
              <Card.Content style={styles.itemAddCardContent}>
                <View style={styles.itemAddHeader}>
                  <Icon source="package-variant-closed" size={24} color={colors.primary} />
                  <Text style={styles.itemAddTitle}>{selectedItemToAdd.name}</Text>
                </View>
                <View style={styles.itemFormRow}>
                  <TextInput
                    mode="outlined"
                    label="Quantity"
                    value={addQuantity}
                    onChangeText={setAddQuantity}
                    keyboardType="numeric"
                    style={styles.itemInput}
                    outlineStyle={styles.itemInputOutline}
                    activeOutlineColor={colors.primary}
                    right={<TextInput.Affix text={selectedItemToAdd.unit} />}
                  />
                  <TextInput
                    mode="outlined"
                    label="Rate"
                    value={addRate}
                    onChangeText={setAddRate}
                    keyboardType="numeric"
                    style={styles.itemInput}
                    outlineStyle={styles.itemInputOutline}
                    activeOutlineColor={colors.primary}
                    left={<TextInput.Affix text="₹" />}
                  />
                </View>
                <View style={styles.itemActionRow}>
                  <Button 
                    mode="outlined" 
                    onPress={() => setSelectedItemToAdd(null)}
                    style={styles.itemCancelButton}
                    labelStyle={styles.itemCancelButtonLabel}
                  >
                    Cancel
                  </Button>
                  <Button 
                    mode="contained" 
                    onPress={handleAddCartItem}
                    style={styles.itemConfirmButton}
                    labelStyle={styles.itemConfirmButtonLabel}
                  >
                    Add to Order
                  </Button>
                </View>
              </Card.Content>
            </Card>
          )}
        </Section>

        {/* Order Cart */}
        {cart.length > 0 && (
          <Section title="Order Items">
            <View style={styles.cartContainer}>
              {cart.map((item, idx) => (
                <View key={item.id}>
                  {idx > 0 && <Divider style={styles.divider} />}
                  <View style={styles.cartItemRow}>
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      <Text style={styles.cartItemDetails}>
                        ₹{item.rate} x {item.quantity} {item.unit}
                      </Text>
                    </View>
                    <View style={styles.cartItemAction}>
                      <Text style={styles.cartItemTotal}>₹{(item.quantity * item.rate).toLocaleString()}</Text>
                      <Pressable onPress={() => handleRemoveCartItem(item.id)} style={styles.deletePressable}>
                        <Icon source="trash-can-outline" size={20} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
              <View style={styles.cartSubtotalContainer}>
                <Text style={styles.cartSubtotalLabel}>Subtotal</Text>
                <Text style={styles.cartSubtotalValue}>₹{subtotal.toLocaleString()}</Text>
              </View>
            </View>
          </Section>
        )}

        {/* Dispatch Settings */}
        <Section title="Fulfillment Settings">
          <View style={styles.settingsContainer}>
            {/* Assign Staff */}
            <View style={styles.settingField}>
              <Text style={styles.settingLabel}>ASSIGN FULFILLMENT STAFF (OPTIONAL)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffScroll}>
                {(staffQuery.data ?? []).map(s => {
                  const isSelected = assignedStaffId === s.id;
                  const initials = s.name ? s.name.substring(0, 2).toUpperCase() : "ST";
                  const colorsList = ["#e0f2fe", "#fee2e2", "#fef3c7", "#dcfce7", "#f3e8ff"];
                  const idx = s.name.charCodeAt(0) % colorsList.length;
                  const avatarBg = colorsList[idx];
                  const avatarText = isSelected ? colors.primaryDark : "#475569";

                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setAssignedStaffId(isSelected ? null : s.id)}
                      style={styles.staffAvatarContainer}
                    >
                      <View style={[styles.avatarCircle, { backgroundColor: avatarBg }, isSelected && styles.avatarCircleSelected]}>
                        <Text style={[styles.avatarText, { color: avatarText }]}>{initials}</Text>
                        {isSelected && (
                          <View style={styles.avatarCheckBadge}>
                            <Icon source="check" size={10} color="#ffffff" />
                          </View>
                        )}
                      </View>
                      <Text style={[styles.staffAvatarName, isSelected && styles.staffAvatarNameSelected]} numberOfLines={1}>
                        {s.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Expected Dispatch Offset */}
            <View style={styles.settingField}>
              <Text style={styles.settingLabel}>EXPECTED DISPATCH DATE</Text>
              <SegmentedButtons
                value={String(expectedOffsetDays)}
                onValueChange={v => setExpectedOffsetDays(Number(v))}
                buttons={[
                  { value: "1", label: "Tomorrow" },
                  { value: "3", label: "3 Days" },
                  { value: "7", label: "1 Week" },
                ]}
                theme={{ colors: { primary: colors.primary } }}
                style={styles.segmentedButtons}
              />
            </View>

            {/* Priority */}
            <View style={styles.settingField}>
              <Text style={styles.settingLabel}>ORDER PRIORITY</Text>
              <SegmentedButtons
                value={priority}
                onValueChange={v => setPriority(v as any)}
                buttons={priorities.map(p => ({ value: p.value, label: p.label }))}
                theme={{ colors: { primary: colors.primary } }}
                style={styles.segmentedButtons}
              />
            </View>

            {/* Notes */}
            <View style={styles.settingField}>
              <TextInput
                mode="outlined"
                label="Fulfillment Notes for Staff"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                style={styles.notesInput}
                outlineStyle={styles.notesOutline}
                activeOutlineColor={colors.primary}
                placeholder="E.g., urgent dispatch, double check quantities, client requested clean packaging..."
              />
            </View>
          </View>
        </Section>

        {errorMsg && (
          <View style={styles.errorContainer}>
            <Icon source="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer Checkout Action */}
      <View style={styles.footer}>
        <Button
          mode="contained"
          disabled={!customerId || cart.length === 0 || orderMutation.isPending}
          loading={orderMutation.isPending}
          onPress={() => orderMutation.mutate()}
          style={[styles.checkoutButton, (!customerId || cart.length === 0) && styles.checkoutButtonDisabled]}
          contentStyle={styles.checkoutButtonContent}
          labelStyle={styles.checkoutButtonLabel}
        >
          Book Order (₹{subtotal.toLocaleString()})
        </Button>
      </View>

      <SuccessModal
        visible={successVisible}
        title="Order Booked"
        message="The customer order has been registered successfully!"
        onClose={() => {
          setSuccessVisible(false);
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
  customerBalance: {
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
  changeButton: {
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
  },
  changeButtonLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  itemAddCard: {
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.primaryMid,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  itemAddCardContent: {
    padding: spacing.lg,
  },
  itemAddHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  itemAddTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    flex: 1,
  },
  itemFormRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  itemInput: {
    flex: 1,
    backgroundColor: colors.surface,
    height: 52,
  },
  itemInputOutline: {
    borderRadius: radius.md,
    borderColor: colors.borderStrong,
  },
  itemActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  itemCancelButton: {
    flex: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
  },
  itemCancelButtonLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  itemConfirmButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  itemConfirmButtonLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#ffffff',
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
  cartItemAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cartItemTotal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  deletePressable: {
    padding: spacing.xs,
    borderRadius: radius.sm,
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
  settingsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xl,
  },
  settingField: {
    gap: spacing.sm,
  },
  settingLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  staffScroll: {
    paddingVertical: spacing.xs,
    gap: spacing.lg,
  },
  staffAvatarContainer: {
    alignItems: 'center',
    width: 68,
    gap: spacing.xs,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarCircleSelected: {
    borderColor: colors.primary,
  },
  avatarText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  avatarCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.primary,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  staffAvatarName: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    width: '100%',
  },
  staffAvatarNameSelected: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  segmentedButtons: {
    borderRadius: radius.md,
  },
  notesInput: {
    backgroundColor: colors.surface,
  },
  notesOutline: {
    borderRadius: radius.md,
    borderColor: colors.borderStrong,
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
});

