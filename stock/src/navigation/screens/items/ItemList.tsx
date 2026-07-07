import { useMemo, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { Item, ItemCategory, ItemBrand } from "../../../api/client";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { useItemsQuery, useCategoriesQuery, useBrandsQuery, useItemSummaryQuery } from "../../../hooks/useItems";
import { Screen } from "../../../components/Screen";
import { AppHeader } from "../../../components/ui/AppHeader";
import { SkeletonList } from "../../../components/ui/SkeletonCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";
import { SummaryPillRow } from "../../../components/ui/SummaryPillRow";
import { AppSearchBar } from "../../../components/ui/AppSearchBar";
import { ItemCard } from "../../../components/items/ItemCard";
import { AllItemsCard, CategoryCard, UncatCard } from "../../../components/items/CategoryCard";
import { FilterChips, StockFilter } from "../../../components/items/FilterChips";
import { BrandPickerSheet } from "../../../components/items/BrandPickerSheet";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import { navigate } from "../../navigation-ref";
import { triggerLightHaptic } from "../../../utils/haptics";
import { STOCK_MOVEMENT_PERMISSION, hasPermission } from "../../../utils/items/permissions";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function ItemList() {
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === "OWNER";
  const canManageStock = hasPermission(user, STOCK_MOVEMENT_PERMISSION);
  const { activeShopId } = useShopStore();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [filter, setFilter] = useState<StockFilter>("ALL");
  // null = grid mode; "ALL" = all items list; categoryId = specific category list
  const [selectedCat, setSelectedCat] = useState<string | "ALL" | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [showBrandPicker, setShowBrandPicker] = useState(false);

  // Summary data (fast!)
  const summaryQuery = useItemSummaryQuery();
  const summary = summaryQuery.data;

  // Categories from dedicated endpoint
  const categoriesQuery = useCategoriesQuery();
  const categories: ItemCategory[] = categoriesQuery.data ?? [];

  // Brands from dedicated endpoint
  const brandsQuery = useBrandsQuery();
  const brands: ItemBrand[] = brandsQuery.data ?? [];

  // Items for the current view (only fetched when in list mode)
  const isSearchActive = debouncedSearch.trim().length > 0;
  const isGridMode = !isSearchActive && selectedCat === null;

  const listQuery = useItemsQuery({
    search: isSearchActive ? debouncedSearch : undefined,
    categoryId: selectedCat && selectedCat !== "ALL" ? selectedCat : undefined,
    brandId: selectedBrandId || undefined,
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
    setSelectedBrandId("");
    setSearch("");
    setFilter("ALL");
  }, []);

  const exitGrid = useCallback(() => {
    triggerLightHaptic();
    setSelectedCat(null);
    setSelectedBrandId("");
    setSearch("");
    setFilter("ALL");
  }, []);

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
          <SummaryPillRow
            items={[
              { label: "ITEMS", value: totalCount },
              { label: "OUT", value: outCount, tone: outCount > 0 ? "red" : "default" },
              { label: "LOW", value: lowCount, tone: lowCount > 0 ? "amber" : "default" },
              { label: "CATS", value: categories.length },
              { label: "BRANDS", value: summary?.totalBrands ?? 0 },
            ]}
          />

          {/* Search — typing auto-exits to list */}
          <AppSearchBar
            placeholder="Search products"
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              if (v.trim()) setSelectedCat("ALL");
            }}
          />

          {/* Category grid */}
          <View style={styles.gridLabelRow}>
            <Text style={styles.gridLabel}>BROWSE BY CATEGORY</Text>
            {isOwner && (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Pressable
                  onPress={() => navigate("ManageCategories")}
                  style={({ pressed }) => [styles.manageBtn, pressed && { opacity: 0.7 }]}
                >
                  <Icon source="cog-outline" size={13} color={colors.primary} />
                  <Text style={styles.manageBtnText}>Categories</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigate("ManageBrands")}
                  style={({ pressed }) => [styles.manageBtn, pressed && { opacity: 0.7 }]}
                >
                  <Icon source="cog-outline" size={13} color={colors.primary} />
                  <Text style={styles.manageBtnText}>Brands</Text>
                </Pressable>
              </View>
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
              <AppSearchBar value={search} onChangeText={setSearch} placeholder="Search products" />
              <View style={styles.filterRowWrap}>
                <FilterChips value={filter} onChange={setFilter} />
                <Pressable
                  onPress={() => {
                    triggerLightHaptic();
                    setShowBrandPicker(true);
                  }}
                  style={[
                    styles.brandFilterBtn,
                    !!selectedBrandId && { borderColor: colors.primary, backgroundColor: colors.primaryLight }
                  ]}
                >
                  <Icon source="certificate-outline" size={13} color={selectedBrandId ? colors.primary : colors.textMuted} />
                  <Text style={[styles.brandFilterBtnText, !!selectedBrandId && { color: colors.primary, fontWeight: fontWeight.bold }]}>
                    {selectedBrandId ? (brands.find(b => b.id === selectedBrandId)?.name ?? "Brand") : "Brand"}
                  </Text>
                  <Icon source="chevron-down" size={13} color={selectedBrandId ? colors.primary : colors.textMuted} />
                </Pressable>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              stock={stockByItem.get(item.id) ?? 0}
              canEdit={isOwner}
              canManageStock={canManageStock}
              onPress={() => navigate("ItemDetail", { itemId: item.id })}
              onLongPress={() => {
                triggerLightHaptic();
                Alert.alert(
                  item.name,
                  `SKU: ${item.sku || "N/A"}\nMRP: ${money(item.mrp)}\nSelling Price: ${money(item.defaultSellingPrice)}\nMin Allowed Price: ${money(item.minimumAllowedPrice)}\nUnit: ${item.unit}\nTrack Serials: ${item.requiresSerialNumber ? "Yes" : "No"}\nCategory: ${item.category?.name || "None"}\nBrand: ${item.brand?.name || "None"}\nCurrent Stock: ${stockByItem.get(item.id) ?? 0} ${item.unit}`,
                  [
                    { text: "Close", style: "cancel" },
                    isOwner ? { text: "Edit Product", onPress: () => navigate("AddEditItem", { item }) } : null,
                    canManageStock ? { text: "Add Stock", onPress: () => navigate("StockEntry", { itemId: item.id }) } : null
                  ].filter(Boolean) as any
                );
              }}
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

      <BrandPickerSheet
        visible={showBrandPicker}
        brands={brands}
        selectedBrandId={selectedBrandId}
        onSelect={(brandId) => {
          setSelectedBrandId(brandId);
          setShowBrandPicker(false);
        }}
        onDismiss={() => setShowBrandPicker(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gridScroll: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
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
  filterRowWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  brandFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  brandFilterBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
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
