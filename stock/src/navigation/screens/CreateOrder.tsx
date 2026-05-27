import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
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
    return (itemsQuery.data ?? []).filter(i =>
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Customer Section */}
        <Section title="Select Customer">
          {!selectedCustomer ? (
            <>
              <Searchbar
                placeholder="Search customer name or phone..."
                onChangeText={setCustomerSearch}
                value={customerSearch}
                style={{ backgroundColor: "white", borderRadius: 12, elevation: 1, borderWidth: 1, borderColor: "#e5e7eb" } as any}
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
                      right={props => <List.Icon {...props} icon="account-check-outline" color="#1e40af" />}
                    />
                  ))}
                  {filteredCustomers.length === 0 && (
                    <Text className="p-4 text-center text-slate-400">No customers found</Text>
                  )}
                </View>
              ) : null}
            </>
          ) : (
            <View className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex-row justify-between items-center shadow-sm">
              <View className="flex-1 pr-2">
                <Text style={{ fontWeight: "800", color: "#1e3a8a", fontSize: 15 }}>{selectedCustomer.name}</Text>
                <Text variant="bodySmall" style={{ color: "#1e40af", marginTop: 2 }}>
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
            style={{ backgroundColor: "white", borderRadius: 12, elevation: 1, borderWidth: 1, borderColor: "#e5e7eb" } as any}
          />
          {itemSearch ? (
            <View className="mt-2 bg-white rounded-xl border border-slate-100 shadow-lg z-50 overflow-hidden">
              {filteredItems.map(i => (
                <List.Item
                  key={i.id}
                  title={i.name}
                  description={`Price: ₹${i.defaultSellingPrice} / ${i.unit}`}
                  onPress={() => handleSelectItem(i)}
                  right={props => <List.Icon {...props} icon="plus-circle" color="#1e40af" />}
                />
              ))}
              {filteredItems.length === 0 && (
                <Text className="p-4 text-center text-slate-400">No items found</Text>
              )}
            </View>
          ) : null}

          {/* Quick Item Add Overlay Panel */}
          {selectedItemToAdd && (
            <Card className="bg-slate-50 border border-slate-200 mt-3 shadow-none rounded-xl overflow-hidden">
              <Card.Content className="gap-3 p-4">
                <Text style={{ fontWeight: "800", color: "#0f172a" }}>Add Item: {selectedItemToAdd.name}</Text>
                <View className="flex-row gap-3">
                  <TextInput
                    mode="outlined"
                    label="Quantity"
                    value={addQuantity}
                    onChangeText={setAddQuantity}
                    keyboardType="numeric"
                    style={{ flex: 1, backgroundColor: "white" }}
                    outlineStyle={{ borderRadius: 10 }}
                    right={<TextInput.Affix text={selectedItemToAdd.unit} />}
                  />
                  <TextInput
                    mode="outlined"
                    label="Rate"
                    value={addRate}
                    onChangeText={setAddRate}
                    keyboardType="numeric"
                    style={{ flex: 1, backgroundColor: "white" }}
                    outlineStyle={{ borderRadius: 10 }}
                    left={<TextInput.Affix text="₹" />}
                  />
                </View>
                <View className="flex-row gap-2.5 mt-1">
                  <Button mode="outlined" style={{ flex: 1, borderRadius: 10 }} onPress={() => setSelectedItemToAdd(null)}>Cancel</Button>
                  <Button mode="contained" style={{ flex: 1, borderRadius: 10, backgroundColor: "#1e40af" }} onPress={handleAddCartItem}>Add to Order</Button>
                </View>
              </Card.Content>
            </Card>
          )}
        </Section>

        {/* Order Cart */}
        {cart.length > 0 && (
          <Section title="Order Items">
            <View className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
              {cart.map((item, idx) => (
                <View key={item.id}>
                  {idx > 0 && <Divider style={{ backgroundColor: "#f1f5f9" }} />}
                  <View className="p-4 flex-row justify-between items-center">
                    <View className="flex-1 pr-3">
                      <Text style={{ fontWeight: "800", color: "#0f172a" }}>{item.name}</Text>
                      <Text variant="bodySmall" style={{ color: "#64748b", marginTop: 2 }}>
                        ₹{item.rate} x {item.quantity} {item.unit}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text style={{ fontWeight: "900", color: "#0f172a" }}>₹{(item.quantity * item.rate).toLocaleString()}</Text>
                      <Pressable onPress={() => handleRemoveCartItem(item.id)} className="p-1.5 ml-1">
                        <Icon source="delete-outline" size={20} color="#ef4444" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
              <View className="bg-slate-50 p-4 flex-row justify-between border-t border-slate-100">
                <Text style={{ fontWeight: "700", color: "#475569" }}>Subtotal</Text>
                <Text style={{ fontWeight: "900", color: "#1e40af", fontSize: 16 }}>₹{subtotal.toLocaleString()}</Text>
              </View>
            </View>
          </Section>
        )}

        {/* Dispatch Settings */}
        <Section title="Fulfillment Settings">
          <View className="bg-white rounded-xl border border-slate-100 p-4 gap-4 shadow-sm">
            {/* Assign Staff */}
            <View>
              <Text variant="labelSmall" style={{ color: "#64748b", marginBottom: 6, fontWeight: "700" }}>ASSIGN FULFILLMENT STAFF (OPTIONAL)</Text>
              <View className="flex-row flex-wrap gap-2">
                {assignedStaffId && (
                  <Pressable
                    onPress={() => setAssignedStaffId(null)}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 border border-blue-200"
                  >
                    <Text style={{ fontSize: 12, fontWeight: "800", color: "#1e40af" }}>
                      {staffQuery.data?.find(s => s.id === assignedStaffId)?.name}
                    </Text>
                    <Icon source="close-circle" size={14} color="#1e40af" />
                  </Pressable>
                )}
                {!assignedStaffId && (staffQuery.data ?? []).slice(0, 4).map(s => (
                  <Pressable
                    key={s.id}
                    onPress={() => setAssignedStaffId(s.id)}
                    className="px-3.5 py-1.5 rounded-full bg-slate-50 border border-slate-200"
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#475569" }}>{s.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Expected Dispatch Offset */}
            <View>
              <Text variant="labelSmall" style={{ color: "#64748b", marginBottom: 6, fontWeight: "700" }}>EXPECTED DISPATCH DATE</Text>
              <SegmentedButtons
                value={String(expectedOffsetDays)}
                onValueChange={v => setExpectedOffsetDays(Number(v))}
                buttons={[
                  { value: "1", label: "Tomorrow" },
                  { value: "3", label: "3 Days" },
                  { value: "7", label: "1 Week" },
                ]}
                theme={{ colors: { primary: "#1e40af" } }}
              />
            </View>

            {/* Priority */}
            <View>
              <Text variant="labelSmall" style={{ color: "#64748b", marginBottom: 6, fontWeight: "700" }}>ORDER PRIORITY</Text>
              <SegmentedButtons
                value={priority}
                onValueChange={v => setPriority(v as any)}
                buttons={priorities.map(p => ({ value: p.value, label: p.label }))}
                theme={{ colors: { primary: "#1e40af" } }}
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
              style={{ backgroundColor: "white" }}
              outlineStyle={{ borderRadius: 10 }}
            />
          </View>
        </Section>

        {errorMsg && (
          <View className="bg-red-50 p-4 rounded-xl flex-row items-center gap-2.5 mx-4 mt-2">
            <Icon source="alert-circle" size={18} color="#ef4444" />
            <Text variant="bodySmall" style={{ color: "#b91c1c", fontWeight: "700", flex: 1 }}>{errorMsg}</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer Checkout Action */}
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 shadow-xl">
        <Button
          mode="contained"
          disabled={!customerId || cart.length === 0 || orderMutation.isPending}
          loading={orderMutation.isPending}
          onPress={() => orderMutation.mutate()}
          style={{ borderRadius: 12, backgroundColor: "#1e40af" }}
          contentStyle={{ height: 56 }}
          labelStyle={{ fontSize: 16, fontWeight: "800" }}
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
