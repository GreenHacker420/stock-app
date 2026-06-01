import React, { useMemo, useState, memo } from "react";
import { Pressable, View, StyleSheet, ActivityIndicator } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Divider, Icon, Searchbar, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { 
  createItem, 
  fetchCurrentStock, 
  fetchItemPriceHistory, 
  fetchItemStock, 
  fetchItems, 
  Item, 
  updateItem, 
  fetchStockMovements,
  CreateItemPayload,
  UpdateItemPayload
} from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { Screen } from "../../components/Screen";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

const ItemCard = memo(({ item, stock, onPress }: { item: Item, stock: number, onPress: () => void }) => {
  const isLow = stock <= Number(item.minimumStock ?? 0);
  
  return (
    <Pressable 
      onPress={onPress} 
      style={({ pressed }) => [
        styles.itemCard,
        pressed && styles.itemCardPressed
      ]}
    >
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleContainer}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemSubtitle}>
            {item.sku || "No SKU"} • {item.unit} • {item.category?.name ?? "Uncategorised"}
          </Text>
        </View>
        <StatusPill label={isLow ? "LOW" : "OK"} tone={isLow ? "red" : "green"} />
      </View>
      <View style={styles.itemFooter}>
        <Text style={styles.stockLabel}>Stock: <Text style={styles.stockValue}>{stock}</Text></Text>
        <Text style={styles.priceLabel}>Default: <Text style={styles.priceValue}>{money(item.defaultSellingPrice)}</Text></Text>
      </View>
    </Pressable>
  );
}, (prev, next) => prev.item.id === next.item.id && prev.stock === next.stock && prev.item.name === next.item.name && prev.item.defaultSellingPrice === next.item.defaultSellingPrice);

