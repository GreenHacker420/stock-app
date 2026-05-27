import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, TextInput, SegmentedButtons, Icon, Searchbar, List, Divider } from "react-native-paper";
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

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<typeof paymentModes[number]["value"]>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNote] = useState("");

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
        customerId,
        paymentMode,
        amount: Number(amount),
        referenceNumber: reference || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
      setAmount("");
      setReference("");
      setNote("");
      alert("Payment recorded successfully!");
    },
  });

  return (
    <Screen>
      <AppHeader title="Take Payment" subtitle="Record collections from customers" />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Section title="Customer Selection">
          <Searchbar
            placeholder="Search customer name or phone..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={{ backgroundColor: "white", borderRadius: 12, elevation: 2, borderWidth: 1, borderColor: "#e5e7eb" } as any}
          />
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
                  <Text variant="bodySmall" style={{ color: "#1e40af" }}>{selectedCustomer.phone}</Text>
               </View>
               <Button compact mode="text" onPress={() => setCustomerId(undefined)}>Clear</Button>
            </View>
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
                        onPress={() => setPaymentMode(mode.value)}
                        className={`flex-row items-center gap-2 px-4 py-2.5 rounded-full border ${paymentMode === mode.value ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                      >
                        <Icon source={mode.icon} size={18} color={paymentMode === mode.value ? 'white' : '#4b5563'} />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: paymentMode === mode.value ? 'white' : '#111827' }}>{mode.label}</Text>
                      </Pressable>
                    ))}
                 </View>
              </View>

              {paymentMode !== 'CASH' && (
                <TextInput
                   mode="outlined"
                   label="Reference / UTR / Cheque Number"
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
           </View>
        </Section>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 border-t border-gray-100 shadow-xl" style={{ backdropFilter: 'blur(10px)' } as any}>
        <Button
          mode="contained"
          disabled={!amount || Number(amount) <= 0}
          loading={paymentMutation.isPending}
          onPress={() => paymentMutation.mutate()}
          style={{ borderRadius: 12, backgroundColor: "#1e40af" }}
          contentStyle={{ height: 56 }}
          labelStyle={{ fontSize: 16, fontWeight: "800" }}
        >
          Record Payment
        </Button>
      </View>
    </Screen>
  );
}
