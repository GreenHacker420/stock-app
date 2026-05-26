import { useEffect, useState, useMemo } from "react";
import { View, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, TextInput, Text, Icon, Divider, Checkbox } from "react-native-paper";
import { closeCashSession, fetchCurrentCashSession, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";

export function CloseDay() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const [shopId, setShopId] = useState<string | undefined>();
  const [actualCash, setActualCash] = useState("");
  const [cashHandover, setCashHandover] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [differenceReason, setDifferenceReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const currentQuery = useQuery({
    queryKey: ["cash-session", shopId],
    queryFn: () => fetchCurrentCashSession(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const expected = Number(currentQuery.data?.expectedCash ?? 0);
  const actual = Number(actualCash || 0);
  const deductions = Number(otherDeductions || 0);
  const finalExpected = expected - deductions;
  const difference = actual - finalExpected;
  const isMismatched = Math.abs(difference) > 0.01 && actualCash !== "";

  const closeMutation = useMutation({
    mutationFn: () =>
      closeCashSession(token ?? "", currentQuery.data?.id ?? "", {
        actualCash: actual,
        cashHandover: Number(cashHandover || 0),
        otherDeductionsAmount: deductions,
        otherDeductionsReason: otherReason || undefined,
        differenceReason: isMismatched ? differenceReason : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-session", shopId] });
      alert("Day closed successfully.");
    },
  });

  return (
    <Screen scroll={true}>
      <AppHeader title="Day Closing" subtitle={new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="p-4 gap-6">
          <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

          {/* System Calculation Card */}
          <View className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
             <View className="bg-gray-900 p-4 flex-row justify-between items-center">
                <Text variant="labelMedium" style={{ color: "#9ca3af", fontWeight: "700", letterSpacing: 1 }}>SYSTEM CALCULATION</Text>
                <Icon source="calculator-variant-outline" size={20} color="#9ca3af" />
             </View>
             <View className="p-5 gap-4">
                <View className="flex-row justify-between items-end">
                   <View>
                      <Text variant="bodySmall" style={{ color: "#6b7280", fontWeight: "600" }}>EXPECTED CASH</Text>
                      <Text variant="headlineMedium" style={{ color: "#111827", fontWeight: "900" }}>₹{expected.toLocaleString()}</Text>
                   </View>
                   <View className="bg-blue-50 px-3 py-1 rounded-full">
                      <Text style={{ color: "#1e40af", fontSize: 10, fontWeight: "800" }}>LEDGER BASE</Text>
                   </View>
                </View>
                <Divider />
                <View className="gap-2">
                   <BreakdownRow label="Cash Sales (+)" value={`₹${expected.toLocaleString()}`} />
                   <BreakdownRow label="Expenses / Payouts (-)" value={`₹${deductions.toLocaleString()}`} isNegative />
                </View>
             </View>
          </View>

          {/* Physical Count Entry */}
          <Section title="Physical Reconciliation">
             <View className="bg-white rounded-xl border border-gray-100 p-5 gap-5 shadow-sm">
                <View>
                   <Text variant="labelSmall" style={{ color: "#6b7280", marginBottom: 8, fontWeight: "700" }}>ACTUAL CASH IN DRAWER</Text>
                   <TextInput
                      mode="outlined"
                      placeholder="Enter counted amount"
                      keyboardType="numeric"
                      value={actualCash}
                      onChangeText={setActualCash}
                      style={{ backgroundColor: "white", fontSize: 24 }}
                      outlineStyle={{ borderRadius: 12, borderWidth: 2 }}
                      textColor="#111827"
                      left={<TextInput.Affix text="₹" />}
                   />
                </View>

                {isMismatched ? (
                  <View className="bg-red-50 border border-red-100 p-4 rounded-xl gap-3">
                     <View className="flex-row justify-between items-center">
                        <View className="flex-row items-center gap-2">
                           <Icon source="alert-circle" size={20} color="#ef4444" />
                           <Text style={{ color: "#b91c1c", fontWeight: "800" }}>Discrepancy Detected</Text>
                        </View>
                        <Text style={{ color: "#b91c1c", fontWeight: "900", fontSize: 16 }}>{difference > 0 ? "+" : ""}₹{difference.toFixed(2)}</Text>
                     </View>
                     <TextInput
                        mode="outlined"
                        label="Reason for Mismatch"
                        placeholder="e.g. Returned small change, mistake in entry"
                        value={differenceReason}
                        onChangeText={setDifferenceReason}
                        style={{ backgroundColor: "white" }}
                        outlineStyle={{ borderRadius: 8 }}
                     />
                  </View>
                ) : actualCash !== "" ? (
                  <View className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex-row items-center gap-3">
                     <Icon source="checkbox-marked-circle" size={24} color="#10b981" />
                     <Text style={{ color: "#065f46", fontWeight: "800" }}>Reconciliation Balanced</Text>
                  </View>
                ) : null}

                <Divider />

                <View className="gap-4">
                   <View className="flex-row justify-between items-center">
                      <Text style={{ color: "#4b5563", fontWeight: "600" }}>Other Deductions</Text>
                      <TextInput
                        mode="flat"
                        dense
                        placeholder="₹0"
                        keyboardType="numeric"
                        value={otherDeductions}
                        onChangeText={setOtherDeductions}
                        style={{ backgroundColor: "transparent", width: 100, textAlign: 'right' }}
                      />
                   </View>
                   {deductions > 0 && (
                     <TextInput
                       mode="outlined"
                       label="Deduction Reason"
                       value={otherReason}
                       onChangeText={setOtherReason}
                       style={{ backgroundColor: "#f9fafb" }}
                     />
                   )}
                   <View className="flex-row justify-between items-center">
                      <Text style={{ color: "#4b5563", fontWeight: "600" }}>Cash Handover</Text>
                      <TextInput
                        mode="flat"
                        dense
                        placeholder="₹0"
                        keyboardType="numeric"
                        value={cashHandover}
                        onChangeText={setCashHandover}
                        style={{ backgroundColor: "transparent", width: 100, textAlign: 'right' }}
                      />
                   </View>
                </View>
             </View>
          </Section>

          <View className="flex-row items-center gap-2 px-1">
             <Checkbox.Android status={confirmed ? 'checked' : 'unchecked'} onPress={() => setConfirmed(!confirmed)} />
             <Text variant="bodySmall" style={{ color: "#6b7280", flex: 1 }}>
                I confirm that I have physically counted the cash and all entries above are accurate.
             </Text>
          </View>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 border-t border-gray-100 shadow-2xl" style={{ backdropFilter: 'blur(10px)' } as any}>
         <Button
            mode="contained"
            disabled={!confirmed || !actualCash || (isMismatched && !differenceReason)}
            loading={closeMutation.isPending}
            onPress={() => closeMutation.mutate()}
            style={{ borderRadius: 12, backgroundColor: isMismatched ? "#f59e0b" : "#1e40af" }}
            contentStyle={{ height: 56 }}
            labelStyle={{ fontSize: 16, fontWeight: "800" }}
         >
            {isMismatched ? "Submit with Mismatch" : "Submit Closing Report"}
         </Button>
      </View>
    </Screen>
  );
}

function BreakdownRow({ label, value, isNegative }: { label: string, value: string, isNegative?: boolean }) {
  return (
    <View className="flex-row justify-between items-center py-1">
       <Text style={{ color: "#6b7280", fontWeight: "500", fontSize: 13 }}>{label}</Text>
       <Text style={{ color: isNegative ? "#ef4444" : "#111827", fontWeight: "700", fontSize: 13 }}>{value}</Text>
    </View>
  );
}
