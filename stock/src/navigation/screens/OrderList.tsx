import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Divider, Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { useOrdersQuery } from "../../hooks/useOrders";
import { type Order } from "../../api/client";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { AppSearchBar } from "../../components/ui/AppSearchBar";
import { AppSegmentedControl } from "../../components/ui/AppSegmentedControl";
import { StatusPill } from "../../components/ui/StatusPill";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
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
                <Pressable
                  onPress={() => navigate("OrderDetail", { orderId: item.id })}
                  style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
                      <Text style={styles.customerName}>{item.customer?.name}</Text>
                    </View>
                    <StatusPill 
                      label={item.status} 
                      tone={item.status === 'PACKED' || item.status === 'DISPATCHED' ? 'green' : item.status === 'CANCELLED' ? 'red' : 'blue'} 
                    />
                  </View>
                  <Divider style={styles.divider} />
                  <View style={styles.cardFooter}>
                    <View>
                      <Text style={styles.footerLabel}>TOTAL VALUE</Text>
                      <Text style={styles.footerValue}>₹{Number(item.totalAmount).toLocaleString()}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.footerLabel}>BOOKED ON</Text>
                      <Text style={styles.footerValue}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    </View>
                  </View>
                </Pressable>
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
  orderCard: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md, ...shadow.sm },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderNumber: { fontSize: 12, fontWeight: fontWeight.bold, color: colors.primary },
  customerName: { fontSize: 15, fontWeight: fontWeight.black, color: colors.textPrimary, marginTop: 2 },
  divider: { marginVertical: spacing.md, backgroundColor: colors.surfaceOffset },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  footerLabel: { fontSize: 8, fontWeight: fontWeight.black, color: colors.textMuted, letterSpacing: 0.5 },
  footerValue: { fontSize: 12, fontWeight: fontWeight.bold, color: colors.textSecondary, marginTop: 2 }
});
