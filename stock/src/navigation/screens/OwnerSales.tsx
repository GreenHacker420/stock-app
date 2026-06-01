import { useMemo, useState } from "react";
import { Pressable, ScrollView, View, StyleSheet } from "react-native";
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
import { colors, spacing, radius, fontSize, fontWeight } from "../../theme";

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
      <View style={styles.statsRow}>
        <View style={styles.statCard}><Text>Sales</Text><Text variant="headlineSmall" style={styles.statValue}>{rows.length}</Text></View>
        <View style={styles.statCard}><Text>Total</Text><Text variant="headlineSmall" style={styles.statValue}>{money(total)}</Text></View>
      </View>
      <Searchbar value={search} onChangeText={setSearch} placeholder="Search sale number or customer" style={styles.searchBar} />
      <SegmentedButtons value={filter} onValueChange={setFilter} buttons={[{ value: "ALL", label: "All" }, { value: "WALKIN", label: "Walk-in" }, { value: "REGULAR", label: "Regular" }, { value: "CREDIT", label: "Credit" }]} />
      <Text style={styles.outstandingText}>Outstanding in filter: <Text style={styles.boldText}>{money(balance)}</Text></Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.listGap}>
          {rows.map((sale) => (
            <Pressable key={sale.id} onPress={() => (navigation as any).navigate("SaleDetail", { saleId: sale.id })}>
              <View style={styles.saleCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.flex1}>
                    <Text variant="titleMedium" style={styles.boldText}>{sale.saleNumber}</Text>
                    <Text style={styles.secondaryText}>{sale.isWalkin ? "Walk-in customer" : sale.customer?.name ?? "Regular sale"}</Text>
                  </View>
                  <StatusPill label={sale.paymentStatus ?? (Number(sale.balanceAmount) > 0 ? "PENDING" : "PAID")} tone={Number(sale.balanceAmount) > 0 ? "amber" : "green"} />
                </View>
                <View style={styles.cardFooter}>
                  <Text>Total {money(sale.totalAmount)}</Text>
                  <Text>Paid {money(sale.paidAmount)}</Text>
                  <Text>Balance {money(sale.balanceAmount)}</Text>
                </View>
              </View>
            </Pressable>
          ))}
          {!salesQuery.isLoading && rows.length === 0 ? <Text style={styles.emptyText}>No sales found.</Text> : null}
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
      {!saleId ? <Text style={styles.errorText}>Missing sale id.</Text> : null}
      {sale ? (
        <>
          <View style={styles.saleCard}>
            <View style={styles.cardHeader}>
              <Text variant="titleMedium" style={styles.boldText}>{sale.isWalkin ? "Walk-in Customer" : sale.customer?.name ?? "Customer not linked"}</Text>
              <StatusPill label={sale.saleStatus ?? "SALE"} tone="blue" />
            </View>
            <Divider style={styles.divider} />
            <Text>Total: {money(sale.totalAmount)}</Text>
            <Text>Paid: {money(sale.paidAmount)}</Text>
            <Text>Balance: {money(sale.balanceAmount)}</Text>
            <Text>Created: {new Date(sale.createdAt).toLocaleString()}</Text>
          </View>
          <Section title="Items">
            <View style={styles.listContainer}>
              {(sale.items ?? []).map((row, index) => (
                <View key={row.id} style={styles.itemPadding}>
                  {index > 0 ? <Divider style={styles.itemDivider} /> : null}
                  <Text style={styles.boldText}>{row.item.name}</Text>
                  <Text style={styles.secondaryText}>Qty {row.quantity} • Rate {money(row.rate)} • Total {money(row.totalAmount)}</Text>
                </View>
              ))}
            </View>
          </Section>
          <Section title="Payments">
            <View style={styles.listContainer}>
              {(sale.payments ?? []).map((payment, index) => (
                <View key={payment.id} style={styles.itemPadding}>
                  {index > 0 ? <Divider style={styles.itemDivider} /> : null}
                  <Text style={styles.boldText}>{payment.paymentMode} • {money(payment.amount)}</Text>
                  <Text style={styles.secondaryText}>{payment.verificationStatus} • {payment.referenceNumber ?? "No reference"}</Text>
                </View>
              ))}
            </View>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  statValue: {
    fontWeight: fontWeight.black,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  outstandingText: {
    color: colors.textSecondary,
  },
  boldText: {
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  listGap: {
    gap: spacing.md,
  },
  saleCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  secondaryText: {
    color: colors.textSecondary,
  },
  cardFooter: {
    marginTop: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  emptyText: {
    textAlign: "center",
    color: colors.textSecondary,
    padding: spacing.xxl,
  },
  errorText: {
    color: colors.danger,
  },
  divider: {
    marginVertical: spacing.md,
  },
  listContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  itemPadding: {
    padding: spacing.lg,
  },
  itemDivider: {
    marginBottom: spacing.md,
  },
});
