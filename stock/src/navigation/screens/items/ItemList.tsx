import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, Keyboard, Modal } from "react-native";
import { Image } from "expo-image";
import { Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Item, ItemCategory, ItemBrand } from "../../../api/client";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { useItemsQuery, useCategoriesQuery, useBrandsQuery, useItemSummaryQuery, useBatchQuickUpdateMutation } from "../../../hooks/useItems";
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
import { parseAmount } from "../../../utils/items/validation";

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
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const isKeyboardOpen = useRef(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      isKeyboardOpen.current = true;
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      isKeyboardOpen.current = false;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const openBrandPicker = () => {
    if (isKeyboardOpen.current) {
      Keyboard.dismiss();
      let triggered = false;
      const sub = Keyboard.addListener("keyboardDidHide", () => {
        sub.remove();
        if (!triggered) {
          triggered = true;
          setShowBrandPicker(true);
        }
      });
      // Fallback
      setTimeout(() => {
        sub.remove();
        if (!triggered) {
          triggered = true;
          setShowBrandPicker(true);
        }
      }, 350);
    } else {
      setShowBrandPicker(true);
    }
  };

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
  const batchQuickUpdateMutation = useBatchQuickUpdateMutation();
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // Reset pending drafts when switching shops
  useEffect(() => {
    setDraftUpdates({});
    setEditingItemId(null);
    setEditingMode(null);
  }, [activeShopId]);

  const handleSavePrices = (itemId: string, mrp: string, sellingPrice: string) => {
    triggerLightHaptic();
    const matchedItem = allItems.find((i) => i.id === itemId);
    if (!matchedItem) return;
    const parsedMrp = parseAmount(mrp, null);
    const parsedSelling = parseAmount(sellingPrice, null);
    if (mrp.trim() && parsedMrp === null) {
      Alert.alert("Invalid price", "MRP must be a valid non-negative number.");
      return;
    }
    if (parsedSelling === null) {
      Alert.alert("Invalid price", "Selling price is required and must be non-negative.");
      return;
    }
    if (parsedMrp !== null && parsedSelling > parsedMrp) {
      Alert.alert("Invalid price", "Selling price cannot be greater than MRP.");
      return;
    }
    setDraftUpdates((prev) => {
      const next = { ...prev };
      const currentMrp = matchedItem.mrp == null || matchedItem.mrp === "" ? null : Number(matchedItem.mrp);
      const currentSelling = Number(matchedItem.defaultSellingPrice ?? 0);
      const mrpChanged = parsedMrp !== currentMrp;
      const sellingChanged = parsedSelling !== currentSelling;

      const existingUpdate = next[itemId] || {};

      if (!mrpChanged && !sellingChanged && !existingUpdate.stockAdjustment) {
        delete next[itemId];
      } else {
        const pricePatch = {
          ...(mrpChanged ? { mrp: mrp.trim() } : {}),
          ...(sellingChanged ? { defaultSellingPrice: sellingPrice.trim() } : {}),
        };
        next[itemId] = {
          ...existingUpdate,
          mrp: pricePatch.mrp,
          defaultSellingPrice: pricePatch.defaultSellingPrice,
        };
      }
      return next;
    });
    setEditingItemId(null);
    setEditingMode(null);
  };

  const handleSaveStock = (itemId: string, adjustment: string, originalStock: number) => {
    triggerLightHaptic();
    setDraftUpdates((prev) => {
      const next = { ...prev };
      const parsedStock = adjustment.trim() ? Number(adjustment) : 0;
      const hasChanges = parsedStock !== 0;

      const existingUpdate = next[itemId] || {};

      if (!hasChanges && !existingUpdate.mrp && !existingUpdate.defaultSellingPrice) {
        delete next[itemId];
      } else {
        next[itemId] = {
          ...existingUpdate,
          stockAdjustment: hasChanges ? adjustment.trim() : undefined,
          originalStock,
        };
      }
      return next;
    });
    setEditingItemId(null);
    setEditingMode(null);
  };

  const hasPendingDrafts = Object.keys(draftUpdates).length > 0;

  const handleSaveBatch = async () => {
    if (!hasPendingDrafts) return true;
    triggerLightHaptic();
    setIsSavingBatch(true);

    try {
      const updates = Object.entries(draftUpdates).map(([id, draft]) => {
        const payload: any = { itemId: id };
        if (draft.mrp !== undefined || draft.defaultSellingPrice !== undefined) {
          payload.pricePatch = {};
          if (draft.mrp !== undefined) payload.pricePatch.mrp = draft.mrp.trim() ? Number(draft.mrp) : null;
          if (draft.defaultSellingPrice !== undefined) payload.pricePatch.defaultSellingPrice = Number(draft.defaultSellingPrice);
        }
        if (draft.stockAdjustment !== undefined) {
          payload.stockAdjustment = Number(draft.stockAdjustment);
        }
        return payload;
      });

      await batchQuickUpdateMutation.mutateAsync(updates);

      // Success
      Alert.alert("Success", "All quick product updates have been saved successfully!");
      setDraftUpdates({});
      await Promise.all([
        listQuery.refetch(),
        summaryQuery.refetch(),
      ]);
      return true;
    } catch (error: any) {
      Alert.alert("Save Failed", error?.message || "Could not save quick updates. Please try again.");
      return false;
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleDiscardDrafts = () => {
    triggerLightHaptic();
    const count = Object.keys(draftUpdates).length;
    Alert.alert(
      "Discard Changes",
      `Are you sure you want to discard all ${count} pending item updates?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => setDraftUpdates({}) }
      ]
    );
  };

  const confirmPendingDraftAction = useCallback((onDiscard: () => void, onSave?: () => void | Promise<void>) => {
    const count = Object.keys(draftUpdates).length;
    if (count === 0) {
      onDiscard();
      return;
    }
    Alert.alert(
      "Pending Product Updates",
      `${count} pending product update${count === 1 ? "" : "s"} have not been saved.`,
      [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            setDraftUpdates({});
            setEditingItemId(null);
            setEditingMode(null);
            onDiscard();
          },
        },
        ...(onSave
          ? [{
              text: "Save All",
              onPress: () => {
                void onSave();
              },
            }]
          : []),
      ],
    );
  }, [draftUpdates]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: any) => {
      if (!hasPendingDrafts || isSavingBatch) return;
      event.preventDefault();
      confirmPendingDraftAction(
        () => navigation.dispatch(event.data.action),
        async () => {
          const saved = await handleSaveBatch();
          if (saved) navigation.dispatch(event.data.action);
        },
      );
    });
    return unsubscribe;
  }, [confirmPendingDraftAction, handleSaveBatch, hasPendingDrafts, isSavingBatch, navigation]);

  const requestShopSwitch = useCallback((_shopId: string, proceed: () => void) => {
    if (!hasPendingDrafts) {
      proceed();
      return;
    }
    confirmPendingDraftAction(
      proceed,
      async () => {
        const saved = await handleSaveBatch();
        if (saved) proceed();
      },
    );
  }, [confirmPendingDraftAction, handleSaveBatch, hasPendingDrafts]);

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

  const requestExitGrid = useCallback(() => {
    if (!hasPendingDrafts) {
      exitGrid();
      return;
    }
    confirmPendingDraftAction(
      exitGrid,
      async () => {
        const saved = await handleSaveBatch();
        if (saved) exitGrid();
      },
    );
  }, [confirmPendingDraftAction, exitGrid, handleSaveBatch, hasPendingDrafts]);

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
        onBack={isGridMode ? undefined : requestExitGrid}
        onRequestShopSwitch={requestShopSwitch}
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
          loading={listQuery.isFetching || isDebouncePending}
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
                      openBrandPicker();
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
                onEdit={() => { triggerLightHaptic(); navigate("AddEditItem", { itemId: item.id }); }}
                onManageStock={() => { triggerLightHaptic(); setEditingItemId(item.id); setEditingMode("STOCK"); }}
                isEditing={editingItemId === item.id ? editingMode : null}
                draft={draftUpdates[item.id]}
                onSavePrices={(prices) => handleSavePrices(item.id, prices.mrp, prices.defaultSellingPrice)}
                onSaveStock={(stockState) => handleSaveStock(item.id, stockState.adjustment, stockByItem.get(item.id) ?? 0)}
                onCancelInline={() => { setEditingItemId(null); setEditingMode(null); }}
                onPressImage={setPreviewImageUrl}
              />
            )}
            ListEmptyComponent={
              (listQuery.isLoading || listQuery.isFetching || isDebouncePending) && displayItems.length === 0 ? (
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
      {isOwner && !hasPendingDrafts && (
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

      {hasPendingDrafts && (
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
                onPress={handleDiscardDrafts}
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

      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <Pressable 
          style={styles.lightboxOverlay} 
          onPress={() => setPreviewImageUrl(null)}
        >
          <View style={styles.lightboxContent}>
            {previewImageUrl && (
              <Image
                source={{ uri: previewImageUrl }}
                style={styles.lightboxImage}
                contentFit="contain"
              />
            )}
            <Pressable 
              onPress={() => setPreviewImageUrl(null)} 
              style={[styles.closeLightboxBtn, { top: insets.top > 0 ? insets.top + spacing.md : spacing.xl }]}
            >
              <Icon source="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fixedSearchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
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
  lightboxOverlay: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxContent: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  lightboxImage: {
    width: "90%",
    height: "80%",
  },
  closeLightboxBtn: {
    position: "absolute",
    right: spacing.xl,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
});
