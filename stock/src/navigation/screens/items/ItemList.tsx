import { useMemo, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, ScrollView, BackHandler } from "react-native";
import { Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import { useFocusEffect } from "@react-navigation/native";

import { Item, ItemCategory } from "../../../api/client";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { useItemsQuery, useCategoriesQuery, useItemSummaryQuery } from "../../../hooks/useItems";
import { Screen } from "../../../components/Screen";
import { AppHeader } from "../../../components/ui/AppHeader";
import { SkeletonList } from "../../../components/ui/SkeletonCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";
import { ItemCard } from "../../../components/items/ItemCard";
import { AllItemsCard, CategoryCard, UncatCard } from "../../../components/items/CategoryCard";
import { SearchBar } from "../../../components/items/SearchBar";
import { FilterChips, StockFilter } from "../../../components/items/FilterChips";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import { navigate } from "../../navigation-ref";
import { triggerLightHaptic } from "../../../utils/haptics";
import { STOCK_MOVEMENT_PERMISSION } from "../../../utils/items/permissions";

export function ItemList() {
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === "OWNER";
  const canManageStock = !!user?.permissions?.includes(STOCK_MOVEMENT_PERMISSION);
  const { activeShopId } = useShopStore();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [filter, setFilter] = useState<StockFilter>("ALL");
  // null = grid mode; "ALL" = all items list; categoryId = specific category list
  const [selectedCat, setSelectedCat] = useState<string | "ALL" | null>(null);

  // Summary data (fast!)
  const summaryQuery = useItemSummaryQuery();
  const summary = summaryQuery.data;

  // Categories from dedicated endpoint
  const categoriesQuery = useCategoriesQuery();
  const categories: ItemCategory[] = categoriesQuery.data ?? [];

  // Items for the current view (only fetched when in list mode)
  const isSearchActive = debouncedSearch.trim().length > 0;
  const isGridMode = !isSearchActive && selectedCat === null;

  const listQuery = useItemsQuery({
    search: isSearchActive ? debouncedSearch : undefined,
    categoryId: selectedCat && selectedCat !== "ALL" ? selectedCat : undefined,
    limit: 1000,
    enabled: !isGridMode,
  });

  const allItems: Item[] = useMemo(() => {
    return listQuery.data?.items ?? [];
  }, [listQuery.data]);

  const stockByItem = useMemo(() => {
    const m = new Map<string, number>();
    allItems.forEach((i) => m.set(i.id, Number(i.availableStock ?? 0)));
    return m;
  }, [allItems]);

  // Stats from summary
  const totalCount = summary?.totalItems ?? 0;
  const outCount = summary?.outOfStockCount ?? 0;
  const lowCount = summary?.lowStockCount ?? 0;
  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    if (summary?.countByCat) {
      Object.entries(summary.countByCat).forEach(([id, count]) => m.set(id, count as number));
    }
    return m;
  }, [summary]);

  const uncategorisedCount = summary?.uncategorisedCount ?? 0;

  // Filtered items for list mode
  const displayItems: Item[] = useMemo(() => {
    return allItems.filter((i) => {
      const s = stockByItem.get(i.id) ?? 0;
      if (filter === "OUT") return s <= 0;
      if (filter === "LOW") return s > 0 && s <= Number(i.minimumStock ?? 0);
      if (filter === "IN") return s > 0;
      return true;
    });
  }, [allItems, filter, stockByItem]);

  const enterCat = useCallback((id: string | "ALL") => {
    triggerLightHaptic();
    setSelectedCat(id);
    setSearch("");
    setFilter("ALL");
  }, []);

  const exitGrid = useCallback(() => {
    triggerLightHaptic();
    setSelectedCat(null);
    setSearch("");
    setFilter("ALL");
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectedCat !== null) {
          exitGrid();
          return true; // Intercept and handle locally
        }
        return false; // Let navigation handle it
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [selectedCat, exitGrid])
  );

  const activeCatName =
    selectedCat === "ALL"
      ? "All Items"
      : selectedCat === "__uncat__"
      ? "Uncategorised"
      : categories.find((c) => c.id === selectedCat)?.name ?? "Items";

  if (!activeShopId) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Products" fallbackRoute="Home" />
        <EmptyState
          icon="store-alert-outline"
          title="No shop selected"
          subtitle="Please select a shop before managing products."
        />
      </Screen>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GRID MODE
  // ───────────────────────────────────────────────────────────────────────────
  if (isGridMode) {
    return (
      <Screen edges={["top", "left", "right"]} scroll={false}>
        <AppHeader title="Products" subtitle="Tap a category to browse" />
        <ScrollView
          contentContainerStyle={styles.gridScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Summary pills */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillNum}>{totalCount}</Text>
              <Text style={styles.summaryPillLabel}>ITEMS</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={[styles.summaryPillNum, outCount > 0 && { color: colors.danger }]}>{outCount}</Text>
              <Text style={styles.summaryPillLabel}>OUT</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={[styles.summaryPillNum, lowCount > 0 && { color: colors.warning }]}>{lowCount}</Text>
              <Text style={styles.summaryPillLabel}>LOW</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillNum}>{categories.length}</Text>
              <Text style={styles.summaryPillLabel}>CATS</Text>
            </View>
          </View>

          {/* Search — typing auto-exits to list */}
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              if (v.trim()) setSelectedCat("ALL");
            }}
          />

          {/* Category grid */}
          <View style={styles.gridLabelRow}>
            <Text style={styles.gridLabel}>BROWSE BY CATEGORY</Text>
            {isOwner && (
              <Pressable
                onPress={() => navigate("ManageCategories")}
                style={({ pressed }) => [styles.manageBtn, pressed && { opacity: 0.7 }]}
              >
                <Icon source="cog-outline" size={13} color={colors.primary} />
                <Text style={styles.manageBtnText}>Manage</Text>
              </Pressable>
            )}
          </View>

          {categoriesQuery.isLoading || summaryQuery.isLoading ? (
            <SkeletonList count={4} itemHeight={120} />
          ) : (
            <View style={styles.catGrid}>
              <AllItemsCard count={totalCount} onPress={() => enterCat("ALL")} />
              {categories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  itemCount={countByCat.get(cat.id) ?? 0}
                  onPress={() => enterCat(cat.id)}
                />
              ))}
              {uncategorisedCount > 0 && (
                <UncatCard count={uncategorisedCount} onPress={() => enterCat("__uncat__")} />
              )}
            </View>
          )}
        </ScrollView>

        {/* FAB */}
        {isOwner && (
          <Pressable
            onPress={() => navigate("AddEditItem")}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <Icon source="plus" size={26} color="#fff" />
          </Pressable>
        )}
      </Screen>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LIST MODE
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader title="Products" subtitle={activeCatName} onBack={exitGrid} />
      <View style={{ flex: 1 }}>
        <FlashList<Item>
          data={displayItems}
          keyExtractor={(item) => item.id}
          onRefresh={() => { listQuery.refetch(); summaryQuery.refetch(); categoriesQuery.refetch(); }}
          refreshing={listQuery.isFetching || summaryQuery.isFetching || categoriesQuery.isFetching}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {/* Back to grid breadcrumb */}
              {!isSearchActive && (
                <Pressable onPress={exitGrid} style={styles.breadcrumb}>
                  <Icon source="arrow-left" size={16} color={colors.primary} />
                  <Text style={styles.breadcrumbText}>
                    {activeCatName}
                    <Text style={styles.breadcrumbCount}> · {displayItems.length}</Text>
                  </Text>
                </Pressable>
              )}

              <SearchBar value={search} onChange={setSearch} />
              <FilterChips value={filter} onChange={setFilter} />
            </View>
          }
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              stock={stockByItem.get(item.id) ?? 0}
              canEdit={isOwner}
              canManageStock={canManageStock}
              onPress={() => navigate("ItemDetail", { itemId: item.id })}
              onEdit={() => navigate("AddEditItem", { item })}
              onManageStock={() => navigate("StockEntry", { itemId: item.id })}
            />
          )}
          ListEmptyComponent={
            listQuery.isLoading ? (
              <SkeletonList count={6} itemHeight={110} />
            ) : (
              <EmptyState
                icon="package-variant-closed"
                title="No items found"
                subtitle="Adjust filters or add a new product."
                action={
                  isOwner ? (
                    <Button
                      label="Add Product"
                      icon="plus"
                      onPress={() => navigate("AddEditItem")}
                    />
                  ) : undefined
                }
              />
            )
          }
          contentContainerStyle={styles.listContent}
        />

        {/* FAB */}
        {isOwner && (
          <Pressable
            onPress={() => navigate("AddEditItem")}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <Icon source="plus" size={26} color="#fff" />
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gridScroll: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: 2,
    ...shadow.sm,
  },
  summaryPillNum: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  summaryPillLabel: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  gridLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  manageBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  listHeader: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  breadcrumbText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  breadcrumbCount: {
    fontWeight: fontWeight.medium,
    color: colors.primaryDark,
  },
  fab: {
    position: "absolute",
    bottom: spacing.xxl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
});
