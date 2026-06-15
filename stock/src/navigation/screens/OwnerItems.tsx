import React, { useMemo, useState, memo, useCallback } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator, TouchableWithoutFeedback, Modal as RNModal } from "react-native";
import { Searchbar, Divider, Text, Icon, SegmentedButtons, TextInput } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "@react-navigation/native";

import { 
  fetchItems, 
  Item, 
  StockLevel 
} from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useItemsQuery, useCreateItemMutation, useUpdateItemMutation, useItemStockQuery, useItemPriceHistoryQuery, useItemPriceChangeHistoryQuery, useStockMovementsQuery } from "../../hooks/useItems";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

const getAvatarColor = (name: string) => {
  const colorsList = [
    { bg: "#eff6ff", text: "#2563eb" }, // Blue
    { bg: "#ecfdf5", text: "#059669" }, // Emerald
    { bg: "#fef3c7", text: "#d97706" }, // Amber
    { bg: "#faf5ff", text: "#7c3aed" }, // Violet
    { bg: "#fff1f2", text: "#e11d48" }, // Rose
    { bg: "#f0fdfa", text: "#0d9488" }, // Teal
  ];
  const charCodeSum = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colorsList[charCodeSum % colorsList.length];
};

const ItemCard = memo(({ 
  item, 
  stock, 
  onEdit, 
  onManageStock, 
  onPress 
}: { 
  item: Item, 
  stock: number, 
  onEdit: () => void, 
  onManageStock: () => void, 
  onPress: () => void 
}) => {
  const isLow = stock <= Number(item.minimumStock);
  const isOut = stock <= 0;
  const avatarColors = getAvatarColor(item.name);
  const leftBorderColor = isOut ? colors.danger : isLow ? colors.warning : colors.success;

  return (
    <Pressable 
      onPress={onPress}
      style={({ pressed }) => [
        styles.itemCard,
        { borderLeftWidth: 5, borderLeftColor: leftBorderColor },
        pressed && styles.itemCardPressed
      ]}
    >
      <View style={styles.itemCardRow}>
        <View style={[styles.itemAvatar, { backgroundColor: avatarColors.bg }]}>
          <Text style={[styles.itemAvatarText, { color: avatarColors.text }]}>{item.name[0].toUpperCase()}</Text>
        </View>
        <View style={styles.itemDetails}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemSubtitle}>{item.sku || "No SKU"} • {item.unit}</Text>
          <View style={styles.itemStockCountContainer}>
            <Text style={styles.itemStockCount}>
              Stock: <Text style={[styles.itemStockValue, { color: leftBorderColor }]}>{stock} {item.unit}</Text>
            </Text>
            {item.minimumStock ? (
              <Text style={styles.minStockText}>Min: {item.minimumStock}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.itemActions}>
           <StatusPill 
             label={isOut ? "OUT" : isLow ? "LOW" : "OK"} 
             tone={isOut ? "red" : isLow ? "amber" : "green"} 
           />
           <Pressable onPress={onEdit} style={styles.actionButton}>
              <Icon source="pencil-outline" size={18} color={colors.textSecondary} />
           </Pressable>
        </View>
      </View>
      
      <View style={styles.itemFooterGrid}>
         <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>Selling Price</Text>
            <Text style={styles.priceValue}>{money(item.defaultSellingPrice)}</Text>
         </View>
         <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>MRP</Text>
            <Text style={styles.priceValueMrp}>{money(item.mrp)}</Text>
         </View>
         {item.minimumAllowedPrice ? (
           <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>Min Price</Text>
              <Text style={styles.priceValueMin}>{money(item.minimumAllowedPrice)}</Text>
           </View>
         ) : null}
         <Button 
            variant="ghost" 
            label="Restock" 
            onPress={onManageStock}
            icon={<Icon source="plus-box-outline" size={16} color={colors.primary} />}
            style={styles.restockButton}
         />
      </View>
    </Pressable>
  );
});

