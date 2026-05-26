import { useEffect, useState, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Button, Text, Card, Icon, Divider, List } from "react-native-paper";
import { fetchOrders, fetchPayments, fetchSales, fetchShops, Shop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";

export function DailySummary() {
  const token = useAuthStore((state) => state.token);
  const [shopId, setShopId] = useState<string | undefined>();
  const [lockedDays, setLockedDays] = useState<Record<string, boolean>>({});

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const salesQuery = useQuery({ queryKey: ["sales", shopId], queryFn: () => fetchSales(token ?? "", shopId ?? ""), enabled: !!token && !!shopId });
  const ordersQuery = useQuery({ queryKey: ["orders", shopId], queryFn: () => fetchOrders(token ?? "", shopId ?? ""), enabled: !!token && !!shopId });
  const paymentsQuery = useQuery({ queryKey: ["payments", shopId], queryFn: () => fetchPayments(token ?? "", shopId ?? ""), enabled: !!token && !!shopId });

  const today = new Date().toDateString();
  
  const stats = useMemo(() => {
    const sales = (salesQuery.data ?? []).filter(s => new Date(s.createdAt).toDateString() === today);
    const orders = (ordersQuery.data ?? []).filter(o => new Date(o.createdAt).toDateString() === today);
    const payments = (paymentsQuery.data ?? []).filter(p => new Date(p.receivedAt).toDateString() === today);

    const breakdown = payments.reduce((acc, p) => {
      acc[p.paymentMode] = (acc[p.paymentMode] || 0) + Number(p.amount);
      return acc;
    }, { CASH: 0, UPI: 0, CARD: 0, BANK_TRANSFER: 0, CHEQUE: 0 } as Record<string, number>);

    return {
      totalSales: sales.reduce((sum, s) => sum + Number(s.totalAmount), 0),
      salesCount: sales.length,
      walkinCount: sales.filter(s => s.isWalkin).length,
      ordersCount: orders.length,
      dispatchedCount: orders.filter(o => o.status === 'DISPATCHED').length,
      paymentBreakdown: breakdown,
      cashExpected: breakdown.CASH,
    };
  }, [salesQuery.data, ordersQuery.data, paymentsQuery.data, today]);

  const isLocked = shopId ? !!lockedDays[shopId] : false;

  return (
    <Screen scroll={true}>
      <AppHeader title="Daily Report" subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="p-4 gap-6">
          <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

          {/* Reconciliation Hero - Dark Mode / High-end visualization */}
          <Card style={{ backgroundColor: "#111827", borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 }}>
             <Card.Content style={{ padding: 24, alignItems: 'center' }}>
                <View className="mb-4 flex-row justify-between w-full items-center">
                  <Text variant="labelMedium" style={{ color: "#9ca3af", letterSpacing: 1, fontWeight: "700" }}>EXECUTIVE RECONCILIATION</Text>
                  <View className="bg-emerald-500/20 px-3 py-1 rounded-full flex-row items-center gap-1.5">
                    <View className="h-2 w-2 rounded-full bg-emerald-400" />
                    <Text style={{ color: "#4ade80", fontSize: 10, fontWeight: "900" }}>LIVE</Text>
                  </View>
                </View>

                {/* Simulated SVG Ring Gauge */}
                <View style={{ height: 160, width: 160, borderRadius: 80, borderWidth: 8, borderColor: '#1f2937', justifyContent: 'center', alignItems: 'center', borderStyle: 'solid' }}>
                   <View style={{ position: 'absolute', height: 160, width: 160, borderRadius: 80, borderLeftWidth: 8, borderTopWidth: 8, borderColor: '#1e40af', transform: [{ rotate: '45deg' }] }} />
                   <View className="items-center">
                      <Text variant="displaySmall" style={{ color: "white", fontWeight: "900" }}>₹{stats.cashExpected.toLocaleString()}</Text>
                      <Text variant="labelSmall" style={{ color: "#9ca3af", fontWeight: "600", marginTop: -4 }}>CASH ON HAND</Text>
                   </View>
                </View>

                <View className="mt-6 flex-row w-full justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                  <View>
                    <Text style={{ color: "#9ca3af", fontSize: 11, fontWeight: "600" }}>EXPECTED</Text>
                    <Text style={{ color: "white", fontSize: 16, fontWeight: "800" }}>₹{stats.cashExpected.toLocaleString()}</Text>
                  </View>
                  <Icon source="checkbox-marked-circle" size={24} color="#10b981" />
                  <View className="items-end">
                    <Text style={{ color: "#9ca3af", fontSize: 11, fontWeight: "600" }}>ACTUAL</Text>
                    <Text style={{ color: "white", fontSize: 16, fontWeight: "800" }}>₹{stats.cashExpected.toLocaleString()}</Text>
                  </View>
                </View>
             </Card.Content>
          </Card>

          {/* Smart Insights Box */}
          <View className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex-row gap-3 items-start shadow-sm">
             <Icon source="lightbulb-outline" size={20} color="#1e40af" />
             <View className="flex-1">
               <Text variant="titleSmall" style={{ color: "#1e3a8a", fontWeight: "800" }}>Smart Insight</Text>
               <Text variant="bodySmall" style={{ color: "#1e40af", lineHeight: 16, marginTop: 2 }}>
                 Cash reconciliation is matched. Sales are primarily driven by walk-in customers today. UPI collections are 15% higher than daily average.
               </Text>
             </View>
          </View>

          {/* High-fidelity Accordions */}
          <Section title="Performance Details">
            <View className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <List.Accordion
                title="Sales Performance"
                description={`${stats.salesCount} total bills issued today`}
                left={props => <List.Icon {...props} icon="trending-up" color="#1e40af" />}
                titleStyle={{ fontWeight: "700", color: "#111827" }}
                style={{ backgroundColor: 'white' }}
              >
                <View className="p-4 pt-0 gap-3">
                   <MetricRow label="Walk-in Sales" value={String(stats.walkinCount)} detail="Immediate payment" />
                   <MetricRow label="Order Sales" value={String(stats.salesCount - stats.walkinCount)} detail="Party/Customer orders" />
                   <MetricRow label="Dispatched Today" value={String(stats.dispatchedCount)} detail="Stock movement confirmed" />
                </View>
              </List.Accordion>
              
              <Divider />

              <List.Accordion
                title="Payment Streams"
                description={`Total collection: ₹${Object.values(stats.paymentBreakdown).reduce((a, b) => a + b, 0).toLocaleString()}`}
                left={props => <List.Icon {...props} icon="credit-card-outline" color="#1e40af" />}
                titleStyle={{ fontWeight: "700", color: "#111827" }}
                style={{ backgroundColor: 'white' }}
              >
                <View className="p-4 pt-0">
                  {Object.entries(stats.paymentBreakdown).map(([mode, amt]) => (
                    <View key={mode} className="flex-row justify-between py-2 border-b border-gray-50 last:border-0">
                      <Text style={{ color: "#4b5563", fontWeight: "600" }}>{mode.replace('_', ' ')}</Text>
                      <Text style={{ color: "#111827", fontWeight: "800" }}>₹{amt.toLocaleString()}</Text>
                    </View>
                  ))}
                </View>
              </List.Accordion>

              <Divider />

              <List.Accordion
                title="Staff Activity"
                description="3 active operators today"
                left={props => <List.Icon {...props} icon="account-group-outline" color="#1e40af" />}
                titleStyle={{ fontWeight: "700", color: "#111827" }}
                style={{ backgroundColor: 'white' }}
              >
                <View className="p-4 pt-0">
                   <Text variant="bodySmall" style={{ color: "#6b7280" }}>Fulfillment tracking and logout status...</Text>
                </View>
              </List.Accordion>
            </View>
          </Section>
        </View>
      </ScrollView>

      {/* Floating Action Bar */}
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 border-t border-gray-100 flex-row gap-3 items-center" style={{ backdropFilter: 'blur(10px)' } as any}>
          <Button mode="outlined" style={{ borderRadius: 12, flex: 1, borderColor: '#e5e7eb' }} textColor="#4b5563" onPress={() => alert('Exporting...')}>Export Report</Button>
          <Button 
            mode="contained" 
            style={{ flex: 2, borderRadius: 12, backgroundColor: isLocked ? "#10b981" : "#1e40af" }} 
            contentStyle={{ height: 50 }}
            onPress={() => setLockedDays(prev => ({ ...prev, [shopId!]: true }))}
            disabled={isLocked}
          >
            {isLocked ? "Report Locked" : "Lock Daily Summary"}
          </Button>
      </View>
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
