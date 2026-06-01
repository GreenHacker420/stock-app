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
import { colors, spacing, radius, fontSize, fontWeight } from '../../theme';

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
    <Screen>
      <AppHeader title="Create Order" subtitle="Book a new order for shop fulfillment" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        {/* Customer Section */}
        <Section title="Select Customer">
          {!selectedCustomer ? (
            <>
              <Searchbar
                placeholder="Search customer name or phone..."
                onChangeText={setCustomerSearch}
                value={customerSearch}
                style={styles.searchBar}
              />
              {customerSearch ? (
                <View className="mt-2 bg-white rounded-xl border border-slate-100 shadow-lg z-50 overflow-hidden">
                  {filteredCustomers.map(c => (
                    <List.Item
                      key={c.id}
                      title={c.name}
                      description={`${c.phone || "No phone"} • Bal: ₹${Number(c.outstandingAmount || 0).toLocaleString()}`}
                      onPress={() => {
                        setCustomerId(c.id);
                        setCustomerSearch("");
                      }}
                      right={props => <List.Icon {...props} icon="account-check-outline" color={colors.primary} />}
                    />
                  ))}
                  {filteredCustomers.length === 0 && (
                    <Text className="p-4 text-center text-slate-400">No customers found</Text>
                  )}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.selectedCustomerCard}>
              <View className="flex-1 pr-2">
                <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                <Text variant="bodySmall" style={styles.customerDetails}>
                  {selectedCustomer.phone || "No phone"} • Outstanding Balance: ₹{Number(selectedCustomer.outstandingAmount || 0).toLocaleString()}
                </Text>
              </View>
              <Button compact mode="text" onPress={() => setCustomerId(null)}>Change</Button>
            </View>
          )}
        </Section>

        {/* Item Selection Section */}
        <Section title="Add Items">
          <Searchbar
            placeholder="Search items by name or SKU..."
            onChangeText={setItemSearch}
            value={itemSearch}
            style={styles.searchBar}
          />
          {itemSearch ? (
            <View className="mt-2 bg-white rounded-xl border border-slate-100 shadow-lg z-50 overflow-hidden">
              {filteredItems.map(i => (
                <List.Item
                  key={i.id}
                  title={i.name}
                  description={`Price: ₹${i.defaultSellingPrice} / ${i.unit}`}
                  onPress={() => handleSelectItem(i)}
                  right={props => <List.Icon {...props} icon="plus-circle" color={colors.primary} />}
                />
              ))}
              {filteredItems.length === 0 && (
                <Text className="p-4 text-center text-slate-400">No items found</Text>
              )}
            </View>
          ) : null}

          {/* Quick Item Add Overlay Panel */}
          {selectedItemToAdd && (
            <Card style={styles.itemAddCard}>
              <Card.Content className="gap-3 p-4">
                <Text style={styles.itemAddTitle}>Add Item: {selectedItemToAdd.name}</Text>
                <View className="flex-row gap-3">
                  <TextInput
                    mode="outlined"
                    label="Quantity"
                    value={addQuantity}
                    onChangeText={setAddQuantity}
                    keyboardType="numeric"
                    style={styles.itemInput}
                    outlineStyle={styles.itemInputOutline}
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
                    left={<TextInput.Affix text="₹" />}
                  />
                </View>
                <View className="flex-row gap-2.5 mt-1">
                  <Button mode="outlined" style={styles.itemAddButton} contentStyle={styles.itemAddButtonContent} onPress={() => setSelectedItemToAdd(null)}>Cancel</Button>
                  <Button mode="contained" style={[styles.itemAddButton, { backgroundColor: colors.primary }]} contentStyle={styles.itemAddButtonContent} onPress={handleAddCartItem}>Add to Order</Button>
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
                  <View className="p-4 flex-row justify-between items-center">
                    <View className="flex-1 pr-3">
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      <Text variant="bodySmall" style={styles.cartItemDetails}>
                        ₹{item.rate} x {item.quantity} {item.unit}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text style={styles.cartItemTotal}>₹{(item.quantity * item.rate).toLocaleString()}</Text>
                      <Pressable onPress={() => handleRemoveCartItem(item.id)} className="p-1.5 ml-1">
                        <Icon source="delete-outline" size={20} color={colors.danger} />
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
            <View>
              <Text variant="labelSmall" style={styles.labelSmall}>ASSIGN FULFILLMENT STAFF (OPTIONAL)</Text>
              <View className="flex-row flex-wrap gap-2">
                {assignedStaffId && (
                  <Pressable
                    onPress={() => setAssignedStaffId(null)}
                    style={styles.staffChipActive}
                  >
                    <Text style={styles.staffChipTextActive}>
                      {staffQuery.data?.find(s => s.id === assignedStaffId)?.name}
                    </Text>
                    <Icon source="close-circle" size={14} color={colors.primary} />
                  </Pressable>
                )}
                {!assignedStaffId && (staffQuery.data ?? []).slice(0, 4).map(s => (
                  <Pressable
                    key={s.id}
                    onPress={() => setAssignedStaffId(s.id)}
                    style={styles.staffChip}
                  >
                    <Text style={styles.staffChipText}>{s.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Expected Dispatch Offset */}
            <View>
              <Text variant="labelSmall" style={styles.labelSmall}>EXPECTED DISPATCH DATE</Text>
              <SegmentedButtons
                value={String(expectedOffsetDays)}
                onValueChange={v => setExpectedOffsetDays(Number(v))}
                buttons={[
                  { value: "1", label: "Tomorrow" },
                  { value: "3", label: "3 Days" },
                  { value: "7", label: "1 Week" },
                ]}
                theme={{ colors: { primary: colors.primary } }}
              />
            </View>

            {/* Priority */}
            <View>
              <Text variant="labelSmall" style={styles.labelSmall}>ORDER PRIORITY</Text>
              <SegmentedButtons
                value={priority}
                onValueChange={v => setPriority(v as any)}
                buttons={priorities.map(p => ({ value: p.value, label: p.label }))}
                theme={{ colors: { primary: colors.primary } }}
              />
            </View>

            {/* Notes */}
            <TextInput
              mode="outlined"
              label="Fulfillment Notes for Staff"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
              style={styles.notesInput}
              outlineStyle={styles.notesOutline}
            />
          </View>
        </Section>

        {errorMsg && (
          <View style={styles.errorContainer}>
            <Icon source="alert-circle" size={18} color={colors.danger} />
            <Text variant="bodySmall" style={styles.errorText}>{errorMsg}</Text>
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
          style={styles.checkoutButton}
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
    paddingBottom: 120,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    elevation: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedCustomerCard: {
    padding: spacing.lg,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe", // specific light blue border
  },
  customerName: {
    fontWeight: fontWeight.extrabold,
    color: colors.primaryDark,
    fontSize: fontSize.md,
  },
  customerDetails: {
    color: colors.primary,
    marginTop: spacing.xs,
  },
  itemAddCard: {
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    shadowOpacity: 0,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  itemAddTitle: {
    fontWeight: fontWeight.extrabold,
    color: "#0f172a",
  },
  itemInput: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  itemInputOutline: {
    borderRadius: radius.md,
  },
  itemAddButton: {
    flex: 1,
    borderRadius: radius.md,
  },
  itemAddButtonContent: {
    height: 44,
  },
  cartContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceOffset,
    overflow: "hidden",
  },
  divider: {
    backgroundColor: colors.surfaceOffset,
  },
  cartItemName: {
    fontWeight: fontWeight.extrabold,
    color: "#0f172a",
  },
  cartItemDetails: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  cartItemTotal: {
    fontWeight: fontWeight.black,
    color: "#0f172a",
  },
  cartSubtotalContainer: {
    backgroundColor: colors.surfaceOffset,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.surfaceOffset,
    alignItems: 'center',
  },
  cartSubtotalLabel: {
    fontWeight: fontWeight.bold,
    color: "#475569",
  },
  cartSubtotalValue: {
    fontWeight: fontWeight.black,
    color: colors.primary,
    fontSize: fontSize.lg,
  },
  settingsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceOffset,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  labelSmall: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: fontWeight.bold,
  },
  staffChipActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  staffChipTextActive: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  staffChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
  },
  staffChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: "#475569",
  },
  notesInput: {
    backgroundColor: colors.surface,
  },
  notesOutline: {
    borderRadius: radius.md,
  },
  errorContainer: {
    backgroundColor: colors.dangerLight,
    padding: spacing.lg,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  errorText: {
    color: "#b91c1c",
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceOffset,
  },
  checkoutButton: {
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  checkoutButtonContent: {
    height: 56,
  },
  checkoutButtonLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
  },
});
