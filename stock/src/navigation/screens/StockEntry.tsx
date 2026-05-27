import { useEffect, useState, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Button, Text, TextInput, SegmentedButtons, Icon, Searchbar, Divider } from "react-native-paper";
import { createStockMovement, fetchItems, fetchShops, fetchCurrentStock } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";
import { SuccessModal } from "../../components/ui/SuccessModal";

const reasons = ["Regular Restock", "Customer Return", "Correction", "Damage", "Other"];

export function StockEntry() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const route = useRoute();
  const navigation = useNavigation();
  const params = route.params as { shopId?: string; itemId?: string } | undefined;
  
  const [shopId, setShopId] = useState<string | undefined>(params?.shopId);
  const [itemId, setItemId] = useState<string | undefined>(params?.itemId);
  const [movementType, setMovementType] = useState<"STOCK_IN" | "STOCK_OUT">("STOCK_IN");
  const [searchQuery, setSearchQuery] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Success modal states
  const [successVisible, setSuccessVisible] = useState(false);

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
    return all.filter(i => 
      i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      i.sku?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 4);
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
      queryClient.invalidateQueries({ queryKey: ["item-stock", itemId] });
      queryClient.invalidateQueries({ queryKey: ["stock", shopId, itemId] });
      queryClient.invalidateQueries({ queryKey: ["item-movements", shopId, itemId] });
      setQuantity("");
      setNote("");
      setErrorMsg(null);
      setSuccessVisible(true);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to record stock movement");
    }
  });

  return (
    <Screen>
      <AppHeader title="Stock Movement" subtitle="Record inventory adjustments." />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="gap-5">
          <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

          <View className="gap-2.5">
            <Text variant="labelSmall" style={{ color: "#64748b", fontWeight: "700" }}>MOVEMENT DIRECTION</Text>
            <SegmentedButtons
              value={movementType}
              onValueChange={v => setMovementType(v as any)}
              buttons={[
                { value: "STOCK_IN", label: "Stock In (Add)", icon: "plus-circle" },
                { value: "STOCK_OUT", label: "Stock Out (Reduce)", icon: "minus-circle" },
              ]}
              theme={{ colors: { primary: movementType === 'STOCK_IN' ? "#1e40af" : "#ef4444" } }}
            />
          </View>

          {/* Item Search Section */}
          <Section title="Item Search">
            <Searchbar
              placeholder="Search item or SKU..."
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={{ backgroundColor: "white", borderRadius: 12, elevation: 1, borderWidth: 1, borderColor: "#e2e8f0" } as any}
            />
            
            <View className="mt-3 gap-2.5">
              {filteredItems.map(item => (
                <Pressable 
                  key={item.id} 
                  onPress={() => { setItemId(item.id); setSearchQuery(""); }}
                  className={`p-4 rounded-2xl border ${itemId === item.id ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 bg-white'} flex-row justify-between items-center shadow-sm`}
                >
                  <View className="flex-1 pr-2">
                    <Text style={{ fontWeight: "800", color: "#0f172a" }}>{item.name}</Text>
                    <Text variant="bodySmall" style={{ color: "#64748b", marginTop: 2 }}>{item.sku || "No SKU"} • {item.category?.name ?? "General"}</Text>
                  </View>
                  <View className="items-end">
                    <Text style={{ fontWeight: "700", color: "#475569" }}>{item.unit}</Text>
                    <Text variant="labelSmall" style={{ color: "#94a3b8", fontSize: 9 }}>DEFAULT UNIT</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Section>

          {/* Current Inventory Hero Card */}
          {selectedItem && (
            <View className="bg-slate-900 rounded-[24px] p-5 flex-row justify-between items-center shadow-lg relative overflow-hidden">
               <View className="z-10">
                 <Text variant="labelSmall" style={{ color: "#94a3b8", fontWeight: "700", letterSpacing: 0.5 }}>CURRENT INVENTORY</Text>
                 <Text variant="headlineSmall" style={{ color: "white", fontWeight: "900", marginTop: 4 }}>
                   {stockQuery.data?.[0]?.currentQuantity ?? 0} {selectedItem.unit}
                 </Text>
               </View>
               <View className="opacity-10 absolute right-4 bottom-2 z-0">
                 <Icon source="warehouse" size={80} color="white" />
               </View>
            </View>
          )}

          {/* Movement detail inputs */}
          <Section title="Movement Details">
            <View className="bg-white rounded-[24px] border border-slate-100 p-5 gap-4 shadow-sm">
               <View>
                 <Text variant="labelSmall" style={{ color: "#64748b", marginBottom: 6, fontWeight: "700" }}>
                   QUANTITY TO {movementType === 'STOCK_IN' ? 'ADD' : 'REMOVE'}
                 </Text>
                 <TextInput
                   mode="outlined"
                   placeholder="0.00"
                   keyboardType="numeric"
                   value={quantity}
                   onChangeText={setQuantity}
                   style={{ backgroundColor: "white" }}
                   outlineStyle={{ borderRadius: 12 }}
                   right={<TextInput.Affix text={selectedItem?.unit ?? "units"} />}
                 />
               </View>

               <View>
                 <Text variant="labelSmall" style={{ color: "#64748b", marginBottom: 6, fontWeight: "700" }}>REASON FOR ADJUSTMENT</Text>
                 <View className="flex-row flex-wrap gap-2">
                    {reasons.map(r => (
                      <Pressable 
                        key={r} 
                        onPress={() => setReason(r)}
                        className={`px-3.5 py-1.5 rounded-full border ${reason === r ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: reason === r ? 'white' : '#475569' }}>{r}</Text>
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
                 numberOfLines={2}
                 style={{ backgroundColor: "white" }}
                 outlineStyle={{ borderRadius: 12 }}
               />
            </View>
          </Section>
        </View>

        {errorMsg && (
          <View className="bg-red-50 p-4 rounded-xl flex-row items-center gap-2.5 mt-4">
            <Icon source="alert-circle" size={18} color="#ef4444" />
            <Text variant="bodySmall" style={{ color: "#b91c1c", fontWeight: "700", flex: 1 }}>{errorMsg}</Text>
          </View>
        )}
      </ScrollView>

      {/* Checkout button */}
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white/95 border-t border-slate-100 shadow-xl">
        <Button
          mode="contained"
          disabled={!itemId || !quantity || Number(quantity) <= 0 || stockMutation.isPending}
          loading={stockMutation.isPending}
          onPress={() => stockMutation.mutate()}
          style={{ borderRadius: 12, backgroundColor: movementType === 'STOCK_IN' ? "#1e40af" : "#ef4444" }}
          contentStyle={{ height: 56 }}
          labelStyle={{ fontSize: 16, fontWeight: "800", color: "#ffffff" }}
        >
          Confirm {movementType === 'STOCK_IN' ? 'Addition' : 'Removal'}
        </Button>
      </View>

      <SuccessModal
        visible={successVisible}
        title="Stock Updated"
        message="The inventory adjustment has been recorded successfully!"
        onClose={() => {
          setSuccessVisible(false);
          navigation.goBack();
        }}
      />
    </Screen>
  );
}
