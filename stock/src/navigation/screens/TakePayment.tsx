import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, TextInput, SegmentedButtons, Icon, Searchbar, List, Divider, HelperText, Switch, Card } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";
import { addPayment, fetchCustomers, fetchShops } from "../../api/client";
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
  { label: "Cheque", value: "CHEQUE", icon: "book-outline" },
] as const;

export function TakePayment() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();
  const route = useRoute<any>();

  const [isWalkin, setIsWalkin] = useState(!route.params?.customerId);
  const [customerId, setCustomerId] = useState<string | undefined>(route.params?.customerId);
  const [orderId, setOrderId] = useState<string | undefined>(route.params?.orderId);
  const [searchQuery, setSearchQuery] = useState("");
  const [amount, setAmount] = useState(route.params?.amount?.toString() || "");
  const [paymentMode, setPaymentMode] = useState<typeof paymentModes[number]["value"]>("CASH");
  const [upiOption, setUpiOption] = useState<"GENERATE" | "REGISTER">("REGISTER");
  const [reference, setReference] = useState("");
  const [notes, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const activeShop = shopsQuery.data?.find(s => s.id === activeShopId);

  const customersQuery = useQuery({
    queryKey: ["customers", activeShopId],
    queryFn: () => fetchCustomers(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return [];
    return (customersQuery.data ?? []).filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.phone?.includes(searchQuery)
    ).slice(0, 5);
  }, [customersQuery.data, searchQuery]);

  const selectedCustomer = customersQuery.data?.find(c => c.id === customerId);

  const paymentMutation = useMutation({
    mutationFn: () =>
      addPayment(token ?? "", {
        shopId: activeShopId ?? "",
        customerId: isWalkin ? undefined : customerId,
        orderId,
        paymentMode,
        amount: Number(amount),
        referenceNumber: reference || undefined,
        notes: notes || (upiOption === 'GENERATE' ? 'Paid via generated QR (Human Verified)' : undefined),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
      if (orderId) queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      setAmount("");
      setReference("");
      setNote("");
      setUpiOption("REGISTER");
      if (!route.params?.customerId) {
        setCustomerId(undefined);
        setOrderId(undefined);
      }
      setErrorMsg(null);
      alert("Payment recorded successfully!");
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to record payment");
    }
  });

  const upiPayload = useMemo(() => {
    if (!activeShop?.upiId || !amount) return "";
    const name = encodeURIComponent(activeShop.upiName || activeShop.name);
    return `upi://pay?pa=${activeShop.upiId}&pn=${name}&am=${amount}&cu=INR`;
  }, [activeShop, amount]);

  const showQrSection = paymentMode === 'UPI' && upiOption === 'GENERATE' && amount;

  return (
    <Screen>
      <AppHeader title="Take Payment" subtitle="Record collections from customers" />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Section title="Customer Information">
           <View className="flex-row items-center justify-between bg-white p-4 rounded-xl border border-gray-100 mb-2">
              <View>
                 <Text style={{ fontWeight: "700", color: "#111827" }}>Walk-in Customer</Text>
                 <Text variant="bodySmall" style={{ color: "#6b7280" }}>Payment without linking profile</Text>
              </View>
              <Switch value={isWalkin} onValueChange={(v) => { setIsWalkin(v); if(v) setCustomerId(undefined); }} color="#1e40af" />
           </View>

           {!isWalkin && (
             <>
               {!selectedCustomer && (
                 <Searchbar
                   placeholder="Search customer name or phone..."
                   onChangeText={setSearchQuery}
                   value={searchQuery}
                   style={{ backgroundColor: "white", borderRadius: 12, elevation: 2, borderWidth: 1, borderColor: "#e5e7eb" } as any}
                 />
               )}
               {searchQuery ? (
                 <View className="mt-2 bg-white rounded-lg border border-gray-100 shadow-lg z-50">
                   {filteredCustomers.map(customer => (
                     <List.Item
                       key={customer.id}
                       title={customer.name}
                       description={customer.phone}
                       onPress={() => {
                         setCustomerId(customer.id);
                         setSearchQuery("");
                         setErrorMsg(null);
                       }}
                       right={props => <List.Icon {...props} icon="account-check-outline" color="#1e40af" />}
                     />
                   ))}
                 </View>
               ) : null}

               {selectedCustomer && (
                 <View className="mt-3 p-4 bg-blue-50 rounded-xl border border-blue-100 flex-row justify-between items-center">
                    <View>
                       <Text style={{ fontWeight: "800", color: "#1e3a8a" }}>{selectedCustomer.name}</Text>
                       <Text variant="bodySmall" style={{ color: "#1e40af" }}>{selectedCustomer.phone}{orderId ? ` • Linked to Order` : ""}</Text>
                    </View>
                    <Button compact mode="text" onPress={() => { setCustomerId(undefined); setOrderId(undefined); }}>Change</Button>
                 </View>
               )}
             </>
           )}
        </Section>

        <Section title="Payment Details">
           <View className="bg-white rounded-xl border border-gray-100 p-4 gap-4 shadow-sm">
              <View>
                 <Text variant="labelSmall" style={{ color: "#6b7280", marginBottom: 8, fontWeight: "700" }}>AMOUNT RECEIVED</Text>
                 <TextInput
                    mode="outlined"
                    placeholder="₹ 0.00"
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    disabled={paymentMutation.isPending}
                    style={{ backgroundColor: "white", fontSize: 20 }}
                    outlineStyle={{ borderRadius: 12, borderWidth: 1.5 }}
                    left={<TextInput.Affix text="₹" />}
                 />
              </View>

              <View>
                 <Text variant="labelSmall" style={{ color: "#6b7280", marginBottom: 8, fontWeight: "700" }}>PAYMENT MODE</Text>
                 <View className="flex-row flex-wrap gap-2">
                    {paymentModes.map(mode => (
                      <Pressable 
                        key={mode.value} 
                        onPress={() => { if(!paymentMutation.isPending) { setPaymentMode(mode.value); setErrorMsg(null); } }}
                        className={`flex-row items-center gap-2 px-4 py-2.5 rounded-full border ${paymentMode === mode.value ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                      >
                        <Icon source={mode.icon} size={18} color={paymentMode === mode.value ? 'white' : '#4b5563'} />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: paymentMode === mode.value ? 'white' : '#111827' }}>{mode.label}</Text>
                      </Pressable>
                    ))}
                 </View>
              </View>

              {paymentMode === 'UPI' && (
                <View className="gap-3 border-t border-gray-50 pt-4 mt-2">
                   <Text variant="labelSmall" style={{ color: "#6b7280", fontWeight: "700" }}>UPI OPTIONS</Text>
                   <SegmentedButtons
                      value={upiOption}
                      onValueChange={v => setUpiOption(v as any)}
                      buttons={[
                        { value: "REGISTER", label: "Register Physical QR", icon: "qrcode" },
                        { value: "GENERATE", label: "Generate Dynamic QR", icon: "plus-box-outline" },
                      ]}
                      theme={{ colors: { primary: "#1e40af" } }}
                   />
                   
                   {upiOption === 'GENERATE' && !activeShop?.upiId && (
                      <View className="p-4 bg-amber-50 rounded-lg border border-amber-100 flex-row gap-3 items-center">
                         <Icon source="alert-circle-outline" size={20} color="#b45309" />
                         <Text style={{ color: "#92400e", fontSize: 12, flex: 1 }}>
                            UPI ID not configured for this shop. Owner must set it in "QR Management" before dynamic codes can be generated.
                         </Text>
                      </View>
                   )}

                   {showQrSection && activeShop?.upiId && (
                      <Card className="bg-white items-center p-6 border border-blue-100 shadow-sm" mode="outlined">
                         <QRCode value={upiPayload} size={200} />
                         <View className="mt-4 items-center">
                            <Text variant="titleMedium" style={{ fontWeight: "800" }}>₹{amount}</Text>
                            <Text variant="bodySmall" style={{ color: "#6b7280" }}>Scan using any UPI App</Text>
                            <View className="bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 mt-4">
                               <Text style={{ color: "#92400e", fontSize: 11, fontWeight: "700", textAlign: 'center' }}>
                                 MANDATORY: Verify payment on your device before confirming.
                               </Text>
                            </View>
                         </View>
                         
                         <View className="flex-row gap-3 mt-6 w-full">
                            <Button 
                               mode="outlined" 
                               onPress={() => setUpiOption("REGISTER")}
                               className="flex-1"
                               style={{ borderColor: "#e5e7eb" }}
                               textColor="#4b5563"
                            >
                               Cancel QR
                            </Button>
                            <Button 
                               mode="contained" 
                               onPress={() => paymentMutation.mutate()}
                               loading={paymentMutation.isPending}
                               className="flex-1"
                               style={{ backgroundColor: "#10b981" }}
                               icon="check-circle"
                            >
                               Done
                            </Button>
                         </View>
                      </Card>
                   )}

                   {!activeShop?.upiId && upiOption === 'GENERATE' && (
                     <View className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                        <Text style={{ color: "#92400e", fontSize: 12 }}>Owner has not configured a UPI ID for this shop. Please use "Register Physical QR" instead.</Text>
                     </View>
                   )}
                </View>
              )}

              {paymentMode !== 'CASH' && (upiOption === 'REGISTER' || paymentMode !== 'UPI') && (
                <TextInput
                   mode="outlined"
                   label={paymentMode === 'CHEQUE' ? "Cheque Number" : "Reference / UTR Number"}
                   value={reference}
                   onChangeText={setReference}
                   style={{ backgroundColor: "white" }}
                   outlineStyle={{ borderRadius: 12 }}
                />
              )}

              <TextInput
                 mode="outlined"
                 label="Notes (Optional)"
                 value={notes}
                 onChangeText={setNote}
                 multiline
                 numberOfLines={2}
                 style={{ backgroundColor: "white" }}
                 outlineStyle={{ borderRadius: 12 }}
              />

              {errorMsg && (
                <View className="bg-red-50 p-3 rounded-lg flex-row items-center gap-2">
                   <Icon source="alert-circle" size={16} color="#ef4444" />
                   <Text variant="bodySmall" style={{ color: "#b91c1c", fontWeight: "600", flex: 1 }}>{errorMsg}</Text>
                </View>
              )}
           </View>
        </Section>
      </ScrollView>

      {!showQrSection && (
        <View className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 border-t border-gray-100 shadow-xl" style={{ backdropFilter: 'blur(10px)' } as any}>
          <Button
            mode="contained"
            disabled={!amount || Number(amount) <= 0}
            loading={paymentMutation.isPending}            onPress={() => paymentMutation.mutate()}
            style={{ borderRadius: 12, backgroundColor: "#1e40af" }}
            contentStyle={{ height: 56 }}
            labelStyle={{ fontSize: 16, fontWeight: "800" }}
          >
            Record Payment
          </Button>
        </View>
      )}
    </Screen>
  );
}
