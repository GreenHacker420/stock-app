import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, TextInput, Searchbar, Icon } from "react-native-paper";
import { createWalkInSale, fetchItems, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { ShopPicker } from "../../components/ui/ShopPicker";

const paymentModes = [
  { label: "Cash", value: "CASH", icon: "cash" },
  { label: "UPI", value: "UPI", icon: "qrcode-scan" },
  { label: "Card", value: "CARD", icon: "credit-card-outline" },
  { label: "Bank", value: "BANK_TRANSFER", icon: "bank-outline" },
] as const;

export function WalkInSale() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const [shopId, setShopId] = useState<string | undefined>();
  const [itemId, setItemId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [rate, setRate] = useState("");
  const [paymentMode, setPaymentMode] = useState<(typeof paymentModes)[number]["value"]>("CASH");

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const itemsQuery = useQuery({
    queryKey: ["items", shopId],
    queryFn: () => fetchItems(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return (itemsQuery.data ?? []).slice(0, 5);
    return (itemsQuery.data ?? []).filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.sku?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5);
  }, [itemsQuery.data, searchQuery]);

  const selectedItem = itemsQuery.data?.find((item) => item.id === itemId);
  const total = useMemo(() => Number(quantity || 0) * Number(rate || 0), [quantity, rate]);

  const saleMutation = useMutation({
    mutationFn: () =>
      createWalkInSale(token ?? "", {
        shopId: shopId ?? "",
        itemId: itemId ?? "",
        quantity: Number(quantity),
        rate: Number(rate),
        paymentMode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", shopId] });
      setItemId(undefined);
      setQuantity("1");
      setSearchQuery("");
      alert("Sale completed successfully!");
    },
  });

  const increment = () => setQuantity(q => String(Math.max(1, Number(q) + 1)));
  const decrement = () => setQuantity(q => String(Math.max(1, Number(q) - 1)));

  return (
    <Screen>
      <AppHeader title="Walk-in Sale" subtitle="Fast counter checkout" />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

        <Section title="Item Search">
          <Searchbar
            placeholder="Search name or SKU..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={{ backgroundColor: "white", borderRadius: 8, elevation: 0, borderWeight: 1, borderColor: "#e5e7eb" } as any}
          />
          
          <View className="mt-3 gap-2">
            {filteredItems.map(item => (
              <Pressable 
                key={item.id} 
                onPress={() => {
                  setItemId(item.id);
                  setRate(item.defaultSellingPrice);
                  setSearchQuery("");
                }}
                className={`p-3 rounded-lg border ${itemId === item.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'}`}
              >
                <View className="flex-row justify-between items-center">
                  <View>
                    <Text style={{ fontWeight: "700" }}>{item.name}</Text>
                    {item.sku ? <Text variant="bodySmall" style={{ color: "#6b7280" }}>SKU: {item.sku}</Text> : null}
                  </View>
                  <Text style={{ fontWeight: "700", color: "#111827" }}>₹{item.defaultSellingPrice}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Section>

        {selectedItem && (
          <Section title="Quantity & Rate">
            <View className="bg-white p-4 rounded-lg border border-gray-200 gap-4">
              <View className="flex-row items-center justify-between">
                <Text variant="titleMedium" style={{ fontWeight: "700" }}>{selectedItem.name}</Text>
                <View className="flex-row items-center gap-4 bg-gray-50 rounded-lg px-2 py-1">
                  <Pressable onPress={decrement} className="p-2">
                    <Icon source="minus" size={20} color="#1e40af" />
                  </Pressable>
                  <Text variant="titleMedium" style={{ fontWeight: "800", minWidth: 24, textAlign: "center" }}>{quantity}</Text>
                  <Pressable onPress={increment} className="p-2">
                    <Icon source="plus" size={20} color="#1e40af" />
                  </Pressable>
                </View>
              </View>
              <TextInput
                mode="outlined"
                label="Custom Rate (₹)"
                keyboardType="numeric"
                value={rate}
                onChangeText={setRate}
                style={{ backgroundColor: "white" }}
              />
            </View>
          </Section>
        )}

        <Section title="Payment Mode">
          <View className="flex-row flex-wrap gap-2">
            {paymentModes.map((mode) => (
              <Pressable
                key={mode.value}
                onPress={() => setPaymentMode(mode.value)}
                className={`flex-1 min-w-[45%] p-3 rounded-lg border flex-row items-center gap-3 ${
                  paymentMode === mode.value ? "bg-blue-600 border-blue-600" : "bg-white border-gray-200"
                }`}
              >
                <Icon source={mode.icon} size={20} color={paymentMode === mode.value ? "white" : "#4b5563"} />
                <Text style={{ fontWeight: "700", color: paymentMode === mode.value ? "white" : "#111827" }}>
                  {mode.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <View className="mt-4 p-4 rounded-xl bg-gray-900 gap-1">
          <View className="flex-row justify-between">
            <Text style={{ color: "#9ca3af" }}>Subtotal</Text>
            <Text style={{ color: "white" }}>₹{total.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-gray-800">
            <Text variant="titleMedium" style={{ color: "white", fontWeight: "700" }}>Total Amount</Text>
            <Text variant="headlineSmall" style={{ color: "white", fontWeight: "900" }}>₹{total.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <Button
          mode="contained"
          disabled={!itemId || Number(quantity) <= 0 || Number(rate) < 0}
          loading={saleMutation.isPending}
          onPress={() => saleMutation.mutate()}
          style={{ borderRadius: 8 }}
          contentStyle={{ height: 56 }}
          labelStyle={{ fontSize: 18, fontWeight: "700" }}
        >
          Complete Sale (₹{total.toFixed(2)})
        </Button>
      </View>
    </Screen>
  );
}
