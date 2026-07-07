import { useMemo, useState, useCallback, useEffect } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Item, ItemCategory, ItemBrand, updateItem } from "../../../api/client";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { useItemsQuery, useCategoriesQuery, useBrandsQuery, useItemSummaryQuery, useAddStockMutation } from "../../../hooks/useItems";
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
import { useRoute, useNavigation } from "@react-navigation/native";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import { navigate } from "../../navigation-ref";
import { triggerLightHaptic } from "../../../utils/haptics";
import { STOCK_MOVEMENT_PERMISSION, hasPermission } from "../../../utils/items/permissions";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
const FlashListAny = FlashList as any;

export function ItemList() {
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === "OWNER";
  const canManageStock = hasPermission(user, STOCK_MOVEMENT_PERMISSION);
  const { activeShopId } = useShopStore();
  const insets = useSafeAreaInsets();

  const route = useRoute();
  const navigation = useNavigation<any>();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [filter, setFilter] = useState<StockFilter>("ALL");
  // null = grid mode; "ALL" = all items list; categoryId = specific category list
  const [selectedCat, setSelectedCat] = useState<string | "ALL" | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [showBrandPicker, setShowBrandPicker] = useState(false);

  const [draftUpdates, setDraftUpdates] = useState<Record<string, { mrp?: string; defaultSellingPrice?: string; stockAdjustment?: string; originalStock: number }>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState<"PRICES" | "STOCK" | null>(null);

  useEffect(() => {
    const params = route.params as { categoryId?: string } | undefined;
    if (params?.categoryId !== undefined) {
      setSelectedCat(params.categoryId);
      // Clear route params so it doesn't trigger on returning from other flows
      navigation.setParams({ categoryId: undefined });
    }
  }, [route.params]);

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
  const isSearchActive = search.trim().length > 0;
  const isGridMode = !isSearchActive && selectedCat === null;
  const isDebouncePending = search.trim().length > 0 && debouncedSearch !== search;

  const listQuery = useItemsQuery({
    search: search.trim().length > 0 ? debouncedSearch : undefined,
    categoryId: selectedCat && selectedCat !== "ALL" ? selectedCat : undefined,
    brandId: selectedBrandId || undefined,
    limit: 1000,
    enabled: !isGridMode && !isDebouncePending,
  });

  const allItems: Item[] = useMemo(() => {
    return listQuery.data?.items ?? [];
  }, [listQuery.data]);

  const stockByItem = useMemo(() => {
    const m = new Map<string, number>();
    allItems.forEach((i) => m.set(i.id, Number(i.availableStock ?? 0)));
    return m;
  }, [allItems]);

  const token = useAuthStore((s) => s.token);
  const stockMutation = useAddStockMutation();
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  const handleSaveInline = (
    itemId: string,
    mrp: string,
    sellingPrice: string,
    stockAdjustment: string,
    originalStock: number
  ) => {
    triggerLightHaptic();
    setDraftUpdates((prev) => {
      const next = { ...prev };
      
      const parsedMrp = mrp.trim() ? Number(mrp) : undefined;
      const parsedSelling = sellingPrice.trim() ? Number(sellingPrice) : undefined;
      const parsedStock = stockAdjustment.trim() ? Number(stockAdjustment) : undefined;

      const matchedItem = allItems.find(i => i.id === itemId);
      const hasChanges = 
        (parsedMrp !== undefined && parsedMrp !== Number(matchedItem?.mrp ?? "")) ||
        (parsedSelling !== undefined && parsedSelling !== Number(matchedItem?.defaultSellingPrice ?? "")) ||
        (parsedStock !== undefined && parsedStock !== 0);

      if (!hasChanges) {
        delete next[itemId];
      } else {
        next[itemId] = {
          mrp: mrp.trim() || undefined,
          defaultSellingPrice: sellingPrice.trim() || undefined,
          stockAdjustment: stockAdjustment.trim() && Number(stockAdjustment) !== 0 ? stockAdjustment.trim() : undefined,
          originalStock,
        };
      }
      return next;
    });
    setEditingItemId(null);
    setEditingMode(null);
  };

  const handleSaveBatch = async () => {
    if (Object.keys(draftUpdates).length === 0) return;
    triggerLightHaptic();
    setIsSavingBatch(true);

    try {
      // 1. Process price updates
      const priceUpdates = Object.entries(draftUpdates)
        .filter(([_, draft]) => draft.mrp !== undefined || draft.defaultSellingPrice !== undefined);

      for (const [id, draft] of priceUpdates) {
        const payload: any = {};
        if (draft.mrp !== undefined) payload.mrp = Number(draft.mrp);
        if (draft.defaultSellingPrice !== undefined) payload.defaultSellingPrice = Number(draft.defaultSellingPrice);
        
        await updateItem(token ?? "", id, payload);
      }

      // 2. Process stock adjustments
      const stockEntries = Object.entries(draftUpdates)
        .filter(([_, draft]) => draft.stockAdjustment !== undefined && Number(draft.stockAdjustment) !== 0)
        .map(([id, draft]) => ({
          itemId: id,
          quantity: Number(draft.stockAdjustment),
        }));

      if (stockEntries.length > 0) {
        await new Promise<void>((resolve, reject) => {
          stockMutation.mutate(
            { entries: stockEntries, notes: "Inline batch adjustments from Catalog list" },
            {
              onSuccess: () => resolve(),
              onError: (err) => reject(err),
            }
          );
        });
      }

      // Success
      Alert.alert("Success", "All quick product updates have been saved successfully!");
      setDraftUpdates({});
      Promise.all([
        listQuery.refetch(),
        summaryQuery.refetch(),
      ]);
    } catch (error: any) {
      Alert.alert("Save Failed", error?.message || "Could not save quick updates. Please try again.");
    } finally {
      setIsSavingBatch(false);
    }
  };

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
    const filtered = allItems.filter((i) => {
      const s = stockByItem.get(i.id) ?? 0;
      if (filter === "OUT") return s <= 0;
      if (filter === "LOW") return s > 0 && s <= Number(i.minimumStock ?? 0);
      if (filter === "IN") return s > 0;
      return true;
    });

    // Sort: items in draftUpdates float to the top!
    return [...filtered].sort((a, b) => {
      const aUpdated = draftUpdates[a.id] !== undefined;
      const bUpdated = draftUpdates[b.id] !== undefined;
      if (aUpdated && !bUpdated) return -1;
      if (!aUpdated && bUpdated) return 1;
      return 0;
    });
  }, [allItems, filter, stockByItem, draftUpdates]);

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

  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader
        title="Products"
        subtitle={isGridMode ? "Tap a category to browse" : activeCatName}
        onBack={isGridMode ? undefined : exitGrid}
      />

      <View style={styles.fixedSearchContainer}>
        <AppSearchBar
          placeholder="Search products"
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            if (v.trim() && selectedCat === null) {
              setSelectedCat("ALL");
            }
          }}
        />
      </View>

      {isGridMode ? (
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
      ) : (
        <View style={{ flex: 1 }}>
          <FlashListAny
            data={displayItems}
            keyExtractor={(item: any) => item.id}
            onRefresh={() => {
              Promise.all([
                listQuery.refetch(),
                summaryQuery.refetch(),
                categoriesQuery.refetch(),
                brandsQuery.refetch(),
              ]);
            }}
            refreshing={listQuery.isFetching || summaryQuery.isFetching || categoriesQuery.isFetching || brandsQuery.isFetching}
            ListHeaderComponent={
              <View style={styles.listHeader}>
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
            renderItem={({ item }: { item: Item }) => (
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
                      isOwner ? { text: "Edit Product", onPress: () => navigate("AddEditItem", { itemId: item.id }) } : null,
                      canManageStock ? { text: "Add Stock", onPress: () => navigate("StockEntry", { itemId: item.id }) } : null
                    ].filter(Boolean) as any
                  );
                }}
                onEdit={() => { triggerLightHaptic(); setEditingItemId(item.id); setEditingMode("PRICES"); }}
                onManageStock={() => { triggerLightHaptic(); setEditingItemId(item.id); setEditingMode("STOCK"); }}
                isEditing={editingItemId === item.id ? editingMode : null}
                draft={draftUpdates[item.id]}
                onSaveInline={(mrp, selling, stockAdj) => handleSaveInline(item.id, mrp, selling, stockAdj, stockByItem.get(item.id) ?? 0)}
                onCancelInline={() => { setEditingItemId(null); setEditingMode(null); }}
              />
            )}
            ListEmptyComponent={
              listQuery.isLoading || listQuery.isFetching || isDebouncePending ? (
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
        </View>
      )}

      {/* FAB */}
      {isOwner && !Object.keys(draftUpdates).length && (
        <Pressable
          onPress={() => navigate("AddEditItem")}
          style={({ pressed }) => [
            styles.fab,
            { bottom: insets.bottom + spacing.xl },
            pressed && styles.fabPressed,
          ]}
        >
          <Icon source="plus" size={26} color="#fff" />
        </Pressable>
      )}

      {Object.keys(draftUpdates).length > 0 && (
        <View style={[styles.batchFooter, { paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.md }]}>
          <View style={styles.batchFooterContent}>
            <View style={styles.batchFooterTextRow}>
              <Text style={styles.batchFooterTitle}>
                {Object.keys(draftUpdates).length} Pending Updates
              </Text>
              <Text style={styles.batchFooterSubtitle}>
                Prioritized to the top of catalog.
              </Text>
            </View>
            <View style={styles.batchFooterActions}>
              <Button
                variant="ghost"
                label="Discard"
                onPress={() => { triggerLightHaptic(); setDraftUpdates({}); }}
                disabled={isSavingBatch}
                style={styles.batchBtn}
              />
              <Button
                variant="success"
                label="Save All"
                onPress={handleSaveBatch}
                loading={isSavingBatch}
                disabled={isSavingBatch}
                style={styles.batchBtn}
                icon={<Icon source="check-all" size={16} color="white" />}
              />
            </View>
          </View>
        </View>
      )}

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
  fixedSearchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  gridScroll: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
  },
  brandFilterBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  listContent: {
    paddingBottom: 160,
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
  batchFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.lg,
  },
  batchFooterContent: {
    gap: spacing.md,
    width: "100%",
  },
  batchFooterTextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  batchFooterTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  batchFooterSubtitle: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  batchFooterActions: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
  batchBtn: {
    flex: 1,
  },
});
