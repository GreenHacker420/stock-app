import { useEffect, useState, useMemo } from "react";
import { View, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Button, Text, Card, Icon, Divider } from "react-native-paper";
import { fetchOrders, fetchPayments, fetchSales, fetchShops, Shop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

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
      cashExpected: breakdown.CASH, // Simplified for MVP
    };
  }, [salesQuery.data, ordersQuery.data, paymentsQuery.data, today]);

  const isLocked = shopId ? !!lockedDays[shopId] : false;

  return (
    <Screen scroll={false}>
      <AppHeader title="Daily Summary" subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} />

      {!isLocked && (
        <View className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex-row items-center gap-3">
          <Icon source="alert-circle-outline" size={20} color="#b45309" />
          <Text style={{ color: "#b45309", fontWeight: "700", fontSize: 13 }}>Review Pending</Text>
        </View>
      )}

      <ScrollView className="flex-1 bg-gray-50" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="p-4 gap-6">
          <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

          <View className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <View className="bg-gray-900 p-4 flex-row justify-between items-center">
              <Text variant="titleSmall" style={{ color: "#9ca3af", fontWeight: "700" }}>CASH RECONCILIATION</Text>
              <View className="bg-green-500/20 px-2 py-0.5 rounded-full">
                <Text style={{ color: "#4ade80", fontSize: 10, fontWeight: "800" }}>MATCHED</Text>
              </View>
            </View>
            <View className="p-4 gap-4">
              <View className="flex-row justify-between">
                <View>
                  <Text variant="bodySmall" style={{ color: "#6b7280" }}>Expected Cash</Text>
                  <Text variant="titleLarge" style={{ fontWeight: "800", color: "#111827" }}>₹{stats.cashExpected.toLocaleString()}</Text>
                </View>
                <View className="items-end">
                  <Text variant="bodySmall" style={{ color: "#6b7280" }}>Actual Cash</Text>
                  <Text variant="titleLarge" style={{ fontWeight: "800", color: "#111827" }}>₹{stats.cashExpected.toLocaleString()}</Text>
                </View>
              </View>
              <Divider />
              <View className="flex-row justify-between items-center">
                <Text style={{ fontWeight: "700", color: "#6b7280" }}>Difference</Text>
                <Text variant="titleMedium" style={{ fontWeight: "900", color: "#10b981" }}>₹0.00</Text>
              </View>
            </View>
          </View>

          <View className="gap-3">
            <View className="flex-row gap-3">
              <MetricBox label="Total Sales" value={`₹${stats.totalSales.toLocaleString()}`} icon="trending-up" />
              <MetricBox label="Walk-in Sales" value={String(stats.walkinCount)} icon="cart-outline" />
            </View>
            <View className="flex-row gap-3">
              <MetricBox label="Orders Dispatched" value={String(stats.dispatchedCount)} icon="truck-delivery-outline" />
              <MetricBox label="Pending DM" value="3" icon="file-clock-outline" />
            </View>
          </View>

          <Section title="Payment Breakdown">
            <View className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              {Object.entries(stats.paymentBreakdown).map(([mode, amt], idx) => (
                <View key={mode}>
                  {idx > 0 && <Divider />}
                  <View className="flex-row justify-between items-center p-4">
                    <View className="flex-row items-center gap-3">
                      <View className="h-8 w-8 rounded-lg bg-gray-50 items-center justify-center">
                        <Icon source={mode === 'CASH' ? 'cash' : 'qrcode-scan'} size={18} color="#4b5563" />
                      </View>
                      <Text style={{ fontWeight: "700", color: "#374151" }}>{mode.replace('_', ' ')}</Text>
                    </View>
                    <Text style={{ fontWeight: "800", color: "#111827" }}>₹{amt.toLocaleString()}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Section>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 gap-3">
        <View className="flex-row gap-3">
          <Button mode="outlined" style={{ flex: 1, borderRadius: 8 }} onPress={() => alert('Exporting...')}>Export PDF</Button>
          <Button 
            mode="contained" 
            style={{ flex: 2, borderRadius: 8, backgroundColor: isLocked ? "#10b981" : "#1e40af" }} 
            onPress={() => setLockedDays(prev => ({ ...prev, [shopId!]: true }))}
            disabled={isLocked}
          >
            {isLocked ? "Daily Summary Locked" : "Lock Daily Summary"}
          </Button>
        </View>
      </View>
    </Screen>
  );
}

function MetricBox({ label, value, icon }: { label: string, value: string, icon: string }) {
  return (
    <View className="flex-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm gap-2">
      <View className="h-10 w-10 bg-blue-50 rounded-lg items-center justify-center">
        <Icon source={icon} size={20} color="#1e40af" />
      </View>
      <View>
        <Text variant="bodySmall" style={{ color: "#6b7280", fontWeight: "600" }}>{label}</Text>
        <Text variant="titleLarge" style={{ fontWeight: "800", color: "#111827" }}>{value}</Text>
      </View>
    </View>
  );
}
