import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, TextInput, SegmentedButtons, Icon, Searchbar, Divider, List, Card } from "react-native-paper";
import QRCode from "react-native-qrcode-svg";
import { createSale, fetchItems, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";

const paymentModes = [
  { label: "Cash", value: "CASH", icon: "cash" },
  { label: "UPI", value: "UPI", icon: "qrcode-scan" },
  { label: "Card", value: "CARD", icon: "credit-card-outline" },
  { label: "Bank", value: "BANK_TRANSFER", icon: "bank-outline" },
] as const;

export function WalkInSale() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();
  
  const [cart, setCart] = useState<Array<{ id: string, name: string, quantity: number, rate: number, unit: string }>>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [payments, setPayments] = useState<Array<{ mode: string, amount: string }>>([{ mode: "CASH", amount: "" }]);
  const [upiOption, setUpiOption] = useState<"GENERATE" | "REGISTER">("REGISTER");

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const activeShop = shopsQuery.data?.find(s => s.id === activeShopId);
  const itemsQuery = useQuery({
    queryKey: ["items", activeShopId],
    queryFn: () => fetchItems(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const filteredItems = useMemo(() => {
    if (!searchQuery) return [];
    return (itemsQuery.data ?? []).filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.sku?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5);
  }, [itemsQuery.data, searchQuery]);

  const subtotal = cart.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const balance = subtotal - totalPaid;

  const saleMutation = useMutation({
    mutationFn: () =>
      createSale(token ?? "", {
        shopId: activeShopId ?? "",
        isWalkin: true,
        items: cart.map(i => ({ itemId: i.id, quantity: i.quantity, rate: i.rate })),
        payments: payments.filter(p => Number(p.amount) > 0).map(p => ({ 
          paymentMode: p.mode, 
          amount: Number(p.amount),
          notes: p.mode === 'UPI' && upiOption === 'GENERATE' ? 'Paid via Dynamic QR (Human Verified)' : undefined
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", activeShopId] });
      setCart([]);
      setPayments([{ mode: "CASH", amount: "" }]);
      setUpiOption("REGISTER");
      alert("Sale completed successfully!");
    },
  });

  const upiPayload = useMemo(() => {
    const upiPayment = payments.find(p => p.mode === 'UPI');
    if (!activeShop?.upiId || !upiPayment || !upiPayment.amount) return "";
    const name = encodeURIComponent(activeShop.upiName || activeShop.name);
    return `upi://pay?pa=${activeShop.upiId}&pn=${name}&am=${upiPayment.amount}&cu=INR`;
  }, [activeShop, payments]);

  const addToCart = (item: any) => {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { id: item.id, name: item.name, quantity: 1, rate: Number(item.defaultSellingPrice), unit: item.unit }]);
    }
    setSearchQuery("");
  };

  const hasUpi = payments.some(p => p.mode === 'UPI');
  const isQrVisible = hasUpi && upiOption === 'GENERATE' && upiPayload;

  return (
    <Screen>
      <AppHeader title="Walk-in Sale" subtitle="Fast counter checkout" />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Section title="Item Search">
          <Searchbar
            placeholder="Search name or SKU..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={{ backgroundColor: "white", borderRadius: 12, elevation: 2, borderWidth: 1, borderColor: "#e5e7eb" } as any}
          />
          {searchQuery ? (
            <View className="mt-2 bg-white rounded-lg border border-gray-100 shadow-lg z-50">
              {filteredItems.map(item => (
                <List.Item
                  key={item.id}
                  title={item.name}
                  description={`₹${item.defaultSellingPrice} / ${item.unit}`}
                  onPress={() => addToCart(item)}
                  right={props => <List.Icon {...props} icon="plus-circle" color="#1e40af" />}
                />
              ))}
            </View>
          ) : null}
        </Section>

        {cart.length > 0 && (
          <Section title="Cart">
            <View className="bg-white rounded-xl border border-gray-100 overflow-hidden">
               {cart.map((item, idx) => (
                 <View key={item.id}>
                    {idx > 0 && <Divider />}
                    <View className="p-4 flex-row justify-between items-center">
                       <View className="flex-1">
                          <Text style={{ fontWeight: "700" }}>{item.name}</Text>
                          <Text variant="bodySmall" style={{ color: "#6b7280" }}>₹{item.rate} x {item.quantity} {item.unit}</Text>
                       </View>
                       <View className="flex-row items-center gap-3">
                          <Pressable onPress={() => setCart(cart.map(c => c.id === item.id ? { ...c, quantity: Math.max(0, c.quantity - 1) } : c).filter(c => c.quantity > 0))}>
                             <Icon source="minus-circle-outline" size={24} color="#ef4444" />
                          </Pressable>
                          <Text style={{ fontWeight: "800", minWidth: 20, textAlign: 'center' }}>{item.quantity}</Text>
                          <Pressable onPress={() => setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))}>
                             <Icon source="plus-circle-outline" size={24} color="#1e40af" />
                          </Pressable>
                       </View>
                    </View>
                 </View>
               ))}
               <View className="bg-gray-50 p-4 flex-row justify-between">
                  <Text style={{ fontWeight: "700" }}>Subtotal</Text>
                  <Text style={{ fontWeight: "900", color: "#111827" }}>₹{subtotal.toFixed(2)}</Text>
               </View>
            </View>
          </Section>
        )}

        {cart.length > 0 && (
          <Section title="Payments">
             <View className="gap-3">
                {payments.map((p, idx) => (
                  <View key={idx} className="flex-row gap-2 items-center">
                     <View className="flex-1">
                        <TextInput
                          mode="outlined"
                          label={p.mode}
                          keyboardType="numeric"
                          value={p.amount}
                          onChangeText={(v) => setPayments(payments.map((pay, i) => i === idx ? { ...pay, amount: v } : pay))}
                          style={{ backgroundColor: "white" }}
                          outlineStyle={{ borderRadius: 12 }}
                        />
                     </View>
                     <Button mode="outlined" compact onPress={() => {
                        const nextMode = paymentModes[(paymentModes.findIndex(m => m.value === p.mode) + 1) % paymentModes.length].value;
                        setPayments(payments.map((pay, i) => i === idx ? { ...pay, mode: nextMode } : pay));
                     }}>Mode</Button>
                     {payments.length > 1 && (
                       <IconButton icon="delete-outline" iconColor="#ef4444" onPress={() => setPayments(payments.filter((_, i) => i !== idx))} />
                     )}
                  </View>
                ))}
                <Button mode="text" icon="plus" onPress={() => setPayments([...payments, { mode: "UPI", amount: "" }])}>Add Split Payment</Button>
             </View>
          </Section>
        )}

        {hasUpi && (
           <View className="mx-4 mt-2 mb-4 p-4 bg-white rounded-xl border border-blue-100 gap-3 shadow-sm">
              <Text variant="labelSmall" style={{ color: "#1e40af", fontWeight: "800" }}>UPI QR OPTIONS</Text>
              <SegmentedButtons
                value={upiOption}
                onValueChange={v => setUpiOption(v as any)}
                buttons={[
                  { value: "REGISTER", label: "Shop QR", icon: "qrcode" },
                  { value: "GENERATE", label: "Dynamic QR", icon: "plus-box-outline" },
                ]}
                theme={{ colors: { primary: "#1e40af" } }}
              />

              {upiOption === 'GENERATE' && !activeShop?.upiId && (
                <View className="p-4 bg-amber-50 rounded-lg border border-amber-100 flex-row gap-3 items-center">
                   <Icon source="alert-circle-outline" size={20} color="#b45309" />
                   <Text style={{ color: "#92400e", fontSize: 11, flex: 1, fontWeight: "600" }}>
                      UPI ID missing. Owner must configure it in "QR Management".
                   </Text>
                </View>
              )}

              {upiOption === 'GENERATE' && upiPayload && activeShop?.upiId && (
                <View className="items-center py-4 bg-gray-50 rounded-lg gap-4">
                   <QRCode value={upiPayload} size={180} />
                   <View className="items-center">
                      <Text variant="labelSmall" style={{ color: "#64748b" }}>Pay to: {activeShop?.upiName || activeShop?.name}</Text>
                      <View className="bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 mt-2">
                         <Text style={{ color: "#92400e", fontSize: 10, fontWeight: "700" }}>VERIFY ON YOUR PHONE BEFORE DONE</Text>
                      </View>
                   </View>
                   <View className="flex-row gap-3 w-full px-4">
                      <Button mode="outlined" style={{ flex: 1, borderColor: "#e5e7eb" }} textColor="#4b5563" onPress={() => setUpiOption("REGISTER")}>Cancel QR</Button>
                      <Button mode="contained" style={{ flex: 1, backgroundColor: "#10b981" }} icon="check-circle" onPress={() => saleMutation.mutate()} loading={saleMutation.isPending} disabled={balance > 0}>Done</Button>
                   </View>
                </View>
              )}
           </View>
        )}

        {cart.length > 0 && (
          <View className={`mt-4 p-4 rounded-xl gap-1 ${balance === 0 ? 'bg-emerald-900' : 'bg-slate-900'}`}>
            <View className="flex-row justify-between">
              <Text style={{ color: "#9ca3af" }}>Paid So Far</Text>
              <Text style={{ color: "white" }}>₹{totalPaid.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-white/10">
              <Text variant="titleMedium" style={{ color: "white", fontWeight: "700" }}>{balance > 0 ? 'Remaining' : 'Change'}</Text>
              <Text variant="headlineSmall" style={{ color: "white", fontWeight: "900" }}>₹{Math.abs(balance).toFixed(2)}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {!isQrVisible && (
        <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-xl">
          <Button
            mode="contained"
            disabled={cart.length === 0 || balance > 0}
            loading={saleMutation.isPending}
            onPress={() => saleMutation.mutate()}
            style={{ borderRadius: 12 }}
            contentStyle={{ height: 56 }}
            labelStyle={{ fontSize: 18, fontWeight: "700" }}
          >
            Complete Sale (₹{subtotal.toFixed(2)})
          </Button>
        </View>
      )}
    </Screen>
  );
}

function IconButton({ icon, iconColor, onPress }: { icon: string, iconColor: string, onPress: () => void }) {
   return (
      <Pressable onPress={onPress} className="p-2">
         <Icon source={icon} size={24} color={iconColor} />
      </Pressable>
   )
}
