import React, { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { useOrdersQuery } from "../../hooks/useOrders";
import { type Order } from "../../api/client";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { AppSearchBar } from "../../components/ui/AppSearchBar";
import { AppSegmentedControl } from "../../components/ui/AppSegmentedControl";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { OrderCard } from "../../components/domain/orders/OrderCard";
import { spacing } from "../../theme";
import { useShopStore } from "../../auth/shop-store";
import { navigate } from "../navigation-ref";

export function OrderList() {
  const { activeShopId } = useShopStore();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [activeTab, setActiveTab] = useState<"ALL" | "DRAFT" | "CONFIRMED" | "PACKING" | "PACKED" | "DISPATCHED" | "CANCELLED">("ALL");

  const ordersQuery = useOrdersQuery({ search: debouncedSearch });
  const allOrders = ordersQuery.data ?? [];

  const filteredOrders = useMemo(() => {
    if (activeTab === "ALL") return allOrders;
    return allOrders.filter(o => o.status === activeTab);
  }, [allOrders, activeTab]);
  const List = FlashList as any;

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <AppHeader title="Orders" subtitle="Track and fulfill customer bookings" />

      <View style={styles.container}>
        <AppSearchBar
          placeholder="Search by order # or customer"
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
            { value: "CONFIRMED", label: "Confirm" },
            { value: "PACKING", label: "Pack" },
            { value: "PACKED", label: "Packed" },
            { value: "DISPATCHED", label: "Sent" },
          ]}
          style={styles.tabs}
        />

        <View style={styles.listWrapper}>
          {ordersQuery.isLoading ? (
            <SkeletonList count={6} itemHeight={100} />
          ) : (
            <List
              data={filteredOrders}
              keyExtractor={(item: Order) => item.id}
              estimatedItemSize={110}
              renderItem={({ item }: { item: Order }) => (
                <OrderCard
                  orderNumber={item.orderNumber}
                  customerName={item.customer?.name}
                  status={item.status}
                  statusTone={item.status === "PACKED" || item.status === "DISPATCHED" ? "green" : item.status === "CANCELLED" ? "red" : "blue"}
                  leftLabel="TOTAL VALUE"
                  leftValue={`₹${Number(item.totalAmount).toLocaleString()}`}
                  rightLabel="BOOKED ON"
                  rightValue={new Date(item.createdAt).toLocaleDateString()}
                  onPress={() => navigate("OrderDetail", { orderId: item.id })}
                />
              )}
              ListEmptyComponent={<EmptyState icon="package-variant" title="No orders found" />}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  searchBar: { height: 44, marginBottom: spacing.md },
  searchInput: { fontSize: 14 },
  tabs: { marginBottom: spacing.lg },
  listWrapper: { flex: 1 },
  listContent: { paddingBottom: 100 },
});
