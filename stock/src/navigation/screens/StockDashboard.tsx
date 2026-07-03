import React, { useMemo, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
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

export function StockDashboard() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "in_stock" | "low" | "out">("all");

  const stockQuery = useCurrentStockQuery();

  const onRefresh = useCallback(async () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    await stockQuery.refetch();
  }, [stockQuery]);

  const allRecords = stockQuery.data ?? [];

  // 1. Calculate overall counts for metrics cards
  const totalCount = allRecords.length;
  
  const lowStockCount = useMemo(() => 
    allRecords.filter(r => r.isLowStock && r.availableStock > 0).length,
    [allRecords]
  );

  const outOfStockCount = useMemo(() => 
    allRecords.filter(r => r.availableStock <= 0).length,
    [allRecords]
  );

  const inStockCount = useMemo(() => 
    allRecords.filter(r => r.availableStock > Number(r.item?.minimumStock ?? 0)).length,
    [allRecords]
  );

  // 2. Filter records by search and active tab
  const filteredRecords = useMemo(() => {
    return allRecords.filter((record) => {
      const itemName = record.item?.name || "";
      const itemSku = record.item?.sku || "";
      const matchesSearch = 
        itemName.toLowerCase().includes(search.toLowerCase()) || 
        itemSku.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === "in_stock") return record.availableStock > Number(record.item?.minimumStock ?? 0);
      if (activeTab === "low") return record.isLowStock && record.availableStock > 0;
      if (activeTab === "out") return record.availableStock <= 0;

      return true;
    });
  }, [allRecords, activeTab, search]);

  const getStockHealth = (qty: number, minStock: number) => {
    if (qty <= 0) {
      return { label: "OUT OF STOCK", tone: "red" as const };
    }
    if (qty <= minStock) {
      return { label: "LOW STOCK", tone: "amber" as const };
    }
    return { label: "HEALTHY", tone: "green" as const };
  };

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <AppHeader 
        title="Stock Dashboard" 
        subtitle="Real-time physical stock and alerts." 
        fallbackRoute="Home"
      />

      <View style={styles.container}>
        {/* Quick Summary Metrics */}
        <View style={styles.statsRow}>
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab("all");
            }}
            style={[styles.statCard, activeTab === "all" && styles.statCardSelected]}
          >
            <Text style={styles.statLabel}>ALL PRODUCTS</Text>
            <Text style={styles.statValue}>{totalCount}</Text>
          </Pressable>
          
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

        {/* Action Buttons */}
        <View style={styles.actionRow}>
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
              const label = tab === "all" ? "All Items" : tab === "in_stock" ? "In Stock" : tab === "low" ? "Low Stock" : "Out of Stock";
              return (
                <Pressable
                  key={tab}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
            (() => {
              const List = FlashList as any;
              return (
                <List
                  data={filteredRecords}
                  keyExtractor={(item: StockLevel) => item.item.id}
                  estimatedItemSize={110}
                  refreshing={stockQuery.isRefetching}
                  onRefresh={onRefresh}
                  renderItem={({ item }: { item: StockLevel }) => {
                    const minStockVal = Number(item.item.minimumStock);
	                    const health = getStockHealth(item.availableStock, minStockVal);

                    return (
                      <Pressable
                        onPress={() => navigate("ItemDetail", { itemId: item.item.id })}
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
                  }}
                  ListEmptyComponent={
                    <EmptyState
                      icon="warehouse"
                      title="No stock alerts"
                      subtitle={`No items found in "${activeTab}" view.`}
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
