import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
} from "react-native";
import { Text, Divider, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";

import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ActionTile } from "../../components/ui/ActionTile";
import { useSalesQuery } from "../../hooks/useSales";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { navigate } from "../navigation-ref";
import { type Sale } from "../../api/client";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

const haptic = (s: "light" | "medium" = "light") => {
  if (Platform.OS !== "web") {
    void Haptics.impactAsync(
      s === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    ).catch(() => {});
  }
};

type StatusType = "ALL" | "PAID" | "PENDING" | "PARTIAL";

const TypedFlashList = FlashList as any;

export function NewSaleType() {
  const [search, setSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusType>("ALL");

  const { data: sales, isLoading, refetch, isRefetching } = useSalesQuery();

  // Debounce search input for performance
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebSearch(search);
    }, 180);
    return () => clearTimeout(handler);
  }, [search]);

  const handleStartWalkIn = () => {
    haptic("medium");
    navigate("WalkInSale");
  };

  const handleStartRegular = () => {
    haptic("medium");
    navigate("RegularSale");
  };

  const filteredSales = useMemo(() => {
    if (!sales) return [];
    return sales.filter((s) => {
      const q = debSearch.toLowerCase().trim();
      const numMatch = s.saleNumber.toLowerCase().includes(q);
      const nameMatch = s.isWalkin
        ? "walk-in".includes(q)
        : s.customer?.name.toLowerCase().includes(q);

      const matchesSearch = !q || numMatch || nameMatch;
      const matchesStatus = statusFilter === "ALL" || s.paymentStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [sales, debSearch, statusFilter]);

  // Counts for each status chip
  const counts = useMemo(() => {
    const list = sales ?? [];
    return {
      ALL: list.length,
      PAID: list.filter((s) => s.paymentStatus === "PAID").length,
      PENDING: list.filter((s) => s.paymentStatus === "PENDING" || s.paymentStatus === "UNPAID").length,
      PARTIAL: list.filter((s) => s.paymentStatus === "PARTIAL").length,
    };
  }, [sales]);

  const getStatusColors = (status?: string) => {
    switch (status) {
      case "PAID":
        return { text: colors.success, bg: colors.successLight, border: "rgba(22,163,74,0.15)" };
      case "PARTIAL":
        return { text: colors.warning, bg: colors.warningLight, border: "rgba(217,119,6,0.15)" };
      default:
        return { text: colors.danger, bg: colors.dangerLight, border: "rgba(220,38,38,0.15)" };
    }
  };

  const onRefresh = useCallback(async () => {
    haptic("medium");
    await refetch();
  }, [refetch]);

  const renderSaleRow = useCallback(({ item, index }: { item: Sale; index: number }) => {
    const statusColors = getStatusColors(item.paymentStatus);
    const initials = item.isWalkin
      ? "WK"
      : item.customer?.name
      ? item.customer.name.substring(0, 2).toUpperCase()
      : "SL";

    const saleDate = new Date(item.createdAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    const isFirst = index === 0;
    const isLast = index === filteredSales.length - 1;

    return (
      <View>
        <Pressable
          onPress={() => navigate("SaleDetail", { id: item.id })}
          style={({ pressed }) => [
            styles.saleItemRow,
            pressed && styles.pressedRow,
            isFirst && styles.roundedTop,
            isLast && styles.roundedBottom,
          ]}
        >
          <View style={[styles.avatarCircle, item.isWalkin ? styles.walkinAvatar : styles.customerAvatar]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={styles.saleInfo}>
            <Text style={styles.saleCustomer} numberOfLines={1}>
              {item.isWalkin ? "Walk-in Customer" : item.customer?.name}
            </Text>
            <Text style={styles.saleDetails}>
              {item.saleNumber} • {saleDate}
            </Text>
          </View>

          <View style={styles.salePriceInfo}>
            <Text style={styles.saleAmount}>{money(item.totalAmount)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
              <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
                {item.paymentStatus}
              </Text>
            </View>
          </View>
        </Pressable>
        {!isLast && <Divider style={styles.rowDivider} />}
      </View>
    );
  }, [filteredSales]);

  const ListHeader = useMemo(() => {
    return (
      <View style={styles.headerContainer}>
        {/* Action Grid */}
        <View style={styles.actionGrid}>
          <View style={styles.actionTileWrapper}>
            <ActionTile
              title="Walk-in Sale"
              subtitle="Counter checkout"
              icon="walk"
              tone="green"
              variant="grid"
              onPress={handleStartWalkIn}
            />
          </View>

          <View style={styles.actionTileWrapper}>
            <ActionTile
              title="Regular Sale"
              subtitle="Logged customer"
              icon="account-cash-outline"
              tone="blue"
              variant="grid"
              onPress={handleStartRegular}
            />
          </View>
        </View>

        {/* Section Title */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Icon source="magnify" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search invoice or customer..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Icon source="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Custom Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {(["ALL", "PAID", "PENDING", "PARTIAL"] as const).map((filter) => {
            const active = statusFilter === filter;
            let label = "All";
            let pillColor: string = colors.textSecondary;
            let pillBg: string = colors.surfaceOffset;

            if (filter === "PAID") {
              label = "Paid";
              pillColor = colors.success;
              pillBg = colors.successLight;
            } else if (filter === "PENDING") {
              label = "Pending";
              pillColor = colors.danger;
              pillBg = colors.dangerLight;
            } else if (filter === "PARTIAL") {
              label = "Partial";
              pillColor = colors.warning;
              pillBg = colors.warningLight;
            } else {
              pillColor = colors.primary;
              pillBg = colors.primaryLight;
            }

            return (
              <Pressable
                key={filter}
                onPress={() => {
                  haptic();
                  setStatusFilter(filter);
                }}
                style={[
                  styles.filterPill,
                  active && {
                    backgroundColor: pillBg,
                    borderColor: pillColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    active && { color: pillColor, fontWeight: fontWeight.bold },
                  ]}
                >
                  {label}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    active
                      ? { backgroundColor: pillColor }
                      : { backgroundColor: colors.borderStrong },
                  ]}
                >
                  <Text
                    style={[
                      styles.countBadgeText,
                      active ? { color: "#fff" } : { color: colors.textSecondary },
                    ]}
                  >
                    {counts[filter]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }, [search, statusFilter, counts]);

  return (
    <Screen scroll={false} edges={["top", "left", "right"]}>
      <AppHeader
        title="Sales Hub"
        subtitle="Register payments and log transactions"
        fallbackRoute="Home"
      />

      <View style={styles.listContainer}>
        {isLoading ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <SkeletonList count={5} itemHeight={80} />
          </View>
        ) : filteredSales.length === 0 ? (
          <TypedFlashList
            data={[]}
            estimatedItemSize={100}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={
              <EmptyState
                icon="receipt"
                title="No transactions found"
                subtitle={
                  search || statusFilter !== "ALL"
                    ? "Try adjusting your filters"
                    : "Start by registering a new sale above"
                }
              />
            }
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <TypedFlashList
            data={filteredSales}
            keyExtractor={(item: Sale) => item.id}
            estimatedItemSize={74}
            refreshing={isRefetching}
            onRefresh={onRefresh}
            renderItem={renderSaleRow}
            ListHeaderComponent={ListHeader}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  headerContainer: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  actionGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
    marginTop: spacing.xs,
  },
  actionTileWrapper: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitleRow: {
    marginTop: spacing.xs,
    marginBottom: -spacing.xs,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 40,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    ...shadow.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    height: "100%",
    padding: 0,
  },
  filterScroll: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  countBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
  },

  /* Grouped list design details */
  saleItemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 68,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  roundedTop: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
  },
  roundedBottom: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomWidth: 1,
    ...shadow.sm,
  },
  rowDivider: {
    backgroundColor: colors.border,
  },
  pressedRow: {
    backgroundColor: colors.surfaceOffset,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  walkinAvatar: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: "rgba(22,163,74,0.1)",
  },
  customerAvatar: {
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: "rgba(2,132,199,0.1)",
  },
  avatarText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  saleInfo: {
    flex: 1,
    marginLeft: spacing.md,
    gap: 1,
  },
  saleCustomer: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  saleDetails: {
    fontSize: 10,
    color: colors.textMuted,
  },
  salePriceInfo: {
    alignItems: "flex-end",
    gap: 3,
  },
  saleAmount: {
    fontSize: 13,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: fontWeight.black,
  },
});
