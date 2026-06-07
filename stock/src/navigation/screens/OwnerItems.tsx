import React, { useMemo, useState, memo } from "react";
import { Pressable, View, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Divider, Icon, Searchbar, Text, TextInput } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { Item } from "../../api/client";
import { 
  useInfiniteItemsQuery,
  useCurrentStockQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
  useItemStockQuery,
  useItemPriceHistoryQuery,
  useStockMovementsQuery 
} from "../../hooks/useItems";
import { useShopStore } from "../../auth/shop-store";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { Screen } from "../../components/Screen";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

const ItemCard = memo(({ item, stock, onEdit, onManageStock, onPress }: { 
  item: Item; 
  stock: number; 
  onEdit: () => void;
  onManageStock: () => void;
  onPress: () => void;
}) => {
  const isLow = stock <= Number(item.minimumStock ?? 0) && stock > 0;
  const isOut = stock === 0;

  const pillInfo = useMemo(() => {
    if (isOut) return { label: "Out of Stock", bg: colors.dangerLight, color: colors.danger };
    if (isLow) return { label: "Low Stock", bg: colors.warningLight, color: colors.warning };
    return { label: "In Stock", bg: colors.successLight, color: colors.success };
  }, [isLow, isOut]);

  return (
    <Pressable 
      onPress={onPress} 
      style={({ pressed }) => [
        styles.itemCard,
        pressed && styles.itemCardPressed
      ]}
    >
      <View style={styles.itemCardRow}>
        {/* Left Side: Package Icon */}
        <View style={styles.itemAvatar}>
          <Icon source="package-variant-closed" size={24} color={colors.textSecondary} />
        </View>

        {/* Middle Side: Details */}
        <View style={styles.itemDetails}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemSubtitle}>SKU: {item.sku || "N/A"}</Text>
          <Text style={styles.itemStockCount}>Stock: <Text style={styles.itemStockValue}>{stock} {item.unit}</Text></Text>
        </View>

        {/* Right Side: Status Pill */}
        <View style={[styles.stockPill, { backgroundColor: pillInfo.bg }]}>
          <Text style={[styles.stockPillText, { color: pillInfo.color }]}>{pillInfo.label}</Text>
        </View>
      </View>

      <Divider style={styles.cardDivider} />

      <View style={styles.itemFooter}>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Selling Price: <Text style={styles.priceValue}>{money(item.defaultSellingPrice)}</Text></Text>
          {item.mrp && (
            <Text style={styles.priceLabel}>MRP: <Text style={styles.priceValueMrp}>{money(item.mrp)}</Text></Text>
          )}
        </View>

        {/* Action Buttons in Footer */}
        <View style={styles.itemActions}>
          <Pressable onPress={onEdit} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <Icon source="pencil-outline" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={onManageStock} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <Icon source="warehouse" size={16} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}, (prev, next) => (
  prev.item.id === next.item.id && 
  prev.stock === next.stock && 
  prev.item.name === next.item.name && 
  prev.item.defaultSellingPrice === next.item.defaultSellingPrice &&
  prev.item.mrp === next.item.mrp
));

