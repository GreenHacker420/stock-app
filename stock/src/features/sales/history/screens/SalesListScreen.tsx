import { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRoute, useNavigation, type RouteProp, type NavigationProp } from "@react-navigation/native";
import { useDebounce } from "use-debounce";
import { useSalesQuery } from "@/hooks/useSales";
import { type Sale } from "@/api/client";
import { ListScreen } from "@/components/layout/ListScreen";
import { AppSearchBar } from "@/components/ui/AppSearchBar";
import { AppSegmentedControl } from "@/components/ui/AppSegmentedControl";
import { SaleCard } from "@/components/domain/sales/SaleCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { spacing } from "@/theme";
import { navigate } from "@/navigation/navigation-ref";
import { type RootStackParamList } from "@/navigation";

type HistorySale = Sale & {
  staff?: { name: string } | null;
};

type SalesListRoute = RouteProp<RootStackParamList, "SalesList">;
type SalesListNavigation = NavigationProp<RootStackParamList, "SalesList">;

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function SalesListScreen() {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const route = useRoute<SalesListRoute>();
  const navigation = useNavigation<SalesListNavigation>();
  const initialFilter = route.params?.filter || "ALL";
  const [activeTab, setActiveTab] = useState<string>(initialFilter);

  const salesQuery = useSalesQuery();
  const allSales = (salesQuery.data as HistorySale[]) ?? [];

  const filteredSales = useMemo(() => {
    let data = allSales;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      data = data.filter((s: HistorySale) =>
        s.saleNumber.toLowerCase().includes(q) ||
        (s.customer?.name || "").toLowerCase().includes(q)
      );
    }
    if (activeTab === "ALL") return data;
    if (activeTab === "gst_pending") return data.filter((s: HistorySale) => (s.isGstRequired || s.gstRequired) && !s.gstInvoiceNumber);
    if (activeTab === "PENDING") {
      return data.filter((s: HistorySale) => s.paymentStatus !== "PAID");
    }
    return data.filter((s: HistorySale) => s.paymentStatus === activeTab);
  }, [allSales, activeTab, debouncedSearch]);

  return (
    <ListScreen<HistorySale>
      title="Sales History"
      subtitle="Monitor revenue and collections"
      isLoading={salesQuery.isLoading}
      data={filteredSales}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
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
      header={
        <View style={styles.headerFilters}>
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
        </View>
      }
      empty={<EmptyState icon="receipt" title="No sales found" />}
    />
  );
}

const styles = StyleSheet.create({
  headerFilters: {
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  searchBar: {
    marginHorizontal: 0,
  },
  searchInput: {
    fontSize: 14,
  },
  tabs: {
    marginHorizontal: 0,
  },
});