export function ItemList() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [filter, setFilter] = useState<"ALL" | "LOW" | "OUT">("ALL");

  const itemsQuery = useItemsQuery({ search: debouncedSearch, limit: 20 });
  const stockQuery = useQuery({
    queryKey: ["all-stock", activeShopId],
    queryFn: () => fetchItems(token ?? "", activeShopId ?? ""),
    enabled: !!activeShopId && !!token,
  });

  const stockByItem = useMemo(() => {
    const map = new Map<string, number>();
    (stockQuery.data as any)?.items?.forEach((i: any) => {
       map.set(i.id, i.currentStock || 0);
    });
    return map;
  }, [stockQuery.data]);

  const filteredItems = useMemo(() => {
    const all = itemsQuery.data?.items ?? [];
    if (filter === "ALL") return all;
    return all.filter(item => {
       const stock = stockByItem.get(item.id) ?? 0;
       if (filter === "OUT") return stock <= 0;
       if (filter === "LOW") return stock <= Number(item.minimumStock) && stock > 0;
       return true;
    });
  }, [itemsQuery.data, filter, stockByItem]);

  const totalCount = itemsQuery.data?.total ?? 0;
  const outOfStockCount = Array.from(stockByItem.values()).filter(v => v <= 0).length;
  const lowStockCount = (stockQuery.data as any)?.items?.filter((i: any) => i.currentStock > 0 && i.currentStock <= Number(i.minimumStock)).length || 0;
  const totalStockValue = (stockQuery.data as any)?.items?.reduce((sum: number, i: any) => sum + ((i.currentStock || 0) * Number(i.defaultSellingPrice || 0)), 0) || 0;

  const List = FlashList as any;

  return (
    <Screen edges={['top', 'left', 'right']} scroll={false}>
      <AppHeader title="Products Catalog" subtitle="Inventory management and pricing" />
      
      <View style={styles.container}>
        <View style={styles.listWrapper}>
          <List
            data={filteredItems}
            keyExtractor={(item: Item) => item.id}
            estimatedItemSize={160}
            onRefresh={itemsQuery.refetch}
            refreshing={itemsQuery.isFetching}
            ListHeaderComponent={
              <View style={styles.headerComponent}>
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
                onEdit={() => navigate("AddEditItem", { item })}
                onManageStock={() => navigate("StockEntry", { itemId: item.id })}
                onPress={() => navigate("ItemDetail", { itemId: item.id })}
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

        <Pressable 
          style={styles.fab} 
          onPress={() => navigate("AddEditItem")}
        >
          <Icon source="plus" size={28} color={colors.textInverse} />
        </Pressable>
      </View>
    </Screen>
  );
}

