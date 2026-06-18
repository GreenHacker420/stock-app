import React, { useMemo, useState, memo } from "react";
import { View, StyleSheet, Pressable, ScrollView, TouchableWithoutFeedback, Modal as RNModal } from "react-native";
import { Searchbar, Divider, Text, Icon, SegmentedButtons, TextInput } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { 
  fetchItems, 
  Item 
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

const formatItemName = (name: string) => {
  return name
    .split(/\s+/)
    .map(word => {
      if (!word) return "";
      if (
        /^\d/.test(word) ||
        ["SKU", "RC", "N/A", "3D", "103D", "1043D", "104A/1104", "1053", "109/1710", "MTR", "HDMI", "USB", "RAM", "SSD"].includes(
          word.toUpperCase()
        )
      ) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
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
  const statusColor = isOut ? colors.danger : isLow ? colors.warning : colors.success;

  return (
    <Pressable 
      onPress={onPress}
      style={styles.cardPressable}
    >
      {({ pressed }) => (
        <View style={[
          styles.itemCard,
          { borderLeftWidth: 5, borderLeftColor: statusColor },
          pressed && styles.itemCardPressed
        ]}>
          <View style={styles.itemCardRow}>
            <View style={styles.itemDetails}>
              <Text style={styles.itemName} numberOfLines={1}>{formatItemName(item.name)}</Text>
              <Text style={styles.itemSubtitle}>{item.sku ? `SKU: ${item.sku}` : "No SKU"} • {item.unit}</Text>
              
              <View style={styles.itemStockCountContainer}>
                <Text style={styles.itemStockCount}>
                  Stock: <Text style={[styles.itemStockValue, { color: statusColor, fontSize: 13, fontWeight: fontWeight.extrabold }]}>{stock} {item.unit}</Text>
                </Text>
                {item.minimumStock ? (
                  <Text style={styles.minStockText}>Alert Min: {item.minimumStock}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.itemActions}>
               <StatusPill 
                 label={isOut ? "OUT OF STOCK" : isLow ? "LOW STOCK" : "IN STOCK"} 
                 tone={isOut ? "red" : isLow ? "amber" : "green"} 
               />
               <Pressable 
                 onPress={() => {
                   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                   onEdit();
                 }} 
                 style={[styles.actionButton, { backgroundColor: colors.surfaceOffset }]}
               >
                  <Icon source="pencil-outline" size={16} color={colors.textSecondary} />
               </Pressable>
            </View>
          </View>
          
          <View style={styles.itemFooterRow}>
             <View style={styles.priceRow}>
                <Text style={styles.priceText}>
                  Sell: <Text style={styles.priceBold}>{money(item.defaultSellingPrice)}</Text>
                </Text>
                <Text style={styles.priceDivider}>•</Text>
                <Text style={styles.priceText}>
                  MRP: <Text style={styles.priceValue}>{money(item.mrp)}</Text>
                </Text>
                {item.minimumAllowedPrice ? (
                  <>
                    <Text style={styles.priceDivider}>•</Text>
                    <Text style={styles.priceText}>
                      Min: <Text style={[styles.priceValue, { color: colors.warning }]}>{money(item.minimumAllowedPrice)}</Text>
                    </Text>
                  </>
                ) : null}
             </View>
             <Pressable 
               onPress={() => {
                 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                 onManageStock();
               }} 
               style={styles.restockButton}
             >
                <Icon source="plus" size={14} color={colors.primary} />
                <Text style={styles.restockButtonText}>RESTOCK</Text>
             </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
});

export function ItemList() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [filter, setFilter] = useState<"ALL" | "LOW" | "OUT">("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const itemsQuery = useItemsQuery({ search: debouncedSearch, limit: 20 });
  const stockQuery = useQuery({
    queryKey: ["all-stock", activeShopId],
    queryFn: () => fetchItems(token ?? "", activeShopId ?? "", { limit: 1000 }),
    enabled: !!activeShopId && !!token,
  });

  const stockByItem = useMemo(() => {
    const map = new Map<string, number>();
    (stockQuery.data as any)?.items?.forEach((i: any) => {
       map.set(i.id, i.currentStock || 0);
    });
    return map;
  }, [stockQuery.data]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    (stockQuery.data as any)?.items?.forEach((i: any) => {
      if (i.category) {
        map.set(i.category.id, i.category);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [stockQuery.data]);

  const filteredItems = useMemo(() => {
    let all = itemsQuery.data?.items ?? [];
    
    // If search is empty, browse using stockQuery (which fetches up to 1000 items)
    // so we don't truncate category lists or browse lists to just 20 items.
    if (!debouncedSearch.trim() && (stockQuery.data as any)?.items) {
      all = (stockQuery.data as any).items;
    }

    let result = all.filter(item => {
       const stock = stockByItem.get(item.id) ?? 0;
       if (filter === "OUT") return stock <= 0;
       if (filter === "LOW") return stock <= Number(item.minimumStock) && stock > 0;
       return true;
    });

    if (selectedCategory) {
      result = result.filter(item => item.category?.id === selectedCategory);
    }

    return result;
  }, [itemsQuery.data, stockQuery.data, debouncedSearch, filter, stockByItem, selectedCategory]);

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
            onRefresh={() => {
              itemsQuery.refetch();
              stockQuery.refetch();
            }}
            refreshing={itemsQuery.isFetching || stockQuery.isFetching}
            ListHeaderComponent={
              <View style={styles.headerComponent}>
                
                {/* Premium Integrated Dashboard Summary Card */}
                <View style={styles.statsContainer}>
                  <View style={styles.statsMainRow}>
                    <View style={styles.statsMainCol}>
                      <Text style={styles.statsMainLabel}>TOTAL INVENTORY VALUE</Text>
                      <Text style={styles.statsMainValue}>{money(totalStockValue)}</Text>
                    </View>
                    <View style={[styles.statsIconBadge, { backgroundColor: colors.primaryLight }]}>
                      <Icon source="currency-inr" size={24} color={colors.primaryDark} />
                    </View>
                  </View>
                  
                  <Divider style={styles.statsDivider} />
                  
                  <View style={styles.statsGrid}>
                    <View style={styles.statsItem}>
                      <Text style={styles.statsItemLabel}>CATALOG SIZE</Text>
                      <Text style={styles.statsItemValue}>{totalCount} Items</Text>
                    </View>
                    <View style={styles.statsItemDivider} />
                    <View style={styles.statsItem}>
                      <Text style={[styles.statsItemLabel, outOfStockCount > 0 && { color: colors.danger }]}>OUT OF STOCK</Text>
                      <Text style={[styles.statsItemValue, outOfStockCount > 0 && { color: colors.danger }]}>{outOfStockCount}</Text>
                    </View>
                    <View style={styles.statsItemDivider} />
                    <View style={styles.statsItem}>
                      <Text style={[styles.statsItemLabel, lowStockCount > 0 && { color: colors.warning }]}>LOW STOCK</Text>
                      <Text style={[styles.statsItemValue, lowStockCount > 0 && { color: colors.warning }]}>{lowStockCount}</Text>
                    </View>
                  </View>
                </View>

                {/* Sleek Search Console */}
                <Searchbar 
                  value={search} 
                  onChangeText={(text) => {
                    setSearch(text);
                    if (text.trim() !== "") {
                      setSelectedCategory(null); // Clear category filter when searching on backend
                    }
                  }} 
                  placeholder="Search item name or SKU..." 
                  style={styles.searchBar} 
                  inputStyle={styles.searchInput}
                  iconColor={colors.textSecondary}
                />
                
                {/* Category Filter Chips */}
                {categories.length > 0 && (
                  <View style={styles.categoryChipsOuter}>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false} 
                      contentContainerStyle={styles.categoryChipsRow}
                    >
                      <Pressable 
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedCategory(null);
                        }}
                        style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
                      >
                        <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>
                          All Categories
                        </Text>
                      </Pressable>

                      {categories.map((cat) => {
                        const isSelected = selectedCategory === cat.id;
                        return (
                          <Pressable 
                            key={cat.id}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setSelectedCategory(cat.id);
                              setSearch(""); // Clear search when switching categories to browse category items
                            }}
                            style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                          >
                            <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}>
                              {cat.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Visual Active Filter Chips */}
                <View style={styles.filterOuterContainer}>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.filterChipsRow}
                  >
                    <Pressable 
                      onPress={() => setFilter("ALL")} 
                      style={[styles.filterChip, filter === "ALL" && styles.filterChipActive]}
                    >
                      <Icon source="package-variant" size={14} color={filter === "ALL" ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.filterChipText, filter === "ALL" && styles.filterChipTextActive]}>Total Stock</Text>
                    </Pressable>

                    <Pressable 
                      onPress={() => setFilter("OUT")} 
                      style={[styles.filterChip, filter === "OUT" && styles.filterChipActive]}
                    >
                      <Icon source="close-circle-outline" size={14} color={filter === "OUT" ? colors.danger : colors.textSecondary} />
                      <Text style={[styles.filterChipText, filter === "OUT" && styles.filterChipTextActive]}>Out of Stock</Text>
                    </Pressable>

                    <Pressable 
                      onPress={() => setFilter("LOW")} 
                      style={[styles.filterChip, filter === "LOW" && styles.filterChipActive]}
                    >
                      <Icon source="alert-circle-outline" size={14} color={filter === "LOW" ? colors.warning : colors.textSecondary} />
                      <Text style={[styles.filterChipText, filter === "LOW" && styles.filterChipTextActive]}>Low Stock</Text>
                    </Pressable>
                  </ScrollView>
                </View>
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
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]} 
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
          
          <Section title="Basic details">
            <View style={styles.formCard}>
              {item && (
                <TextInput
                  mode="outlined"
                  label="Current Stock"
                  value={`${currentQuantity} ${item.unit}`}
                  disabled
                  style={styles.disabledInput}
                  outlineStyle={styles.inputOutline}
                  left={<TextInput.Icon icon="warehouse" color={colors.textSecondary} />}
                />
              )}
              <TextInput 
                mode="outlined" 
                label="Name" 
                value={form.name} 
                onChangeText={(v) => set("name", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                left={<TextInput.Icon icon="pencil-outline" color={colors.primary} />}
              />
              <TextInput 
                mode="outlined" 
                label="SKU / Barcode" 
                value={form.sku ?? ""} 
                onChangeText={(v) => set("sku", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                left={<TextInput.Icon icon="barcode-scan" color={colors.textSecondary} />}
              />
              <TextInput 
                mode="outlined" 
                label="Unit of Measurement" 
                value={form.unit} 
                onChangeText={(v) => set("unit", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                left={<TextInput.Icon icon="weight-kilogram" color={colors.textSecondary} />}
              />
              <TextInput 
                mode="outlined" 
                label={item ? "Stock Adjustment (+ to add, - to sub)" : "Opening Stock"} 
                keyboardType="numeric" 
                value={form.stock} 
                onChangeText={(v) => set("stock", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                placeholder={item ? "e.g. 10 or -5" : "e.g. 100"}
                left={<TextInput.Icon icon="plus-minus-box" color={colors.textSecondary} />}
              />
              <TextInput 
                mode="outlined" 
                label="Minimum Stock Alert Level" 
                keyboardType="numeric" 
                value={form.minimumStock} 
                onChangeText={(v) => set("minimumStock", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                left={<TextInput.Icon icon="bell-ring-outline" color={colors.warning} />}
              />
            </View>
          </Section>

          <Section title="Price structure matrix">
            <View style={styles.formCard}>
              <TextInput 
                mode="outlined" 
                label="Default Selling Price" 
                keyboardType="numeric" 
                value={form.defaultSellingPrice} 
                onChangeText={(v) => set("defaultSellingPrice", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                left={<TextInput.Icon icon="currency-inr" color={colors.primary} />}
              />
              <TextInput 
                mode="outlined" 
                label="MRP" 
                keyboardType="numeric" 
                value={form.mrp} 
                onChangeText={(v) => set("mrp", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                left={<TextInput.Icon icon="tag-outline" color={colors.textSecondary} />}
              />
              <TextInput 
                mode="outlined" 
                label="Minimum Allowed Price (Limit for Staff)" 
                keyboardType="numeric" 
                value={form.minimumAllowedPrice} 
                onChangeText={(v) => set("minimumAllowedPrice", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                left={<TextInput.Icon icon="shield-alert-outline" color={colors.warning} />}
              />
              <TextInput 
                mode="outlined" 
                label="Purchase Price (Your Cost)" 
                keyboardType="numeric" 
                value={form.purchasePrice} 
                onChangeText={(v) => set("purchasePrice", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
                left={<TextInput.Icon icon="cash-register" color={colors.textSecondary} />}
              />

              <View style={styles.formTipCard}>
                <Icon source="lightbulb-on-outline" size={16} color={colors.warning} />
                <Text style={styles.formTipText}>
                  MRP is printed price. Default selling price is standard shop rate. Minimum allowed price is the lowest rate staff can sell without owner rate approvals.
                </Text>
              </View>
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
                {/* Hero Stock Dial Summary Card */}
                <View style={styles.detailHeroCard}>
                  <View style={styles.detailHeroHeader}>
                    <View style={[styles.itemAvatarLarge, { backgroundColor: getAvatarColor(item.name).bg }]}>
                      <Text style={[styles.itemAvatarLargeText, { color: getAvatarColor(item.name).text }]}>
                        {item.name[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.detailHeroTitleCol}>
                      <Text style={styles.detailHeroName}>{item.name}</Text>
                      <Text style={styles.detailHeroSku}>{item.sku ? `SKU: ${item.sku}` : "No SKU assigned"}</Text>
                    </View>
                  </View>

                  <Divider style={styles.detailDivider} />

                  <View style={styles.detailStockDialRow}>
                    <View style={styles.detailStockDialInfo}>
                      <Text style={styles.detailStockDialLabel}>CURRENT PHYSICAL STOCK</Text>
                      <Text style={[styles.detailStockDialValue, { color: (stockQuery.data as any)?.currentQuantity <= 0 ? colors.danger : ((stockQuery.data as any)?.currentQuantity <= Number(item.minimumStock)) ? colors.warning : colors.success }]}>
                        {(stockQuery.data as any)?.currentQuantity ?? 0} <Text style={styles.detailStockDialUnit}>{item.unit}</Text>
                      </Text>
                    </View>
                    <StatusPill 
                      label={(stockQuery.data as any)?.currentQuantity <= 0 ? "OUT OF STOCK" : ((stockQuery.data as any)?.currentQuantity <= Number(item.minimumStock)) ? "LOW STOCK" : "IN STOCK"} 
                      tone={(stockQuery.data as any)?.currentQuantity <= 0 ? "red" : ((stockQuery.data as any)?.currentQuantity <= Number(item.minimumStock)) ? "amber" : "green"} 
                    />
                  </View>
                </View>

                {/* Pricing Structure Grid Container */}
                <View style={styles.priceGridContainer}>
                  <Text style={styles.priceGridTitle}>PRICING STRUCTURE</Text>
                  
                  <View style={styles.priceGridRow}>
                    <View style={styles.priceGridItem}>
                      <View style={styles.priceGridIconRow}>
                        <Icon source="tag" size={14} color={colors.primary} />
                        <Text style={styles.priceGridItemLabel}>SELLING PRICE</Text>
                      </View>
                      <Text style={styles.priceGridItemValue}>{money(item.defaultSellingPrice)}</Text>
                    </View>

                    <View style={styles.priceGridItem}>
                      <View style={styles.priceGridIconRow}>
                        <Icon source="label-outline" size={14} color={colors.textSecondary} />
                        <Text style={styles.priceGridItemLabel}>MRP RATE</Text>
                      </View>
                      <Text style={styles.priceGridItemValue}>{item.mrp && Number(item.mrp) > 0 ? money(item.mrp) : "Not set"}</Text>
                    </View>
                  </View>

                  <View style={styles.priceGridRow}>
                    <View style={styles.priceGridItem}>
                      <View style={styles.priceGridIconRow}>
                        <Icon source="shield-alert-outline" size={14} color={colors.warning} />
                        <Text style={styles.priceGridItemLabel}>MIN ALLOWED PRICE</Text>
                      </View>
                      <Text style={styles.priceGridItemValue}>
                        {item.minimumAllowedPrice && Number(item.minimumAllowedPrice) > 0 
                          ? money(item.minimumAllowedPrice) 
                          : "Not set"}
                      </Text>
                    </View>

                    <View style={styles.priceGridItem}>
                      <View style={styles.priceGridIconRow}>
                        <Icon source="alert-circle-outline" size={14} color={colors.danger} />
                        <Text style={styles.priceGridItemLabel}>ALERT THRESHOLD</Text>
                      </View>
                      <Text style={styles.priceGridItemValue}>{item.minimumStock} {item.unit}</Text>
                    </View>
                  </View>
                </View>

                {/* Detail Quick Actions */}
                <View style={styles.detailActions}>
                  <Button 
                    variant="secondary" 
                    label="Edit Item" 
                    icon={<Icon source="pencil" size={20} color={colors.primary} />} 
                    onPress={() => navigate("AddEditItem", { item })}
                    style={styles.flex1}
                  />
                  <Button 
                    label="Manage Stock" 
                    icon={<Icon source="warehouse" size={20} color={colors.textInverse} />} 
                    onPress={() => navigate("StockEntry", { itemId: item.id })}
                    style={styles.flex1}
                  />
                </View>

                {/* Tabs selection */}
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
            renderItem={({ item: row }: any) => {
              if (activeTab === "PRICE") {
                if (priceTab === 'PURCHASE') {
                  return (
                    <View style={styles.timelineItemCard}>
                      <View style={[styles.timelineIconContainer, { backgroundColor: 'rgba(22, 163, 74, 0.05)' }]}>
                        <Icon source="currency-inr" size={16} color={colors.primary} />
                      </View>
                      <View style={styles.timelineBody}>
                        <View style={styles.timelineHeaderRow}>
                          <Text style={styles.timelineTitle}>{row.recordNumber || "Invoice Record"}</Text>
                          <Text style={styles.timelinePrice}>{money(row.rate)}</Text>
                        </View>
                        <View style={styles.timelineFooterRow}>
                          <Text style={styles.timelineSubText}>
                            {row.customer?.name ?? "Walk-in"} • Qty: {row.quantity} {item.unit}
                          </Text>
                          <Text style={styles.timelineDate}>
                            {new Date(row.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                } else {
                  return (
                    <View style={styles.timelineItemCard}>
                      <View style={[styles.timelineIconContainer, { backgroundColor: 'rgba(37, 99, 235, 0.05)' }]}>
                        <Icon source="update" size={16} color="#2563eb" />
                      </View>
                      <View style={styles.timelineBody}>
                        <View style={styles.timelineHeaderRow}>
                          <Text style={styles.timelineTitle}>{row.priceType} Price Updated</Text>
                          <Text style={styles.timelinePrice}>{money(row.newPrice)}</Text>
                        </View>
                        <View style={styles.timelineFooterRow}>
                          <Text style={styles.timelineSubText}>
                            By {row.changedBy?.name || "System"} • Prev: {money(row.oldPrice)}
                          </Text>
                          <Text style={styles.timelineDate}>
                            {new Date(row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                }
              } else {
                const isIn = Number(row.quantityIn) > 0;
                const movementQty = isIn ? Number(row.quantityIn) : Number(row.quantityOut);
                const color = isIn ? colors.success : colors.danger;
                const refLabel = row.sale ? `Sale ${row.sale.saleNumber}` : (row.deliveryMemo ? `DM ${row.deliveryMemo.dmNumber}` : (row.order ? `Order ${row.order.orderNumber}` : null));
                const iconName = isIn ? "arrow-down-bold-circle-outline" : "arrow-up-bold-circle-outline";
                const bgTint = isIn ? "rgba(22, 163, 74, 0.05)" : "rgba(220, 38, 38, 0.05)";

                return (
                  <Pressable onPress={() => setSelectedMovement(row)}>
                    <View style={styles.timelineItemCard}>
                      <View style={[styles.timelineIconContainer, { backgroundColor: bgTint }]}>
                        <Icon source={iconName} size={16} color={color} />
                      </View>
                      <View style={styles.timelineBody}>
                        <View style={styles.timelineHeaderRow}>
                          <Text style={styles.timelineTitle}>{refLabel || row.reason || row.movementType}</Text>
                          <Text style={[styles.timelinePrice, { color }]}>
                            {isIn ? "+" : "-"}{movementQty} {item.unit}
                          </Text>
                        </View>
                        <View style={styles.timelineFooterRow}>
                          <Text style={styles.timelineSubText}>
                            By {row.createdBy?.name || "System"} • {row.movementType}
                          </Text>
                          <Text style={styles.timelineDate}>
                            {new Date(row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </Text>
                        </View>
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
  
  // Unified dashboard summary layout
  statsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.sm,
    marginBottom: spacing.xs,
  },
  statsMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  statsMainCol: {
    gap: 4,
  },
  statsMainLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  statsMainValue: {
    fontSize: 24,
    fontWeight: fontWeight.black,
    color: colors.primary,
  },
  statsIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsItem: {
    flex: 1,
    gap: 2,
  },
  statsItemLabel: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  statsItemValue: {
    fontSize: 14,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  statsItemDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },

  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    height: 46,
    justifyContent: 'center',
    ...shadow.sm,
    elevation: 0,
  },
  searchInput: {
    fontSize: 14,
  },
  filterOuterContainer: {
    paddingVertical: 2,
  },
  filterChipsRow: {
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
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
    fontWeight: fontWeight.black,
  },
  categoryChipsOuter: {
    paddingVertical: 2,
    marginTop: spacing.xs,
  },
  categoryChipsRow: {
    gap: spacing.xs,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceOffset,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: fontWeight.black,
  },
  listContent: {
    paddingBottom: 130, // Clears bottom bar and fab
    paddingHorizontal: spacing.lg,
  },

  // Premium product card
  cardPressable: {
    borderRadius: radius.xl,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  itemCardPressed: {
    opacity: 0.85,
  },
  itemCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemAvatarText: {
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
  },
  itemDetails: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 15,
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
  },
  itemStockValue: {
    fontWeight: fontWeight.bold,
  },
  itemActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Footer pricing inside product card
  itemFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    flexWrap: 'wrap',
    flex: 1,
  },
  priceText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  priceBold: {
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  priceValue: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  priceDivider: {
    fontSize: 10,
    color: colors.textMuted,
  },
  restockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    gap: 3,
  },
  restockButtonText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.primary,
    letterSpacing: 0.5,
  },

  fab: {
    position: 'absolute',
    bottom: 104, // Hover safely above bottom capsule (68 height + 20 bottom offset)
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
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.sm,
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
  formTipCard: {
    flexDirection: 'row',
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.15)',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  formTipText: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: fontWeight.bold,
    lineHeight: 16,
    flex: 1,
  },
  formFooter: {
    paddingVertical: spacing.xl,
  },
  errorText: {
    color: colors.danger,
    padding: spacing.lg,
    textAlign: 'center',
  },

  // Premium Item Detail dashboard card styles
  detailHeroCard: {
    margin: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  detailHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemAvatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemAvatarLargeText: {
    fontSize: 22,
    fontWeight: fontWeight.extrabold,
  },
  detailHeroTitleCol: {
    flex: 1,
    gap: 2,
  },
  detailHeroName: {
    fontSize: 18,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  detailHeroSku: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  detailDivider: {
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  detailStockDialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailStockDialInfo: {
    gap: 4,
  },
  detailStockDialLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeight.black,
    fontSize: 9,
    letterSpacing: 1,
  },
  detailStockDialValue: {
    fontSize: 26,
    fontWeight: fontWeight.black,
  },
  detailStockDialUnit: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },

  // Premium grid-aligned pricing block
  priceGridContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  priceGridTitle: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  priceGridRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  priceGridItem: {
    flex: 1,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  priceGridIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priceGridItemLabel: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  priceGridItemValue: {
    fontSize: 14,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },

  detailActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },

  // Premium timeline lists styles
  timelineItemCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.sm,
  },
  timelineIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineBody: {
    flex: 1,
    gap: 4,
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  timelinePrice: {
    fontSize: 13,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
  },
  timelineFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineSubText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  timelineDate: {
    fontSize: 10,
    color: colors.textMuted,
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
    fontSize: 11,
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
  flex1: {
    flex: 1,
  },
});
