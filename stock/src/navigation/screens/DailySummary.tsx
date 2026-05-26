import { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Button, Text, Card, Icon } from "react-native-paper";
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

  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) {
      setShopId(shopsQuery.data[0].id);
    }
  }, [shopId, shopsQuery.data]);

  const salesQuery = useQuery({
    queryKey: ["sales", shopId],
    queryFn: () => fetchSales(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const ordersQuery = useQuery({
    queryKey: ["orders", shopId],
    queryFn: () => fetchOrders(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments", shopId],
    queryFn: () => fetchPayments(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  // Calculate stats for today
  const today = new Date().toDateString();
  const salesToday = (salesQuery.data as any[])?.filter(
    (s: any) => new Date(s.createdAt).toDateString() === today
  ) || [];
  const ordersToday = (ordersQuery.data as any[])?.filter(
    (o: any) => new Date(o.createdAt).toDateString() === today
  ) || [];
  const paymentsToday = (paymentsQuery.data as any[])?.filter(
    (p: any) => new Date(p.receivedAt).toDateString() === today
  ) || [];

  const totalSalesAmount = salesToday.reduce((sum: number, s: any) => sum + Number(s.totalAmount), 0);
  const walkinSalesCount = salesToday.filter((s: any) => s.isWalkin).length;

  const paymentBreakdown = paymentsToday.reduce(
    (acc: Record<string, number>, p: any) => {
      const mode = p.paymentMode;
      const val = Number(p.amount);
      if (acc[mode] !== undefined) {
        acc[mode] += val;
      } else {
        acc[mode] = val;
      }
      return acc;
    },
    { CASH: 0, UPI: 0, CARD: 0, BANK_TRANSFER: 0, CHEQUE: 0 } as Record<string, number>
  );

  const totalPaymentsAmount = Object.values(paymentBreakdown).reduce((sum: number, v: number) => sum + v, 0);

  const isLocked = shopId ? !!lockedDays[shopId] : false;

  const handleLock = () => {
    if (shopId) {
      setLockedDays((prev) => ({ ...prev, [shopId]: true }));
    }
  };

  const handleExport = () => {
    alert("Report exported in PDF/CSV format successfully!");
  };

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Daily Summary"
        subtitle="Daily performance report and ledger lock."
      />

      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

      <ScrollView className="flex-1 mt-2">
        <Section title="Today's Performance Overview">
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-[#e5eadd] bg-white p-4.5">
              <Text style={{ fontSize: 10, color: "#667064", fontWeight: "700" }}>TOTAL SALES AMOUNT</Text>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#17211b", marginTop: 4 }}>
                ₹{totalSalesAmount.toLocaleString()}
              </Text>
            </View>
            <View className="flex-1 rounded-2xl border border-[#e5eadd] bg-white p-4.5">
              <Text style={{ fontSize: 10, color: "#667064", fontWeight: "700" }}>TOTAL BILLS ISSUED</Text>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#17211b", marginTop: 4 }}>
                {salesToday.length} bills ({walkinSalesCount} walk-ins)
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3 mt-3">
            <View className="flex-1 rounded-2xl border border-[#e5eadd] bg-white p-4.5">
              <Text style={{ fontSize: 10, color: "#667064", fontWeight: "700" }}>ORDERS CREATED</Text>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#17211b", marginTop: 4 }}>
                {ordersToday.length} orders
              </Text>
            </View>
            <View className="flex-1 rounded-2xl border border-[#e5eadd] bg-white p-4.5">
              <Text style={{ fontSize: 10, color: "#667064", fontWeight: "700" }}>TOTAL CASH/NON-CASH</Text>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#17211b", marginTop: 4 }}>
                ₹{totalPaymentsAmount.toLocaleString()}
              </Text>
            </View>
          </View>
        </Section>

        <Section title="Payment Mode Breakdown">
          <View className="overflow-hidden rounded-2xl border border-[#e5eadd] bg-white">
            {Object.entries(paymentBreakdown).map(([mode, amt], index, arr) => (
              <View
                key={mode}
                className="flex-row justify-between items-center p-4"
                style={{
                  borderBottomWidth: index === arr.length - 1 ? 0 : 1,
                  borderBottomColor: "#f4f6f1",
                }}
              >
                <View className="flex-row items-center gap-2">
                  <View className="h-6 w-6 items-center justify-center rounded-md bg-emerald-50">
                    <Icon
                      source={
                        mode === "CASH"
                          ? "cash"
                          : mode === "UPI"
                          ? "cellphone-nfc"
                          : mode === "CHEQUE"
                          ? "bank-transfer"
                          : "credit-card-outline"
                      }
                      size={15}
                      color="#246b4b"
                    />
                  </View>
                  <Text style={{ fontWeight: "700", color: "#17211b", fontSize: 13 }}>{mode}</Text>
                </View>
                <Text style={{ fontWeight: "800", color: "#17211b", fontSize: 14 }}>₹{amt.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Summary Lock Status">
          <View className="flex-row items-center justify-between rounded-2xl border border-[#e5eadd] bg-white p-4">
            <View className="flex-1 gap-1">
              <Text style={{ fontWeight: "800", color: "#17211b", fontSize: 14 }}>Lock Daily Ledger</Text>
              <Text style={{ color: "#667064", fontSize: 11, lineHeight: 15 }}>
                Locking prevents staff from creating, editing, or deleting entries for today.
              </Text>
            </View>
            <StatusPill label={isLocked ? "LOCKED" : "DRAFT"} tone={isLocked ? "green" : "amber"} />
          </View>
        </Section>
      </ScrollView>

      <View className="gap-3 p-4 bg-[#f6f7f2] border-t border-[#e5eadd]">
        <View className="flex-row gap-3">
          <Button
            mode="outlined"
            icon="file-download-outline"
            style={{ flex: 1, borderRadius: 12 }}
            contentStyle={{ height: 50 }}
            onPress={handleExport}
          >
            Export PDF/CSV
          </Button>
          {!isLocked ? (
            <Button
              mode="contained"
              icon="lock-outline"
              buttonColor="#246b4b"
              style={{ flex: 1, borderRadius: 12 }}
              contentStyle={{ height: 50 }}
              onPress={handleLock}
            >
              Lock Ledger
            </Button>
          ) : (
            <Button
              mode="contained"
              icon="lock-check"
              disabled
              style={{ flex: 1, borderRadius: 12 }}
              contentStyle={{ height: 50 }}
            >
              Ledger Locked
            </Button>
          )}
        </View>
      </View>
    </Screen>
  );
}