export function AddEditItem() {
  const route = useRoute();
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
    stock: "0",
  });

  const createMutation = useCreateItemMutation();
  const updateMutation = useUpdateItemMutation();

  const handleSave = () => {
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      unit: form.unit.trim(),
      defaultSellingPrice: Number(form.defaultSellingPrice || 0),
      minimumAllowedPrice: form.minimumAllowedPrice.trim() ? Number(form.minimumAllowedPrice) : null,
      minimumStock: Number(form.minimumStock || 0),
      purchasePrice: form.purchasePrice.trim() ? Number(form.purchasePrice) : null,
      mrp: form.mrp.trim() ? Number(form.mrp) : null,
    };

    if (item) {
      updateMutation.mutate({ 
        id: item.id, 
        data: { ...payload, adjustmentStock: Number(form.stock) } 
      }, {
        onSuccess: () => goBack()
      });
    } else {
      createMutation.mutate({ 
        ...payload, 
        initialStock: Number(form.stock) 
      } as any, {
        onSuccess: () => goBack()
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const stockQuery = useItemStockQuery(item?.id);
  const currentQuantity = (stockQuery.data as any)?.currentQuantity ?? 0;

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader 
        title={item ? "Edit Item" : "Add Item"} 
        subtitle="Maintain item catalog and prices." 
        fallbackRoute="ItemList"
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
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
              <TextInput 
                mode="outlined" 
                label={item ? "Stock Adjustment (+ to add, - to sub)" : "Opening Stock"} 
                keyboardType="numeric" 
                value={form.stock} 
                onChangeText={(v) => set("stock", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                placeholder={item ? "e.g. 10 or -5" : "e.g. 100"}
              />
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
      </ScrollView>
    </Screen>
  );
}

export function ItemDetail() {
  const List = FlashList as any;
  const activeShopId = useShopStore((state) => state.activeShopId);
  const itemId = (useRoute<any>().params as { itemId?: string } | undefined)?.itemId;

  const stockQuery = useItemStockQuery(itemId);
  const historyQuery = useItemPriceHistoryQuery(itemId);
  const priceChangeQuery = useItemPriceChangeHistoryQuery(itemId);
  const movementsQuery = useStockMovementsQuery(itemId);

  const [activeTab, setActiveTab] = useState("PRICE");
  const [priceTab, setPriceTab] = useState("PURCHASE");
  const [selectedMovement, setSelectedMovement] = useState<any>(null);

  const item = (stockQuery.data as any)?.item;

  const renderMovementDetail = () => {
    if (!selectedMovement) return null;
    const m = selectedMovement;
    const isIn = Number(m.quantityIn) > 0;
    
    return (
      <RNModal visible={!!selectedMovement} transparent animationType="fade" onRequestClose={() => setSelectedMovement(null)}>
        <TouchableWithoutFeedback onPress={() => setSelectedMovement(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Movement Details</Text>
                  <Pressable onPress={() => setSelectedMovement(null)}>
                    <Icon source="close" size={24} color={colors.textSecondary} />
                  </Pressable>
                </View>
                
                <View style={styles.modalBody}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Type</Text>
                    <Text style={styles.modalValue}>{m.movementType}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Quantity</Text>
                    <Text style={[styles.modalValue, { color: isIn ? colors.success : colors.danger }]}>
                      {isIn ? "+" : "-"}{isIn ? m.quantityIn : m.quantityOut} {item?.unit}
                    </Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Reason</Text>
                    <Text style={styles.modalValue}>{m.reason || "No reason provided"}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Created By</Text>
                    <Text style={styles.modalValue}>{m.createdBy?.name || "System"}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Date</Text>
                    <Text style={styles.modalValue}>{new Date(m.createdAt).toLocaleString()}</Text>
                  </View>

                  {m.sale && (
                    <Button 
                      variant="secondary" 
                      label={`View Sale ${m.sale.saleNumber}`} 
                      onPress={() => {
                        setSelectedMovement(null);
                        navigate("SaleDetail", { id: m.sale.id });
                      }}
                      style={{ marginTop: spacing.md }}
                    />
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>
    );
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <AppHeader 
          title={item?.name ?? "Item Detail"} 
          subtitle="Stock and price settings." 
          fallbackRoute="ItemList"
        />
        {!itemId ? <Text style={styles.errorText}>Missing item id.</Text> : null}
        
        {item ? (
          <List
            data={activeTab === "PRICE" ? (priceTab === 'PURCHASE' ? ((historyQuery.data as any)?.rows ?? []) : (priceChangeQuery.data ?? [])) : (movementsQuery.data ?? [])}
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
                      <Text style={styles.statSubValue}>
                        {item.minimumAllowedPrice && Number(item.minimumAllowedPrice) > 0 
                          ? money(item.minimumAllowedPrice) 
                          : "Not set"}
                      </Text>
                    </View>
                    <View style={styles.detailStatItem}>
                      <Text style={styles.statSubLabel}>MRP</Text>
                      <Text style={styles.statSubValue}>
                        {item.mrp && Number(item.mrp) > 0 
                          ? money(item.mrp) 
                          : "Not set"}
                      </Text>
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
                    onPress={() => navigate("AddEditItem", { item })}
                    style={{ flex: 1 }}
                  />
                  <Button 
                    label="Manage Stock" 
                    icon={<Icon source="warehouse" size={20} color={colors.textInverse} />} 
                    onPress={() => navigate("StockEntry", { itemId: item.id })}
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

                {activeTab === 'PRICE' && (
                  <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}>
                    <SegmentedButtons
                      value={priceTab}
                      onValueChange={setPriceTab}
                      buttons={[
                        { value: 'PURCHASE', label: 'Sale Rates' },
                        { value: 'MANUAL', label: 'Price Updates' },
                      ]}
                      style={styles.segmentedBtn}
                      theme={{ colors: { primary: colors.primary } }}
                    />
                  </View>
                )}
              </>
            }
            renderItem={({ item: row, index }: any) => {
              if (activeTab === "PRICE") {
                if (priceTab === 'PURCHASE') {
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
                  return (
                    <View style={styles.historyRow}>
                      <View style={styles.historyInfo}>
                        <Text style={styles.historyTitle}>{row.priceType} Price Updated</Text>
                        <Text style={styles.historySubtitle}>
                          By {row.changedBy?.name || "System"} • Prev: {money(row.oldPrice)}
                        </Text>
                      </View>
                      <View style={styles.historyRight}>
                        <Text style={styles.historyPrice}>{money(row.newPrice)}</Text>
                        <Text style={styles.historyDate}>
                          {new Date(row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    </View>
                  );
                }
              } else {
                const isIn = Number(row.quantityIn) > 0;
                const movementQty = isIn ? Number(row.quantityIn) : Number(row.quantityOut);
                const color = isIn ? colors.success : colors.danger;
                const refLabel = row.sale ? `Sale ${row.sale.saleNumber}` : (row.deliveryMemo ? `DM ${row.deliveryMemo.dmNumber}` : (row.order ? `Order ${row.order.orderNumber}` : null));

                return (
                  <Pressable onPress={() => setSelectedMovement(row)}>
                    <View style={styles.historyRow}>
                      <View style={styles.historyInfo}>
                        <Text style={styles.historyTitle}>{refLabel || row.reason || row.movementType}</Text>
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
                  </Pressable>
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
      {renderMovementDetail()}
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
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.primary,
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
  itemStockCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  minStockText: {
    fontSize: 10,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  priceContainer: {
    gap: 2,
  },
  itemFooterGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  priceValueMin: {
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  restockButton: {
    paddingHorizontal: spacing.sm,
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
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    ...shadow.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  modalBody: {
    gap: spacing.md,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  modalLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  modalValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    flex: 1.5,
    textAlign: 'right',
  },
  segmentedBtn: {
    marginBottom: spacing.md,
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