export function ItemList() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [filter, setFilter] = useState("ALL");

  const itemsQuery = useQuery({
    queryKey: ["items", activeShopId, debouncedSearch],
    queryFn: () => fetchItems(token ?? "", activeShopId ?? "", { search: debouncedSearch }),
    enabled: !!token && !!activeShopId,
  });

  const stockQuery = useQuery({
    queryKey: ["stock", activeShopId],
    queryFn: () => fetchCurrentStock(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const stockByItem = useMemo(() => new Map((stockQuery.data ?? []).map((row) => [row.item.id, row.currentQuantity])), [stockQuery.data]);
  
  const filteredData = useMemo(() => {
    const data = itemsQuery.data?.items ?? [];
    if (filter === "LOW") {
      return data.filter(item => (stockByItem.get(item.id) ?? 0) <= Number(item.minimumStock ?? 0));
    }
    return data;
  }, [itemsQuery.data, filter, stockByItem]);

  const lowStockCount = useMemo(() => {
    return (itemsQuery.data?.items ?? []).filter((item) => (stockByItem.get(item.id) ?? 0) <= Number(item.minimumStock ?? 0)).length;
  }, [itemsQuery.data, stockByItem]);

  if (itemsQuery.isError) {
    return (
      <Screen>
        <AppHeader title="Inventory Management" />
        <EmptyState 
          icon="⚠️" 
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
          <FlashList
            data={filteredData}
            estimatedItemSize={96}
            keyExtractor={(item) => item.id}
            onRefresh={() => itemsQuery.refetch()}
            refreshing={itemsQuery.isFetching}
            ListHeaderComponent={
              <View style={styles.headerComponent}>
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Items</Text>
                    <Text style={styles.statValue}>{itemsQuery.data?.total ?? 0}</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={[styles.statLabel, { color: colors.danger }]}>Low Stock</Text>
                    <Text style={[styles.statValue, { color: colors.danger }]}>{lowStockCount}</Text>
                  </View>
                </View>

                <Searchbar 
                  value={search} 
                  onChangeText={setSearch} 
                  placeholder="Search item or SKU" 
                  style={styles.searchBar} 
                  inputStyle={styles.searchInput}
                />
                
                <SegmentedButtons 
                  value={filter} 
                  onValueChange={setFilter} 
                  buttons={[
                    { value: "ALL", label: "All Items" }, 
                    { value: "LOW", label: "Low Stock" }
                  ]} 
                  style={styles.segmentedButtons}
                />
              </View>
            }
            renderItem={({ item }) => (
              <ItemCard 
                item={item} 
                stock={stockByItem.get(item.id) ?? 0} 
                onPress={() => (navigation as any).navigate("ItemDetail", { itemId: item.id })}
              />
            )}
            ListEmptyComponent={
              itemsQuery.isLoading ? (
                <SkeletonList count={8} itemHeight={96} />
              ) : (
                <EmptyState 
                  icon="📦" 
                  title="No items found" 
                  subtitle="Try a different search term or add a new item." 
                />
              )
            }
            contentContainerStyle={styles.listContent}
          />
        </View>

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
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const route = useRoute();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
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

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CreateItemPayload = {
        shopId: activeShopId ?? "",
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        unit: form.unit.trim(),
        defaultSellingPrice: Number(form.defaultSellingPrice || 0),
        minimumStock: Number(form.minimumStock || 0),
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        mrp: form.mrp ? Number(form.mrp) : undefined,
      };
      return item ? updateItem(token ?? "", item.id, payload as UpdateItemPayload) : createItem(token ?? "", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", activeShopId] });
      navigation.goBack();
    },
  });

  const stockQuery = useQuery({
    queryKey: ["item-stock", item?.id],
    queryFn: () => fetchItemStock(token ?? "", item?.id ?? ""),
    enabled: !!token && !!item?.id,
  });
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
            onPress={() => mutation.mutate()} 
            loading={mutation.isPending} 
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
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const navigation = useNavigation();
  const itemId = (useRoute().params as { itemId?: string } | undefined)?.itemId;

  const stockQuery = useQuery({
    queryKey: ["item-stock", itemId],
    queryFn: () => fetchItemStock(token ?? "", itemId ?? ""),
    enabled: !!token && !!itemId,
  });

  const historyQuery = useQuery({
    queryKey: ["item-price-history", itemId],
    queryFn: () => fetchItemPriceHistory(token ?? "", itemId ?? ""),
    enabled: !!token && !!itemId,
  });

  const movementsQuery = useQuery({
    queryKey: ["item-movements", activeShopId, itemId],
    queryFn: () => fetchStockMovements(token ?? "", activeShopId ?? "", itemId),
    enabled: !!token && !!activeShopId && !!itemId,
  });

  const [activeTab, setActiveTab] = useState("PRICE");

  const item = (stockQuery.data as any)?.item;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <AppHeader title={item?.name ?? "Item Detail"} subtitle="Stock and price settings." />
        {!itemId ? <Text style={styles.errorText}>Missing item id.</Text> : null}
        
        {item ? (
          <FlashList
            data={activeTab === "PRICE" ? ((historyQuery.data as any)?.rows ?? []) : (movementsQuery.data ?? [])}
            estimatedItemSize={72}
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

                <SegmentedButtons
                  value={activeTab}
                  onValueChange={setActiveTab}
                  buttons={[
                    { value: "PRICE", label: "Price History", icon: "trending-up" },
                    { value: "MOVEMENT", label: "Stock Ledger", icon: "history" },
                  ]}
                  style={styles.detailTabs}
                  theme={{ colors: { primary: colors.primary } }}
                />
              </>
            }
            renderItem={({ item: row, index }) => {
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
                const qty = isIn ? Number(row.quantityIn) : Number(row.quantityOut);
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
                        {isIn ? "+" : "-"}{qty} {item.unit}
                      </Text>
                      <Text style={styles.historyDate}>
                        {new Date(row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  </View>
                );
              }
            }}
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
  },
  listWrapper: {
    flex: 1,
  },
  headerComponent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  statValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
  segmentedButtons: {
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingBottom: 100,
    paddingHorizontal: spacing.lg,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 96,
  },
  itemCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  itemTitleContainer: {
    flex: 1,
  },
  itemName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  itemSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  stockLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  stockValue: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  priceLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  priceValue: {
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
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
  detailTabs: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
  }
});
