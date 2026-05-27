import { useEffect, useState, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "@react-navigation/native";
import { Button, Text, TextInput, SegmentedButtons, Icon, Searchbar, Divider } from "react-native-paper";
import { createStockMovement, fetchItems, fetchShops, fetchCurrentStock } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";

const reasons = ["Regular Restock", "Customer Return", "Correction", "Damage", "Other"];

export function StockEntry() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const route = useRoute();
  const params = route.params as { shopId?: string; itemId?: string } | undefined;
  
  const [shopId, setShopId] = useState<string | undefined>(params?.shopId);
  const [itemId, setItemId] = useState<string | undefined>(params?.itemId);
  const [movementType, setMovementType] = useState<"STOCK_IN" | "STOCK_OUT">("STOCK_IN");
  const [searchQuery, setSearchQuery] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState("");

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const itemsQuery = useQuery({
    queryKey: ["items", shopId],
    queryFn: () => fetchItems(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const stockQuery = useQuery({
    queryKey: ["stock", shopId, itemId],
    queryFn: () => fetchCurrentStock(token ?? "", shopId ?? "", itemId),
    enabled: !!token && !!shopId && !!itemId,
  });

  useEffect(() => {
    if (params?.shopId) setShopId(params.shopId);
    if (params?.itemId) setItemId(params.itemId);
  }, [params]);

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const filteredItems = useMemo(() => {
    const all = itemsQuery.data ?? [];
    if (!searchQuery) return all.slice(0, 4);
    return all.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 4);
  }, [itemsQuery.data, searchQuery]);

  const selectedItem = itemsQuery.data?.find(i => i.id === itemId);

  const stockMutation = useMutation({
    mutationFn: () =>
      createStockMovement(token ?? "", {
        shopId: shopId ?? "",
        itemId: itemId ?? "",
        movementType,
        quantity: Number(quantity),
        reason: `${reason}${note ? ': ' + note : ''}`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", shopId] });
      setQuantity("");
      setNote("");
      alert("Movement recorded successfully.");
    },
  });

  return (
    <Screen scroll={true}>
      <AppHeader title="Stock Movement" subtitle="Record inventory adjustments." />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="p-4 gap-6">
          <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

          <View className="gap-3">
            <Text variant="labelLarge" style={{ color: "#6b7280", fontWeight: "700" }}>MOVEMENT TYPE</Text>
            <SegmentedButtons
              value={movementType}
              onValueChange={v => setMovementType(v as any)}
              buttons={[
                { value: "STOCK_IN", label: "Stock In", icon: "arrow-down-bold-circle-outline" },
                { value: "STOCK_OUT", label: "Stock Out", icon: "arrow-up-bold-circle-outline" },
              ]}
              theme={{ colors: { primary: movementType === 'STOCK_IN' ? "#1e40af" : "#ef4444" } }}
            />
          </View>

          <Section title="Item Search">
            <Searchbar
              placeholder="Search name or SKU..."
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={{ backgroundColor: "white", borderRadius: 12, elevation: 2, borderWidth: 1, borderColor: "#e5e7eb" } as any}
            />
            <View className="mt-3 gap-2">
              {filteredItems.map(item => (
                <Pressable 
                  key={item.id} 
                  onPress={() => { setItemId(item.id); setSearchQuery(""); }}
                  className={`p-4 rounded-xl border ${itemId === item.id ? 'border-blue-600 bg-blue-50' : 'border-gray-100 bg-white'} flex-row justify-between items-center shadow-sm`}
                >
                  <View>
                    <Text style={{ fontWeight: "800", color: "#111827" }}>{item.name}</Text>
                    <Text variant="bodySmall" style={{ color: "#6b7280" }}>{item.category?.name ?? "General"}</Text>
                  </View>
                  <View className="items-end">
                    <Text style={{ fontWeight: "700", color: "#111827" }}>{item.unit}</Text>
                    <Text variant="labelSmall" style={{ color: "#9ca3af" }}>DEFAULT UNIT</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Section>

          {selectedItem && (
            <View className="bg-slate-900 rounded-xl p-4 flex-row justify-between items-center shadow-lg">
               <View>
                 <Text variant="labelSmall" style={{ color: "#9ca3af", fontWeight: "700" }}>CURRENT INVENTORY</Text>
                 <Text variant="headlineSmall" style={{ color: "white", fontWeight: "900" }}>{stockQuery.data?.[0]?.currentQuantity ?? 0} {selectedItem.unit}</Text>
               </View>
               <Icon source="warehouse" size={32} color="rgba(255,255,255,0.1)" />
            </View>
          )}

          <Section title="Movement Details">
            <View className="bg-white rounded-xl border border-gray-100 p-4 gap-4 shadow-sm">
               <View>
                 <Text variant="labelSmall" style={{ color: "#6b7280", marginBottom: 8 }}>QUANTITY TO {movementType === 'STOCK_IN' ? 'ADD' : 'REMOVE'}</Text>
                 <TextInput
                   mode="outlined"
                   placeholder="Enter amount"
                   keyboardType="numeric"
                   value={quantity}
                   onChangeText={setQuantity}
                   style={{ backgroundColor: "white" }}
                   outlineStyle={{ borderRadius: 12 }}
                   right={<TextInput.Affix text={selectedItem?.unit ?? "units"} />}
                 />
               </View>

               <View>
                 <Text variant="labelSmall" style={{ color: "#6b7280", marginBottom: 8 }}>REASON FOR MOVEMENT</Text>
                 <View className="flex-row flex-wrap gap-2">
                    {reasons.map(r => (
                      <Pressable 
                        key={r} 
                        onPress={() => setReason(r)}
                        className={`px-4 py-2 rounded-full border ${reason === r ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: reason === r ? 'white' : '#4b5563' }}>{r}</Text>
                      </Pressable>
                    ))}
                 </View>
               </View>

               <TextInput
                 mode="outlined"
                 label="Additional Notes (Optional)"
                 value={note}
                 onChangeText={setNote}
                 multiline
                 numberOfLines={3}
                 style={{ backgroundColor: "white" }}
                 outlineStyle={{ borderRadius: 12 }}
               />
            </View>
          </Section>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 border-t border-gray-100 shadow-xl" style={{ backdropFilter: 'blur(10px)' } as any}>
        <Button
          mode="contained"
          disabled={!itemId || !quantity || Number(quantity) <= 0}
          loading={stockMutation.isPending}
          onPress={() => stockMutation.mutate()}
          style={{ borderRadius: 12, backgroundColor: movementType === 'STOCK_IN' ? "#1e40af" : "#ef4444" }}
          contentStyle={{ height: 56 }}
          labelStyle={{ fontSize: 16, fontWeight: "800" }}
        >
          Confirm {movementType === 'STOCK_IN' ? 'Addition' : 'Removal'}
        </Button>
      </View>
    </Screen>
  );
}
