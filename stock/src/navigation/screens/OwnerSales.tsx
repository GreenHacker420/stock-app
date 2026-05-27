import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Divider, Searchbar, SegmentedButtons, Text } from "react-native-paper";
import { fetchSale, fetchSales } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function SalesList() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const salesQuery = useQuery({
    queryKey: ["sales", activeShopId],
    queryFn: () => fetchSales(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const rows = useMemo(() => {
    return (salesQuery.data ?? []).filter((sale) => {
      const text = `${sale.saleNumber} ${sale.customer?.name ?? "walk-in"} ${sale.paymentStatus ?? ""}`.toLowerCase();
      const matches = text.includes(search.toLowerCase());
      if (filter === "WALKIN") return matches && sale.isWalkin;
      if (filter === "REGULAR") return matches && !sale.isWalkin;
      if (filter === "CREDIT") return matches && Number(sale.balanceAmount) > 0;
      return matches;
    });
  }, [filter, salesQuery.data, search]);

  const total = rows.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
  const balance = rows.reduce((sum, sale) => sum + Number(sale.balanceAmount), 0);

  return (
    <Screen scroll={false}>
      <AppHeader title="Sales Management" subtitle="All walk-in, regular, paid, and pending sales." />
      <View className="flex-row gap-3">
        <View className="flex-1 rounded-lg border border-[#e5e7eb] bg-white p-4"><Text>Sales</Text><Text variant="headlineSmall" style={{ fontWeight: "900" }}>{rows.length}</Text></View>
        <View className="flex-1 rounded-lg border border-[#e5e7eb] bg-white p-4"><Text>Total</Text><Text variant="headlineSmall" style={{ fontWeight: "900" }}>{money(total)}</Text></View>
      </View>
      <Searchbar value={search} onChangeText={setSearch} placeholder="Search sale number or customer" style={{ backgroundColor: "white", borderRadius: 10 }} />
      <SegmentedButtons value={filter} onValueChange={setFilter} buttons={[{ value: "ALL", label: "All" }, { value: "WALKIN", label: "Walk-in" }, { value: "REGULAR", label: "Regular" }, { value: "CREDIT", label: "Credit" }]} />
      <Text style={{ color: "#64748b" }}>Outstanding in filter: <Text style={{ fontWeight: "900", color: "#111827" }}>{money(balance)}</Text></Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="gap-3">
          {rows.map((sale) => (
            <Pressable key={sale.id} onPress={() => (navigation as any).navigate("SaleDetail", { saleId: sale.id })}>
              <View className="rounded-lg border border-[#e5e7eb] bg-white p-4">
                <View className="flex-row justify-between gap-3">
                  <View className="flex-1">
                    <Text variant="titleMedium" style={{ fontWeight: "900" }}>{sale.saleNumber}</Text>
                    <Text style={{ color: "#64748b" }}>{sale.isWalkin ? "Walk-in customer" : sale.customer?.name ?? "Regular sale"}</Text>
                  </View>
                  <StatusPill label={sale.paymentStatus ?? (Number(sale.balanceAmount) > 0 ? "PENDING" : "PAID")} tone={Number(sale.balanceAmount) > 0 ? "amber" : "green"} />
                </View>
                <View className="mt-3 flex-row justify-between">
                  <Text>Total {money(sale.totalAmount)}</Text>
                  <Text>Paid {money(sale.paidAmount)}</Text>
                  <Text>Balance {money(sale.balanceAmount)}</Text>
                </View>
              </View>
            </Pressable>
          ))}
          {!salesQuery.isLoading && rows.length === 0 ? <Text style={{ textAlign: "center", color: "#64748b", padding: 24 }}>No sales found.</Text> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function SaleDetail() {
  const token = useAuthStore((state) => state.token);
  const saleId = (useRoute().params as { saleId?: string } | undefined)?.saleId;
  const saleQuery = useQuery({ queryKey: ["sale", saleId], queryFn: () => fetchSale(token ?? "", saleId ?? ""), enabled: !!token && !!saleId });
  const sale = saleQuery.data;

  return (
    <Screen>
      <AppHeader title={sale?.saleNumber ?? "Sale Detail"} subtitle="Items, payments, customer, and status." />
      {!saleId ? <Text style={{ color: "#991b1b" }}>Missing sale id.</Text> : null}
      {sale ? (
        <>
          <View className="rounded-lg border border-[#e5e7eb] bg-white p-4">
            <View className="flex-row justify-between">
              <Text variant="titleMedium" style={{ fontWeight: "900" }}>{sale.isWalkin ? "Walk-in Customer" : sale.customer?.name ?? "Customer not linked"}</Text>
              <StatusPill label={sale.saleStatus ?? "SALE"} tone="blue" />
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <Text>Total: {money(sale.totalAmount)}</Text>
            <Text>Paid: {money(sale.paidAmount)}</Text>
            <Text>Balance: {money(sale.balanceAmount)}</Text>
            <Text>Created: {new Date(sale.createdAt).toLocaleString()}</Text>
          </View>
          <Section title="Items">
            <View className="rounded-lg border border-[#e5e7eb] bg-white">
              {(sale.items ?? []).map((row, index) => (
                <View key={row.id} className="p-4">
                  {index > 0 ? <Divider style={{ marginBottom: 12 }} /> : null}
                  <Text style={{ fontWeight: "900" }}>{row.item.name}</Text>
                  <Text style={{ color: "#64748b" }}>Qty {row.quantity} • Rate {money(row.rate)} • Total {money(row.totalAmount)}</Text>
                </View>
              ))}
            </View>
          </Section>
          <Section title="Payments">
            <View className="rounded-lg border border-[#e5e7eb] bg-white">
              {(sale.payments ?? []).map((payment, index) => (
                <View key={payment.id} className="p-4">
                  {index > 0 ? <Divider style={{ marginBottom: 12 }} /> : null}
                  <Text style={{ fontWeight: "900" }}>{payment.paymentMode} • {money(payment.amount)}</Text>
                  <Text style={{ color: "#64748b" }}>{payment.verificationStatus} • {payment.referenceNumber ?? "No reference"}</Text>
                </View>
              ))}
            </View>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
