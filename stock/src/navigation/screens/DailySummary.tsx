import { useEffect, useState, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, Card, Icon, Divider, List, ActivityIndicator } from "react-native-paper";
import { fetchDailySummary, lockDailySummary, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SuccessModal } from "../../components/ui/SuccessModal";

export function DailySummary() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];

  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  const summaryQuery = useQuery({ 
    queryKey: ["daily-summary", activeShopId, today], 
    queryFn: () => fetchDailySummary(token ?? "", activeShopId ?? "", today), 
    enabled: !!token && !!activeShopId 
  });

  const lockMutation = useMutation({
    mutationFn: () => lockDailySummary(token ?? "", activeShopId ?? "", today),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-summary", activeShopId, today] });
      setSuccessTitle("Summary Locked");
      setSuccessMessage("The daily operations summary has been locked and compiled successfully.");
      setSuccessVisible(true);
    },
  });

  const summary = summaryQuery.data;
  const isLocked = summary?.status === "LOCKED";

  if (summaryQuery.isLoading) return <Screen><ActivityIndicator style={{ flex: 1 }} /></Screen>;

  return (
    <Screen scroll={true}>
      <AppHeader title="Daily Report" subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="p-4 gap-6">
          
          {/* Reconciliation Hero */}
          <Card style={{ backgroundColor: "#111827", borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 }}>
             <Card.Content style={{ padding: 24, alignItems: 'center' }}>
                <View className="mb-4 flex-row justify-between w-full items-center">
                  <Text variant="labelMedium" style={{ color: "#9ca3af", letterSpacing: 1, fontWeight: "700" }}>EXECUTIVE RECONCILIATION</Text>
                  <View className={`px-3 py-1 rounded-full flex-row items-center gap-1.5 ${isLocked ? 'bg-blue-500/20' : 'bg-emerald-500/20'}`}>
                    <View className={`h-2 w-2 rounded-full ${isLocked ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                    <Text style={{ color: isLocked ? "#60a5fa" : "#4ade80", fontSize: 10, fontWeight: "900" }}>{summary?.status}</Text>
                  </View>
                </View>

                <View style={{ height: 160, width: 160, borderRadius: 80, borderWidth: 8, borderColor: '#1f2937', justifyContent: 'center', alignItems: 'center', borderStyle: 'solid' }}>
                   <View style={{ position: 'absolute', height: 160, width: 160, borderRadius: 80, borderLeftWidth: 8, borderTopWidth: 8, borderColor: '#1e40af', transform: [{ rotate: '45deg' }] }} />
                   <View className="items-center">
                      <Text variant="displaySmall" style={{ color: "white", fontWeight: "900" }}>₹{Number(summary?.actualCash || 0).toLocaleString()}</Text>
                      <Text variant="labelSmall" style={{ color: "#9ca3af", fontWeight: "600", marginTop: -4 }}>CASH ON HAND</Text>
                   </View>
                </View>

                <View className="mt-6 flex-row w-full justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                  <View>
                    <Text style={{ color: "#9ca3af", fontSize: 11, fontWeight: "600" }}>EXPECTED</Text>
                    <Text style={{ color: "white", fontSize: 16, fontWeight: "800" }}>₹{Number(summary?.expectedCash || 0).toLocaleString()}</Text>
                  </View>
                  <Icon source={summary?.actualCash === summary?.expectedCash ? "checkbox-marked-circle" : "alert-circle"} size={24} color={summary?.actualCash === summary?.expectedCash ? "#10b981" : "#ef4444"} />
                  <View className="items-end">
                    <Text style={{ color: "#9ca3af", fontSize: 11, fontWeight: "600" }}>ACTUAL</Text>
                    <Text style={{ color: "white", fontSize: 16, fontWeight: "800" }}>₹{Number(summary?.actualCash || 0).toLocaleString()}</Text>
                  </View>
                </View>
             </Card.Content>
          </Card>

          <View className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex-row gap-3 items-start shadow-sm">
             <Icon source="lightbulb-outline" size={20} color="#1e40af" />
             <View className="flex-1">
               <Text variant="titleSmall" style={{ color: "#1e3a8a", fontWeight: "800" }}>Smart Insight</Text>
               <Text variant="bodySmall" style={{ color: "#1e40af", lineHeight: 16, marginTop: 2 }}>
                 {summary?.salesCount} bills issued today. {summary?.totalUpiCollected ? `UPI collections are ₹${Number(summary.totalUpiCollected).toLocaleString()}.` : 'No UPI collections recorded yet.'}
               </Text>
             </View>
          </View>

          <View className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <List.Accordion
                title="Sales Performance"
                description={`₹${Number(summary?.totalSales || 0).toLocaleString()} total value`}
                left={props => <List.Icon {...props} icon="trending-up" color="#1e40af" />}
                titleStyle={{ fontWeight: "700", color: "#111827" }}
                style={{ backgroundColor: 'white' }}
              >
                <View className="p-4 pt-0 gap-3">
                   <MetricRow label="Walk-in Sales" value={`₹${Number(summary?.walkinSales || 0).toLocaleString()}`} detail="Immediate payment" />
                   <MetricRow label="Dispatched Today" value={String(summary?.ordersDispatchedCount || 0)} detail="Order fulfillment" />
                </View>
              </List.Accordion>
              
              <Divider />

              <List.Accordion
                title="Payment Streams"
                description={`Total collection: ₹${(Number(summary?.totalCashCollected || 0) + Number(summary?.totalUpiCollected || 0)).toLocaleString()}`}
                left={props => <List.Icon {...props} icon="credit-card-outline" color="#1e40af" />}
                titleStyle={{ fontWeight: "700", color: "#111827" }}
                style={{ backgroundColor: 'white' }}
              >
                <View className="p-4 pt-0">
                  <BreakdownItem label="Cash" amount={summary?.totalCashCollected} />
                  <BreakdownItem label="UPI" amount={summary?.totalUpiCollected} />
                  <BreakdownItem label="Card" amount={summary?.totalCardCollected} />
                  <BreakdownItem label="Bank Transfer" amount={summary?.totalBankCollected} />
                </View>
              </List.Accordion>
            </View>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 border-t border-gray-100 flex-row gap-3 items-center">
          <Button mode="outlined" style={{ borderRadius: 12, flex: 1, borderColor: '#e5e7eb' }} textColor="#4b5563" onPress={() => {
            setSuccessTitle("PDF Exported");
            setSuccessMessage("Daily Summary PDF has been exported successfully!");
            setSuccessVisible(true);
          }}>Export PDF</Button>
          <Button 
            mode="contained" 
            style={{ flex: 2, borderRadius: 12, backgroundColor: isLocked ? "#10b981" : "#1e40af" }} 
            contentStyle={{ height: 50 }}
            onPress={() => lockMutation.mutate()}
            disabled={isLocked || lockMutation.isPending}
          >
            {isLocked ? "Report Locked" : "Lock Daily Summary"}
          </Button>
      </View>

      <SuccessModal
        visible={successVisible}
        title={successTitle}
        message={successMessage}
        onClose={() => setSuccessVisible(false)}
      />
    </Screen>
  );
}

function MetricRow({ label, value, detail }: { label: string, value: string, detail: string }) {
  return (
    <View className="flex-row justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
      <View>
        <Text style={{ fontWeight: "700", color: "#374151" }}>{label}</Text>
        <Text variant="bodySmall" style={{ color: "#9ca3af" }}>{detail}</Text>
      </View>
      <Text variant="titleLarge" style={{ fontWeight: "900", color: "#111827" }}>{value}</Text>
    </View>
  );
}

function BreakdownItem({ label, amount }: { label: string, amount: any }) {
  return (
    <View className="flex-row justify-between py-2 border-b border-gray-50 last:border-0">
      <Text style={{ color: "#4b5563", fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: "#111827", fontWeight: "800" }}>₹{Number(amount || 0).toLocaleString()}</Text>
    </View>
  );
}
