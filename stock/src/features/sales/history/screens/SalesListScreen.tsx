import React, { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { useDebounce } from "use-debounce";
import { FlashList } from "@shopify/flash-list";
import { useSalesQuery } from "@/hooks/useSales";
import { type Sale } from "@/api/client";
import { Screen } from "@/components/Screen";
import { AppHeader } from "@/components/ui/AppHeader";
import { AppSearchBar } from "@/components/ui/AppSearchBar";
import { AppSegmentedControl } from "@/components/ui/AppSegmentedControl";
import { SaleCard } from "@/components/domain/sales/SaleCard";
import { SkeletonList } from "@/components/ui/SkeletonCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { colors, spacing } from "@/theme";
import { navigate } from "@/navigation/navigation-ref";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function SalesListScreen() {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const route = useRoute<any>();
  const initialFilter = route.params?.filter || "ALL"; // ALL, PAID, PENDING, PARTIAL
  const [activeTab, setActiveTab] = useState(initialFilter);

  const salesQuery = useSalesQuery();
  const allSales = salesQuery.data ?? [];

  const filteredSales = useMemo(() => {
    let data = allSales;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      data = data.filter((s: any) =>
        s.saleNumber.toLowerCase().includes(q) ||
        (s.customer?.name || "").toLowerCase().includes(q)
      );
    }
    if (activeTab === "ALL") return data;
    if (activeTab === "gst_pending") return data.filter((s: any) => (s.isGstRequired || s.gstRequired) && !s.gstInvoiceNumber);
    if (activeTab === "PENDING") {
      return data.filter((s: any) => s.paymentStatus !== "PAID");
    }
    return data.filter((s: any) => s.paymentStatus === activeTab);
  }, [allSales, activeTab, debouncedSearch]);

  const List = FlashList as any;

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <AppHeader title="Sales History" subtitle="Monitor revenue and collections" />

      <View style={styles.container}>
        <AppSearchBar
          placeholder="Search invoice or customer"
          onChangeText={setSearch}
          value={search}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />

        <AppSegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "ALL", label: "All" },
            { value: "PAID", label: "Paid" },
            { value: "PENDING", label: "Due" },
            { value: "gst_pending", label: "GST" },
          ]}
          style={styles.tabs}
        />

        <View style={styles.listWrapper}>
          {salesQuery.isLoading ? (
            <SkeletonList count={6} itemHeight={100} />
          ) : (
            <List
              data={filteredSales}
              keyExtractor={(item: Sale) => item.id}
              renderItem={({ item }: { item: Sale & { staff?: { name: string } | null } }) => (
                <SaleCard
                  saleNumber={item.saleNumber}
                  customerName={item.isWalkin ? "Walk-in Customer" : item.customer?.name}
                  subtitle={`Billed by: ${item.staff?.name || "System"}`}
                  amount={money(item.totalAmount)}
                  paymentStatus={item.paymentStatus || "PENDING"}
                  statusTone={item.paymentStatus === "PAID" ? "green" : "amber"}
                  date={new Date(item.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  onPress={() => navigate("SaleDetail", { id: item.id })}
                />
              )}
              ListEmptyComponent={<EmptyState icon="receipt" title="No sales found" />}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: {
    fontSize: 14,
  },
  tabs: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