export function ItemList() {
  const List = FlashList as any;
  const activeShopId = useShopStore((state) => state.activeShopId);
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [filter, setFilter] = useState("ALL");

  const itemsQuery = useInfiniteItemsQuery({ search: debouncedSearch });
  const stockQuery = useCurrentStockQuery();

  const stockByItem = useMemo(() => new Map((stockQuery.data ?? []).map((row) => [row.item.id, row.currentQuantity])), [stockQuery.data]);

  const allItems = useMemo(() => {
    if (!itemsQuery.data?.pages) return [];
    return itemsQuery.data.pages
      .flatMap((page) => page?.items || [])
      .filter((item): item is Item => !!item && typeof item.id === "string");
  }, [itemsQuery.data]);
  
  const filteredData = useMemo(() => {
    if (filter === "LOW") {
      return allItems.filter(item => {
        const stock = stockByItem.get(item.id) ?? 0;
        return stock <= Number(item.minimumStock ?? 0) && stock > 0;
      });
    }
    if (filter === "OUT") {
      return allItems.filter(item => (stockByItem.get(item.id) ?? 0) === 0);
    }
    return allItems;
  }, [allItems, filter, stockByItem]);

  const lowStockCount = useMemo(() => {
    return allItems.filter(item => {
      const stock = stockByItem.get(item.id) ?? 0;
      return stock <= Number(item.minimumStock ?? 0) && stock > 0;
    }).length;
  }, [allItems, stockByItem]);

  const outOfStockCount = useMemo(() => {
    return allItems.filter(item => (stockByItem.get(item.id) ?? 0) === 0).length;
  }, [allItems, stockByItem]);

  const totalStockValue = useMemo(() => {
    return allItems.reduce((sum, item) => {
      const stock = stockByItem.get(item.id) ?? 0;
      return sum + stock * Number(item.defaultSellingPrice ?? 0);
    }, 0);
  }, [allItems, stockByItem]);

  const totalCount = itemsQuery.data?.pages[0]?.total ?? 0;

  const handleLoadMore = () => {
    if (itemsQuery.hasNextPage && !itemsQuery.isFetchingNextPage) {
      itemsQuery.fetchNextPage();
    }
  };

  if (itemsQuery.isError) {
    return (
      <Screen>
        <AppHeader title="Inventory Management" />
        <EmptyState 
          icon="alert-circle-outline" 
          title="Error loading items" 
          subtitle="Something went wrong while fetching your inventory."
          action={<Button label="Retry" onPress={() => itemsQuery.refetch()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <AppHeader title="Inventory Management" subtitle="Items, pricing, and stock levels." />
        
        <View style={styles.listWrapper}>
          <List
            data={filteredData}
            keyExtractor={(item: Item) => item.id}
            onRefresh={() => itemsQuery.refetch()}
            refreshing={itemsQuery.isFetching && !itemsQuery.isFetchingNextPage}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={
              <View style={styles.headerComponent}>
                {/* Visual Top Summary Metrics scrolling bar */}
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  contentContainerStyle={styles.statsScroll}
                >
                  <View style={[styles.statCard, { backgroundColor: 'rgba(22, 163, 74, 0.03)', borderColor: 'rgba(22, 163, 74, 0.1)' }]}>
                    <Text style={styles.statLabel}>STOCK VALUE</Text>
                    <Text style={[styles.statValue, { color: colors.primary }]}>{money(totalStockValue)}</Text>
                  </View>

                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>CATALOG SIZE</Text>
                    <Text style={styles.statValue}>{totalCount} Items</Text>
                  </View>

                  <View style={[styles.statCard, outOfStockCount > 0 && { borderColor: 'rgba(220, 38, 38, 0.25)', backgroundColor: 'rgba(220, 38, 38, 0.02)' }]}>
                    <Text style={[styles.statLabel, outOfStockCount > 0 && { color: colors.danger }]}>OUT OF STOCK</Text>
                    <Text style={[styles.statValue, outOfStockCount > 0 && { color: colors.danger }]}>{outOfStockCount}</Text>
                  </View>

                  <View style={[styles.statCard, lowStockCount > 0 && { borderColor: 'rgba(217, 119, 6, 0.25)', backgroundColor: 'rgba(217, 119, 6, 0.02)' }]}>
                    <Text style={[styles.statLabel, lowStockCount > 0 && { color: colors.warning }]}>LOW STOCK</Text>
                    <Text style={[styles.statValue, lowStockCount > 0 && { color: colors.warning }]}>{lowStockCount}</Text>
                  </View>
                </ScrollView>

                <Searchbar 
                  value={search} 
                  onChangeText={setSearch} 
                  placeholder="Search item or SKU" 
                  style={styles.searchBar} 
                  inputStyle={styles.searchInput}
                  iconColor={colors.textSecondary}
                />
                
                {/* Custom scrolling Filter Chips */}
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  contentContainerStyle={styles.filterChipsRow}
                >
                  <Pressable 
                    onPress={() => setFilter("ALL")} 
                    style={[styles.filterChip, filter === "ALL" && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, filter === "ALL" && styles.filterChipTextActive]}>Total Stock</Text>
                  </Pressable>

                  <Pressable 
                    onPress={() => setFilter("OUT")} 
                    style={[styles.filterChip, filter === "OUT" && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, filter === "OUT" && styles.filterChipTextActive]}>Out of Stock</Text>
                  </Pressable>

                  <Pressable 
                    onPress={() => setFilter("LOW")} 
                    style={[styles.filterChip, filter === "LOW" && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, filter === "LOW" && styles.filterChipTextActive]}>Low Stock</Text>
                  </Pressable>
                </ScrollView>
              </View>
            }
            renderItem={({ item }: { item: Item }) => (
              <ItemCard 
                item={item} 
                stock={stockByItem.get(item.id) ?? 0} 
                onEdit={() => (navigation as any).navigate("AddEditItem", { item })}
                onManageStock={() => (navigation as any).navigate("StockEntry", { shopId: activeShopId, itemId: item.id })}
                onPress={() => (navigation as any).navigate("ItemDetail", { itemId: item.id })}
              />
            )}
            ListEmptyComponent={
              itemsQuery.isLoading ? (
                <SkeletonList count={8} itemHeight={96} />
              ) : (
                <EmptyState 
                  icon="package-variant-closed" 
                  title="No items found" 
                  subtitle="Try a different search term or add a new item." 
                />
              )
            }
            contentContainerStyle={styles.listContent}
          />
        </View>

        {/* Floating Action Button (FAB) adjusted to sit safely above the glassmorphic tab bar */}
        <Pressable 
          style={styles.fab} 
          onPress={() => (navigation as any).navigate("AddEditItem")}
        >
          <Icon source="plus" size={28} color={colors.textInverse} />
        </Pressable>
      </View>
    </Screen>
  );
}

export function AddEditItem() {
  const route = useRoute();
  const navigation = useNavigation();
  const item = (route.params as { item?: Item } | undefined)?.item;
  
  const [form, setForm] = useState({
    name: item?.name ?? "",
    sku: item?.sku ?? "",
    unit: item?.unit ?? "pcs",
    defaultSellingPrice: String(item?.defaultSellingPrice ?? "0"),
    minimumAllowedPrice: String(item?.minimumAllowedPrice ?? ""),
    purchasePrice: String(item?.purchasePrice ?? ""),
    mrp: String(item?.mrp ?? ""),
    minimumStock: String(item?.minimumStock ?? "0"),
  });

  const createMutation = useCreateItemMutation();
  const updateMutation = useUpdateItemMutation();

  const handleSave = () => {
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      unit: form.unit.trim(),
      defaultSellingPrice: Number(form.defaultSellingPrice || 0),
      minimumStock: Number(form.minimumStock || 0),
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
      mrp: form.mrp ? Number(form.mrp) : undefined,
    };

    if (item) {
      updateMutation.mutate({ id: item.id, data: payload }, {
        onSuccess: () => navigation.goBack()
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => navigation.goBack()
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const stockQuery = useItemStockQuery(item?.id);
  const currentQuantity = (stockQuery.data as any)?.currentQuantity ?? 0;

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={item ? "Edit Item" : "Add Item"} subtitle="Maintain item catalog and prices." />
      <View style={styles.formContainer}>
        <Section title="Item details">
          <View style={styles.formCard}>
            {item && (
              <TextInput
                mode="outlined"
                label="Current Stock"
                value={`${currentQuantity} ${item.unit}`}
                disabled
                style={styles.disabledInput}
                outlineStyle={styles.inputOutline}
              />
            )}
            <TextInput mode="outlined" label="Name" value={form.name} onChangeText={(v) => set("name", v)} outlineStyle={styles.inputOutline} style={styles.input} />
            <TextInput mode="outlined" label="SKU" value={form.sku ?? ""} onChangeText={(v) => set("sku", v)} outlineStyle={styles.inputOutline} style={styles.input} />
            <TextInput mode="outlined" label="Unit" value={form.unit} onChangeText={(v) => set("unit", v)} outlineStyle={styles.inputOutline} style={styles.input} />
            <TextInput mode="outlined" label="Default selling price" keyboardType="numeric" value={form.defaultSellingPrice} onChangeText={(v) => set("defaultSellingPrice", v)} outlineStyle={styles.inputOutline} style={styles.input} />
            <TextInput mode="outlined" label="Minimum allowed price" keyboardType="numeric" value={form.minimumAllowedPrice} onChangeText={(v) => set("minimumAllowedPrice", v)} outlineStyle={styles.inputOutline} style={styles.input} />
            <TextInput mode="outlined" label="Purchase price" keyboardType="numeric" value={form.purchasePrice} onChangeText={(v) => set("purchasePrice", v)} outlineStyle={styles.inputOutline} style={styles.input} />
            <TextInput mode="outlined" label="MRP" keyboardType="numeric" value={form.mrp} onChangeText={(v) => set("mrp", v)} outlineStyle={styles.inputOutline} style={styles.input} />
            <TextInput mode="outlined" label="Minimum stock alert" keyboardType="numeric" value={form.minimumStock} onChangeText={(v) => set("minimumStock", v)} outlineStyle={styles.inputOutline} style={styles.input} />
          </View>
        </Section>
        <View style={styles.formFooter}>
          <Button 
            label="Save Item" 
            onPress={handleSave} 
            loading={isPending} 
            disabled={!form.name.trim() || !form.unit.trim()}
            fullWidth
            size="lg"
          />
        </View>
      </View>
    </Screen>
  );
}

export function ItemDetail() {
  const List = FlashList as any;
  const activeShopId = useShopStore((state) => state.activeShopId);
  const navigation = useNavigation();
  const itemId = (useRoute().params as { itemId?: string } | undefined)?.itemId;

  const stockQuery = useItemStockQuery(itemId);
  const historyQuery = useItemPriceHistoryQuery(itemId);
  const movementsQuery = useStockMovementsQuery(itemId);

  const [activeTab, setActiveTab] = useState("PRICE");

  const item = (stockQuery.data as any)?.item;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <AppHeader title={item?.name ?? "Item Detail"} subtitle="Stock and price settings." />
        {!itemId ? <Text style={styles.errorText}>Missing item id.</Text> : null}
        
        {item ? (
          <List
            data={activeTab === "PRICE" ? ((historyQuery.data as any)?.rows ?? []) : (movementsQuery.data ?? [])}
            ListHeaderComponent={
              <>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Current stock</Text>
                    <Text style={styles.detailHeaderValue}>
                      {(stockQuery.data as any)?.currentQuantity ?? 0} {item.unit}
                    </Text>
                  </View>
                  <Divider style={styles.divider} />
                  <View style={styles.detailStats}>
                    <View style={styles.detailStatItem}>
                      <Text style={styles.statSubLabel}>SKU</Text>
                      <Text style={styles.statSubValue}>{item.sku || "Not set"}</Text>
                    </View>
                    <View style={styles.detailStatItem}>
                      <Text style={styles.statSubLabel}>Default Selling Price</Text>
                      <Text style={styles.statSubValue}>{money(item.defaultSellingPrice)}</Text>
                    </View>
                    <View style={styles.detailStatItem}>
                      <Text style={styles.statSubLabel}>Min Price limit</Text>
                      <Text style={styles.statSubValue}>{money(item.minimumAllowedPrice)}</Text>
                    </View>
                    <View style={styles.detailStatItem}>
                      <Text style={styles.statSubLabel}>MRP</Text>
                      <Text style={styles.statSubValue}>{money(item.mrp)}</Text>
                    </View>
                    <View style={styles.detailStatItem}>
                      <Text style={styles.statSubLabel}>Min Stock threshold</Text>
                      <Text style={styles.statSubValue}>{item.minimumStock} {item.unit}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.detailActions}>
                  <Button 
                    variant="secondary" 
                    label="Edit Item" 
                    icon={<Icon source="pencil" size={20} color={colors.primary} />} 
                    onPress={() => (navigation as any).navigate("AddEditItem", { item })}
                    style={{ flex: 1 }}
                  />
                  <Button 
                    label="Manage Stock" 
                    icon={<Icon source="warehouse" size={20} color={colors.textInverse} />} 
                    onPress={() => (navigation as any).navigate("StockEntry", { shopId: activeShopId, itemId: item.id })}
                    style={{ flex: 1 }}
                  />
                </View>

                <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}>
                  <View style={styles.tabBarContainer}>
                    <Pressable 
                      onPress={() => setActiveTab('PRICE')}
                      style={[styles.tabButton, activeTab === 'PRICE' && styles.tabButtonActive]}
                    >
                      <Text style={[styles.tabButtonText, activeTab === 'PRICE' && styles.tabButtonTextActive]}>PRICE HISTORY</Text>
                    </Pressable>
                    <Pressable 
                      onPress={() => setActiveTab('MOVEMENT')}
                      style={[styles.tabButton, activeTab === 'MOVEMENT' && styles.tabButtonActive]}
                    >
                      <Text style={[styles.tabButtonText, activeTab === 'MOVEMENT' && styles.tabButtonTextActive]}>STOCK LEDGER</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            }
            renderItem={({ item: row, index }: any) => {
              if (activeTab === "PRICE") {
                return (
                  <View style={styles.historyRow}>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyTitle}>{row.recordNumber}</Text>
                      <Text style={styles.historySubtitle}>
                        {row.customer?.name ?? "Walk-in"} • Qty: {row.quantity}
                      </Text>
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={styles.historyPrice}>{money(row.rate)}</Text>
                      <Text style={styles.historyDate}>
                        {new Date(row.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  </View>
                );
              } else {
                const isIn = Number(row.quantityIn) > 0;
                const movementQty = isIn ? Number(row.quantityIn) : Number(row.quantityOut);
                const color = isIn ? colors.success : colors.danger;
                return (
                  <View style={styles.historyRow}>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyTitle}>{row.reason || row.movementType}</Text>
                      <Text style={styles.historySubtitle}>
                        By {row.createdBy?.name || "System"} • {row.movementType}
                      </Text>
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={[styles.historyPrice, { color }]}>
                        {isIn ? "+" : "-"}{movementQty} {item.unit}
                      </Text>
                      <Text style={styles.historyDate}>
                        {new Date(row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  </View>
                );
              }
            }}
            estimatedItemSize={100}
            ListEmptyComponent={
              <EmptyState 
                icon={activeTab === "PRICE" ? "tag-outline" : "history"} 
                title="No records found" 
              />
            }
            contentContainerStyle={styles.detailListContent}
          />
        ) : (
          <SkeletonList count={5} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listWrapper: {
    flex: 1,
  },
  headerComponent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  statsScroll: {
    gap: spacing.md,
    paddingVertical: 4,
    paddingRight: spacing.lg,
  },
  statCard: {
    width: 140,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 16,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 4,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
    height: 44,
    justifyContent: 'center',
  },
  searchInput: {
    fontSize: 14,
  },
  filterChipsRow: {
    paddingVertical: 4,
    paddingRight: spacing.lg,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderColor: '#6366f1',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#6366f1',
  },
  listContent: {
    paddingBottom: 130, // Clears the floating bottom tab bar and the FAB safely
    paddingHorizontal: spacing.lg,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  itemCardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  itemCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemAvatarText: {
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  itemDetails: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  itemStockCount: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemStockValue: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  stockPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stockPillText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  itemActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceOffset,
  },
  priceContainer: {
    gap: 2,
  },
  cardDivider: {
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  priceValue: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  priceValueMrp: {
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  fab: {
    position: 'absolute',
    bottom: 104, // Hover safely above floating bottom tab capsule (68 height + 20 bottom offset)
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
    zIndex: 10,
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  formCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
  },
  disabledInput: {
    backgroundColor: colors.surfaceOffset,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  formFooter: {
    paddingVertical: spacing.xl,
  },
  errorText: {
    color: colors.danger,
    padding: spacing.lg,
    textAlign: 'center',
  },
  detailCard: {
    margin: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  detailHeaderValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  divider: {
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  detailStats: {
    gap: spacing.md,
  },
  detailStatItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statSubLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.sm,
  },
  statSubValue: {
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  detailActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  historyInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  historyTitle: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  historySubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  historyPrice: {
    fontWeight: fontWeight.black,
    color: colors.primary,
    fontSize: fontSize.md,
  },
  historyDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  detailListContent: {
    paddingBottom: 40,
  },
  // Tab headers for ItemDetail
  tabBarContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.lg,
  },
  tabButton: {
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  tabButtonTextActive: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
});
