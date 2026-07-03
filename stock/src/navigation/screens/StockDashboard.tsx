import { useMemo, useState, useCallback, memo } from "react";
import { View, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { Searchbar, Divider, Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";

import { useCurrentStockQuery } from "../../hooks/useItems";
import { type StockLevel } from "../../api/client";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";
import { useAuthStore } from "../../auth/auth-store";

// ── Stock Health Helpers ───────────────────────────────────────────────────
const getSafeMinimumStock = (record: StockLevel) => {
  const min = Number(record.item?.minimumStock ?? 0);
  return Number.isFinite(min) ? min : 0;
};

const isOutOfStock = (record: StockLevel) => record.availableStock <= 0;

const isLowStock = (record: StockLevel) => {
  const min = getSafeMinimumStock(record);
  return record.availableStock > 0 && record.availableStock <= min;
};

const isHealthyStock = (record: StockLevel) => {
  const min = getSafeMinimumStock(record);
  return record.availableStock > min;
};

const getStockHealth = (record: StockLevel) => {
  if (isOutOfStock(record)) {
    return { label: "OUT OF STOCK", tone: "red" as const };
  }
  if (isLowStock(record)) {
    return { label: "LOW STOCK", tone: "amber" as const };
  }
  return { label: "HEALTHY", tone: "green" as const };
};

const triggerLightHaptic = () => {
  if (Platform.OS !== "web") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
};

const triggerMediumHaptic = () => {
  if (Platform.OS !== "web") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }
};

// ── Memoized Stock Card ─────────────────────────────────────────────────────
const StockCard = memo(function StockCard({
  item,
  onPress,
  onLongPress,
}: {
  item: StockLevel;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const minStockVal = getSafeMinimumStock(item);
  const health = getStockHealth(item);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.stockCard,
        pressed && styles.pressed
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.itemName}>{item.item.name}</Text>
          {item.item.sku && (
            <Text style={styles.skuText}>SKU: {item.item.sku}</Text>
          )}
        </View>
        <StatusPill label={health.label} tone={health.tone} />
      </View>

      <Divider style={styles.divider} />

      <View style={styles.cardFooter}>
        <View style={styles.qtyCol}>
          <Text style={styles.qtyLabel}>AVAILABLE STOCK</Text>
          <Text style={[
            styles.qtyValue,
            item.availableStock <= 0 ? styles.textRed : item.availableStock <= minStockVal ? styles.textAmber : styles.textGreen
          ]}>
            {item.availableStock} {item.item.unit}
          </Text>
        </View>

        <View style={styles.qtyCol}>
          <Text style={styles.qtyLabel}>PHYSICAL / RESERVED</Text>
          <Text style={styles.qtyValue}>{item.physicalStock} / {item.reservedStock} {item.item.unit}</Text>
        </View>

        <View style={[styles.qtyCol, { alignItems: 'flex-end' }]}>
          <Text style={styles.qtyLabel}>TOTAL IN / OUT</Text>
          <Text style={styles.qtySubText}>
            In: {item.quantityIn} | Out: {item.quantityOut}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

// ── Main Dashboard Screen ───────────────────────────────────────────────────
export function StockDashboard() {
  const List = FlashList as any;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "in_stock" | "low" | "out">("all");

  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";

  const stockQuery = useCurrentStockQuery();

  const onRefresh = useCallback(async () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    await stockQuery.refetch();
  }, [stockQuery]);

  const allRecords = stockQuery.data ?? [];

  // Calculate overall counts for metrics cards using safe unified helpers
  const totalCount = allRecords.length;
  const lowStockCount = useMemo(() => allRecords.filter(isLowStock).length, [allRecords]);
  const outOfStockCount = useMemo(() => allRecords.filter(isOutOfStock).length, [allRecords]);
  const inStockCount = useMemo(() => allRecords.filter(isHealthyStock).length, [allRecords]);

  // Normalize search query once
  const query = useMemo(() => search.trim().toLowerCase(), [search]);

  // Filter records by search and active tab
  const filteredRecords = useMemo(() => {
    return allRecords.filter((record) => {
      const itemName = record.item?.name?.toLowerCase() ?? "";
      const itemSku = record.item?.sku?.toLowerCase() ?? "";
      
      const matchesSearch = 
        !query || 
        itemName.includes(query) || 
        itemSku.includes(query);

      if (!matchesSearch) return false;

      if (activeTab === "in_stock") return isHealthyStock(record);
      if (activeTab === "low") return isLowStock(record);
      if (activeTab === "out") return isOutOfStock(record);

      return true;
    });
  }, [allRecords, activeTab, query]);

  // Dynamic Empty State text based on tab/search context
  const emptyTitle = search.trim()
    ? "No matching products"
    : activeTab === "all"
      ? "No stock records found"
      : activeTab === "low"
        ? "No low-stock items"
        : activeTab === "out"
          ? "No out-of-stock items"
          : "No in-stock items";

  const emptySubtitle = search.trim()
    ? "Try searching by a different product name or SKU."
    : "Stock records will appear here once products are created and stock is added.";

  const renderItem = useCallback(({ item }: { item: StockLevel }) => (
    <StockCard
      item={item}
      onPress={() => navigate("ItemDetail", { itemId: item.item.id })}
      onLongPress={() => {
        triggerMediumHaptic();
        navigate("StockEntry", { itemId: item.item.id });
      }}
    />
  ), []);

  if (stockQuery.isError) {
    return (
      <Screen scroll={false} edges={['top', 'left', 'right']}>
        <AppHeader 
          title="Stock Dashboard" 
          subtitle="Current physical stock and alerts." 
          fallbackRoute="Home"
        />
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load stock"
          subtitle="Please check your connection and try again."
          action={
            <Button
              label="Retry"
              onPress={() => stockQuery.refetch()}
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <AppHeader 
        title="Stock Dashboard" 
        subtitle="Current physical stock and alerts." 
        fallbackRoute="Home"
      />

      <View style={styles.container}>
        {/* Quick Summary Metrics */}
        <View style={styles.statsRow}>
          <Pressable 
            onPress={() => {
              triggerLightHaptic();
              setActiveTab("all");
            }}
            style={[styles.statCard, activeTab === "all" && styles.statCardSelected]}
          >
            <Text style={styles.statLabel}>ALL PRODUCTS</Text>
            <Text style={styles.statValue}>{totalCount}</Text>
          </Pressable>
          
          <Pressable 
            onPress={() => {
              triggerLightHaptic();
              setActiveTab("low");
            }}
            style={[
              styles.statCard, 
              activeTab === "low" && styles.statCardSelected,
              lowStockCount > 0 && { borderColor: 'rgba(245, 158, 11, 0.25)' }
            ]}
          >
            <Text style={[styles.statLabel, lowStockCount > 0 && { color: colors.warning }]}>LOW STOCK</Text>
            <Text style={[styles.statValue, lowStockCount > 0 && { color: colors.warning }]}>{lowStockCount}</Text>
          </Pressable>

          <Pressable 
            onPress={() => {
              triggerLightHaptic();
              setActiveTab("out");
            }}
            style={[
              styles.statCard, 
              activeTab === "out" && styles.statCardSelected,
              outOfStockCount > 0 && { borderColor: 'rgba(220, 38, 38, 0.25)' }
            ]}
          >
            <Text style={[styles.statLabel, outOfStockCount > 0 && { color: colors.danger }]}>OUT OF STOCK</Text>
            <Text style={[styles.statValue, outOfStockCount > 0 && { color: colors.danger }]}>{outOfStockCount}</Text>
          </Pressable>
        </View>

        {/* Permission / Role-Aware Action Buttons */}
        <View style={styles.actionRow}>
          {isOwner ? (
            <>
              <Button
                variant="primary"
                label="New Stock Entry"
                icon={<Icon source="plus-box" size={18} color={colors.textInverse} />}
                onPress={() => navigate("StockEntry")}
                style={{ flex: 1 }}
              />
              <Button
                variant="secondary"
                label="Add Product"
                icon={<Icon source="cube-outline" size={18} color={colors.primary} />}
                onPress={() => navigate("AddEditItem")}
                style={{ flex: 0.8 }}
              />
            </>
          ) : (
            <Button
              variant="primary"
              label="Request Stock Update"
              icon={<Icon source="plus-box" size={18} color={colors.textInverse} />}
              onPress={() => navigate("StockEntry")}
              style={{ flex: 1 }}
            />
          )}
        </View>

        {/* Searchbar */}
        <Searchbar
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or SKU"
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor={colors.textSecondary}
        />

        {/* Tab Selection */}
        <View style={styles.tabContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {(["all", "in_stock", "low", "out"] as const).map((tab) => {
              const label = 
                tab === "all" ? "All Items" : 
                tab === "in_stock" ? `In Stock (${inStockCount})` : 
                tab === "low" ? `Low Stock (${lowStockCount})` : 
                `Out of Stock (${outOfStockCount})`;
              return (
                <Pressable
                  key={tab}
                  onPress={() => {
                    triggerLightHaptic();
                    setActiveTab(tab);
                  }}
                  style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
                >
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                    {label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Stock List */}
        <View style={styles.listWrapper}>
          {stockQuery.isLoading ? (
            <SkeletonList count={5} itemHeight={100} />
          ) : (
            <List
              data={filteredRecords}
              keyExtractor={(item: StockLevel) => item.item.id}
              estimatedItemSize={110}
              refreshing={stockQuery.isRefetching}
              onRefresh={onRefresh}
              renderItem={renderItem}
              ListEmptyComponent={
                <EmptyState
                  icon="warehouse"
                  title={emptyTitle}
                  subtitle={emptySubtitle}
                />
              }
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
  statCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 18,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
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
    paddingHorizontal: spacing.xl,
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
  stockCard: {
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
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  skuText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyCol: {
    flex: 1,
  },
  qtyLabel: {
    fontSize: 8,
    color: colors.textMuted,
    fontWeight: fontWeight.black,
    letterSpacing: 0.3,
  },
  qtyValue: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  qtySubText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginTop: 2,
  },
  textGreen: {
    color: colors.success,
  },
  textAmber: {
    color: colors.warning,
  },
  textRed: {
    color: colors.danger,
  },
});
