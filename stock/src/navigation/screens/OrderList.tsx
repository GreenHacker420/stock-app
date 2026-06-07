import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Searchbar, Divider, Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { useOrdersQuery } from "../../hooks/useOrders";
import { type Order } from "../../api/client";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function OrderList() {
  const navigation = useNavigation();
  const route = useRoute();
  const [search, setSearch] = useState("");
  
  // Set default tab from route params (e.g. from dashboard)
  const initialTab = (route.params as { tab?: string } | undefined)?.tab || "all";
  const [activeTab, setActiveTab] = useState(initialTab);

  const ordersQuery = useOrdersQuery();

  const tabs = ["all", "draft", "to pack", "packing", "packed", "dispatched", "cancelled"];

  const filteredOrders = useMemo(() => {
    const all = ordersQuery.data ?? [];
    return all.filter((order) => {
      const customerName = order.customer?.name || "Regular customer";
      const text = `${order.orderNumber} ${customerName} ${order.status ?? ""}`.toLowerCase();
      const matchesSearch = text.includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === "draft") return order.status === "DRAFT";
      if (activeTab === "to pack") return order.status === "CONFIRMED";
      if (activeTab === "packing") return order.status === "PACKING" || order.status === "PARTIALLY_PACKED";
      if (activeTab === "packed") return order.status === "PACKED";
      if (activeTab === "dispatched") return ["DISPATCHED", "DM_CREATED", "CONVERTED_TO_SALE"].includes(order.status);
      if (activeTab === "cancelled") return order.status === "CANCELLED";

      return true;
    });
  }, [ordersQuery.data, activeTab, search]);

  // Compute stats based on the filtered list
  const totalBooked = useMemo(() => 
    filteredOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0), 
    [filteredOrders]
  );

  const totalOutstanding = useMemo(() => 
    filteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount) - Number(o.paidAmount)), 0), 
    [filteredOrders]
  );

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "URGENT":
        return { bg: "rgba(220, 38, 38, 0.08)", text: colors.danger };
      case "HIGH":
        return { bg: "rgba(245, 158, 11, 0.08)", text: colors.warning };
      case "NORMAL":
        return { bg: "rgba(59, 130, 246, 0.08)", text: colors.primary };
      default:
        return { bg: colors.surfaceOffset, text: colors.textSecondary };
    }
  };

  const getOrderDisplayStatus = (status: string) => {
    switch (status) {
      case "DRAFT":
        return { label: "DRAFT", tone: "blue" as const };
      case "CONFIRMED":
        return { label: "TO PACK", tone: "amber" as const };
      case "PACKING":
        return { label: "PACKING", tone: "amber" as const };
      case "PARTIALLY_PACKED":
        return { label: "PART PACKED", tone: "amber" as const };
      case "PACKED":
        return { label: "PACKED", tone: "green" as const };
      case "DISPATCHED":
        return { label: "DISPATCHED", tone: "green" as const };
      case "DM_CREATED":
        return { label: "DISBURSED (DM)", tone: "green" as const };
      case "CONVERTED_TO_SALE":
        return { label: "INVOICED", tone: "green" as const };
      case "CANCELLED":
        return { label: "CANCELLED", tone: "red" as const };
      default:
        return { label: status, tone: "blue" as const };
    }
  };

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <AppHeader title="Orders" subtitle="Track customer orders and pack execution." />

      <View style={styles.container}>
        {/* Top Summary Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ORDERS</Text>
            <Text style={styles.statValue}>{filteredOrders.length}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: 'rgba(22, 163, 74, 0.03)', borderColor: 'rgba(22, 163, 74, 0.1)' }]}>
            <Text style={[styles.statLabel, { color: colors.primary }]}>BOOKED VALUE</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{money(totalBooked)}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: 'rgba(217, 119, 6, 0.03)', borderColor: 'rgba(217, 119, 6, 0.1)' }]}>
            <Text style={[styles.statLabel, { color: colors.warning }]}>OUTSTANDING</Text>
            <Text style={[styles.statValue, { color: colors.warning }]}>{money(totalOutstanding)}</Text>
          </View>
        </View>

        {/* Search & Tabs */}
        <Searchbar
          value={search}
          onChangeText={setSearch}
          placeholder="Search order or customer"
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor={colors.textSecondary}
        />

        <View style={styles.tabContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {tabs.map((t) => (
              <Pressable
                key={t}
                onPress={() => setActiveTab(t)}
                style={[styles.tabButton, activeTab === t && styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                  {t.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Orders List */}
        <View style={styles.listWrapper}>
          {ordersQuery.isLoading ? (
            <SkeletonList count={4} itemHeight={130} />
          ) : (
            (() => {
              const List = FlashList as any;
              return (
                <List
                  data={filteredOrders}
                  keyExtractor={(item: Order) => item.id}
                  estimatedItemSize={140}
                  renderItem={({ item }: { item: Order }) => {
                    const balance = Number(item.totalAmount) - Number(item.paidAmount);
                    const statusConfig = getOrderDisplayStatus(item.status);
                    const priColor = getPriorityColor((item as any).priority);
                    const itemsCount = item.items?.length ?? 0;

                    return (
                      <Pressable 
                        onPress={() => (navigation as any).navigate("OrderDetail", { orderId: item.id })}
                        style={({ pressed }) => [
                          styles.orderCard,
                          pressed && styles.pressed
                        ]}
                      >
                        <View style={styles.cardHeader}>
                          <View style={styles.headerLeft}>
                            <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
                            {(item as any).priority && (item as any).priority !== "NORMAL" && (
                              <View style={[styles.priorityBadge, { backgroundColor: priColor.bg }]}>
                                <Text style={[styles.priorityText, { color: priColor.text }]}>
                                  {(item as any).priority}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.dateText}>
                            {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </Text>
                        </View>

                        <Text style={styles.customerName}>{item.customer?.name ?? "Regular Customer"}</Text>
                        <Text style={styles.itemCountText}>{itemsCount} {itemsCount === 1 ? 'item' : 'items'} to pack</Text>

                        <Divider style={styles.divider} />

                        <View style={styles.cardFooter}>
                          <View style={styles.statusCol}>
                            <StatusPill label={statusConfig.label} tone={statusConfig.tone} />
                          </View>
                          <View style={styles.amountCol}>
                            <Text style={styles.footerLabel}>BOOKED</Text>
                            <Text style={styles.footerValue}>{money(item.totalAmount)}</Text>
                          </View>
                          <View style={[styles.amountCol, { alignItems: 'flex-end' }]}>
                            <Text style={styles.footerLabel}>OUTSTANDING</Text>
                            <Text style={[styles.footerValue, { color: balance > 0 ? colors.warning : colors.success }]}>
                              {money(balance)}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <EmptyState
                      icon="package-variant"
                      title="No orders found"
                      subtitle={`Orders matching "${activeTab}" filter will show here.`}
                    />
                  }
                  contentContainerStyle={styles.listContent}
                />
              );
            })()
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadow.sm,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 16,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 2,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
    height: 44,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  searchInput: {
    fontSize: 14,
  },
  tabContainer: {
    height: 38,
    marginBottom: spacing.lg,
  },
  tabScroll: {
    gap: spacing.xs,
  },
  tabButton: {
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    height: 34,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textInverse,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 120,
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderNumber: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 8,
    fontWeight: fontWeight.black,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  customerName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  itemCountText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  divider: {
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusCol: {
    flex: 1.2,
  },
  amountCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  footerLabel: {
    fontSize: 8,
    color: colors.textMuted,
    fontWeight: fontWeight.black,
    letterSpacing: 0.3,
  },
  footerValue: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginTop: 1,
  },
});
