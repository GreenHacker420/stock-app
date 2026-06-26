import React, { useMemo, useState, memo, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput as RNTextInput,
  Modal as RNModal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text, Divider, Icon, TextInput } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import {
  fetchItems,
  Item,
  ItemCategory,
  CreateItemPayload,
  UpdateItemPayload,
} from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import {
  useItemsQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
  useItemStockQuery,
  useItemPriceHistoryQuery,
  useItemPriceChangeHistoryQuery,
  useStockMovementsQuery,
  useCategoriesQuery,
  useItemSummaryQuery,
} from "../../hooks/useItems";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const money = (value?: string | number | null) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

const CAT_PALETTES = [
  { bg: "#dcfce7", icon: "#16a34a", border: "#bbf7d0" }, // emerald
  { bg: "#dbeafe", icon: "#2563eb", border: "#bfdbfe" }, // blue
  { bg: "#fef3c7", icon: "#d97706", border: "#fde68a" }, // amber
  { bg: "#fce7f3", icon: "#db2777", border: "#fbcfe8" }, // pink
  { bg: "#ede9fe", icon: "#7c3aed", border: "#ddd6fe" }, // violet
  { bg: "#ffedd5", icon: "#ea580c", border: "#fed7aa" }, // orange
  { bg: "#ccfbf1", icon: "#0d9488", border: "#99f6e4" }, // teal
  { bg: "#f0fdf4", icon: "#166534", border: "#bbf7d0" }, // forest
];

function getCatPalette(name: string) {
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return CAT_PALETTES[sum % CAT_PALETTES.length];
}

const CAT_ICONS = [
  "tag", "package-variant", "cube-outline", "basket-outline",
  "star-outline", "lightning-bolt-outline", "leaf", "fire",
];

function getCatIcon(name: string) {
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return CAT_ICONS[sum % CAT_ICONS.length];
}

function getAvatarColor(name: string) {
  const colors_list = [
    "#16a34a", "#2563eb", "#d97706", "#db2777", "#7c3aed", "#ea580c",
  ];
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors_list[sum % colors_list.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock Badge
// ─────────────────────────────────────────────────────────────────────────────
function StockBadge({ stock, min }: { stock: number; min: number }) {
  if (stock <= 0)
    return (
      <View style={[badge.pill, { backgroundColor: colors.dangerLight }]}>
        <Text style={[badge.text, { color: colors.danger }]}>OUT</Text>
      </View>
    );
  if (stock <= min)
    return (
      <View style={[badge.pill, { backgroundColor: colors.warningLight }]}>
        <Text style={[badge.text, { color: colors.warning }]}>LOW</Text>
      </View>
    );
  return (
    <View style={[badge.pill, { backgroundColor: colors.primaryLight }]}>
      <Text style={[badge.text, { color: colors.primary }]}>IN STOCK</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  text: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    letterSpacing: 0.6,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Item Card
// ─────────────────────────────────────────────────────────────────────────────
const ItemCard = memo(({
  item,
  stock,
  onPress,
  onEdit,
  onManageStock,
}: {
  item: Item;
  stock: number;
  onPress: () => void;
  onEdit: () => void;
  onManageStock: () => void;
}) => {
  const avatarColor = getAvatarColor(item.name);
  const minStock = Number(item.minimumStock ?? 0);
  const initials = item.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.itemCard, pressed && styles.itemCardPressed]}
    >
      {/* Avatar */}
      <View style={[styles.itemAvatar, { backgroundColor: avatarColor + "22" }]}>
        <Text style={[styles.itemAvatarText, { color: avatarColor }]}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.itemMeta}>
          {item.category && (
            <Text style={styles.itemCategory}>{item.category.name}</Text>
          )}
          {item.sku && (
            <Text style={styles.itemSku}>{item.sku}</Text>
          )}
        </View>
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemPrice}>{money(item.defaultSellingPrice)}</Text>
          <Text style={styles.itemUnit}>/ {item.unit}</Text>
          {!!item.mrp && Number(item.mrp) > Number(item.defaultSellingPrice ?? 0) ? (
            <Text style={styles.itemMrp}>{money(item.mrp)}</Text>
          ) : null}
        </View>
      </View>

      {/* Right: stock info */}
      <View style={styles.itemRight}>
        <StockBadge stock={stock} min={minStock} />
        <Text style={[
          styles.itemStockQty,
          stock <= 0 ? { color: colors.danger } :
          stock <= minStock ? { color: colors.warning } :
          { color: colors.primary }
        ]}>
          {stock}
          <Text style={styles.itemStockUnit}> {item.unit}</Text>
        </Text>
        <View style={styles.itemActions}>
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => [styles.itemActionBtn, pressed && { opacity: 0.6 }]}
          >
            <Icon source="pencil-outline" size={14} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={onManageStock}
            style={({ pressed }) => [styles.itemActionBtn, styles.itemActionBtnPrimary, pressed && { opacity: 0.6 }]}
          >
            <Icon source="plus" size={14} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Category Card (grid tile)
// ─────────────────────────────────────────────────────────────────────────────
const CategoryCard = memo(({
  category,
  itemCount,
  onPress,
}: {
  category: ItemCategory;
  itemCount: number;
  onPress: () => void;
}) => {
  const pal = getCatPalette(category.name);
  const icon = getCatIcon(category.name);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.catCard, { borderColor: pal.border }, pressed && styles.catCardPressed]}
    >
      <View style={[styles.catIconBg, { backgroundColor: pal.bg }]}>
        <Icon source={icon} size={24} color={pal.icon} />
      </View>
      <Text style={styles.catName} numberOfLines={2}>{category.name}</Text>
      <Text style={styles.catCount}>
        <Text style={[styles.catCountNum, { color: pal.icon }]}>{itemCount}</Text>
        <Text style={styles.catCountLabel}> items</Text>
      </Text>
    </Pressable>
  );
});

// All Items card
const AllItemsCard = memo(({ count, onPress }: { count: number; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.catCard, styles.catCardAll, pressed && styles.catCardPressed]}
  >
    <View style={[styles.catIconBg, { backgroundColor: colors.primaryLight }]}>
      <Icon source="package-variant-closed" size={24} color={colors.primary} />
    </View>
    <Text style={styles.catName}>All Items</Text>
    <Text style={styles.catCount}>
      <Text style={[styles.catCountNum, { color: colors.primary }]}>{count}</Text>
      <Text style={styles.catCountLabel}> total</Text>
    </Text>
  </Pressable>
));

// Uncategorised card
const UncatCard = memo(({ count, onPress }: { count: number; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.catCard, { borderColor: colors.border }, pressed && styles.catCardPressed]}
  >
    <View style={[styles.catIconBg, { backgroundColor: colors.surfaceOffset }]}>
      <Icon source="tag-off-outline" size={24} color={colors.textMuted} />
    </View>
    <Text style={styles.catName}>Uncategorised</Text>
    <Text style={styles.catCount}>
      <Text style={[styles.catCountNum, { color: colors.textSecondary }]}>{count}</Text>
      <Text style={styles.catCountLabel}> items</Text>
    </Text>
  </Pressable>
));

// ─────────────────────────────────────────────────────────────────────────────
// Search bar component
// ─────────────────────────────────────────────────────────────────────────────
function SearchBar({
  value,
  onChange,
  placeholder = "Search products…",
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.searchBar}>
      <Icon source="magnify" size={18} color={colors.textMuted} />
      <RNTextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
        autoFocus={autoFocus}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange("")}>
          <Icon source="close-circle" size={16} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock filter chips
// ─────────────────────────────────────────────────────────────────────────────
function FilterChips({
  value,
  onChange,
}: {
  value: "ALL" | "IN" | "LOW" | "OUT";
  onChange: (v: "ALL" | "IN" | "LOW" | "OUT") => void;
}) {
  const chips: { id: "ALL" | "IN" | "LOW" | "OUT"; label: string; icon: string; color: string }[] = [
    { id: "ALL", label: "All", icon: "package-variant", color: colors.primary },
    { id: "IN", label: "In Stock", icon: "check-circle-outline", color: colors.primary },
    { id: "LOW", label: "Low", icon: "alert-circle-outline", color: colors.warning },
    { id: "OUT", label: "Out", icon: "close-circle-outline", color: colors.danger },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      {chips.map((c) => {
        const active = value === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(c.id);
            }}
            style={[styles.filterChip, active && { backgroundColor: c.color + "18", borderColor: c.color }]}
          >
            <Icon source={c.icon} size={13} color={active ? c.color : colors.textMuted} />
            <Text style={[styles.filterChipText, active && { color: c.color, fontWeight: fontWeight.bold }]}>
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AddEditItem screen (modal sheet style)
// ─────────────────────────────────────────────────────────────────────────────
export function AddEditItem() {
  const route = useRoute();
  const existingItem: Item | undefined = (route.params as any)?.item;

  const categoriesQuery = useCategoriesQuery();
  const categories: ItemCategory[] = categoriesQuery.data ?? [];

  const createMutation = useCreateItemMutation();
  const updateMutation = useUpdateItemMutation();

  const [form, setForm] = useState({
    name: existingItem?.name ?? "",
    sku: existingItem?.sku ?? "",
    unit: existingItem?.unit ?? "pcs",
    defaultSellingPrice: existingItem?.defaultSellingPrice?.toString() ?? "",
    minimumAllowedPrice: existingItem?.minimumAllowedPrice?.toString() ?? "",
    mrp: existingItem?.mrp?.toString() ?? "",
    purchasePrice: existingItem?.purchasePrice?.toString() ?? "",
    minimumStock: existingItem?.minimumStock?.toString() ?? "0",
    categoryId: existingItem?.category?.id ?? "",
  });

  const [showCatPicker, setShowCatPicker] = useState(false);
  const { activeShopId } = useShopStore();

  const set = (key: string) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const selectedCat = categories.find((c) => c.id === form.categoryId);

  const handleSave = async () => {
    if (!form.name.trim() || !form.unit.trim()) return;
    const payload: CreateItemPayload = {
      shopId: activeShopId ?? "",
      name: form.name.trim(),
      unit: form.unit.trim(),
      sku: form.sku.trim() || null,
      categoryId: form.categoryId || null,
      defaultSellingPrice: form.defaultSellingPrice ? Number(form.defaultSellingPrice) : 0,
      minimumAllowedPrice: form.minimumAllowedPrice ? Number(form.minimumAllowedPrice) : null,
      mrp: form.mrp ? Number(form.mrp) : null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      minimumStock: form.minimumStock ? Number(form.minimumStock) : 0,
    };
    if (existingItem) {
      updateMutation.mutate({ id: existingItem.id, data: payload as UpdateItemPayload }, { onSuccess: () => goBack() });
    } else {
      createMutation.mutate(payload, { onSuccess: () => goBack() });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isValid = !!form.name.trim() && !!form.unit.trim();

  const inputProps = (key: string, label: string, keyboardType?: any, placeholder?: string) => ({
    mode: "outlined" as const,
    label,
    value: (form as any)[key],
    onChangeText: set(key),
    outlineStyle: styles.aeiOutline,
    style: styles.aeiInput,
    keyboardType: keyboardType ?? "default",
    placeholder,
  });

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader
        title={existingItem ? "Edit Product" : "New Product"}
        subtitle={existingItem ? "Update product details" : "Add to your catalogue"}
        fallbackRoute="ItemList"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.aeiScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Basic Info */}
          <View style={styles.aeiCard}>
            <Text style={styles.aeiSectionLabel}>PRODUCT DETAILS</Text>
            <TextInput {...inputProps("name", "Product Name *")} />
            <View style={styles.aeiRow}>
              <TextInput {...inputProps("sku", "SKU / Code")} style={[styles.aeiInput, { flex: 1 }]} />
              <TextInput {...inputProps("unit", "Unit *")} style={[styles.aeiInput, { flex: 1 }]} placeholder="pcs / kg / box" />
            </View>

            {/* Category selector */}
            <Pressable
              onPress={() => setShowCatPicker(true)}
              style={styles.catSelector}
            >
              <Icon source="tag-outline" size={18} color={selectedCat ? colors.primary : colors.textMuted} />
              <Text style={[styles.catSelectorText, !selectedCat && { color: colors.textMuted }]}>
                {selectedCat ? selectedCat.name : "Select Category (optional)"}
              </Text>
              <Icon source="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Pricing */}
          <View style={styles.aeiCard}>
            <Text style={styles.aeiSectionLabel}>PRICING</Text>
            <TextInput {...inputProps("mrp", "MRP", "numeric")} />
            <TextInput {...inputProps("defaultSellingPrice", "Selling Price", "numeric")} />
            <TextInput {...inputProps("minimumAllowedPrice", "Min Allowed Price", "numeric")} />
            <TextInput {...inputProps("purchasePrice", "Purchase / Cost Price", "numeric")} />
          </View>

          {/* Stock */}
          <View style={styles.aeiCard}>
            <Text style={styles.aeiSectionLabel}>STOCK SETTINGS</Text>
            <TextInput {...inputProps("minimumStock", "Low Stock Alert Below", "numeric")} />
            {!existingItem && (
              <View style={styles.aeiInfoTip}>
                <Icon source="information-outline" size={14} color={colors.info} />
                <Text style={styles.aeiInfoTipText}>
                  You can add opening stock after creating the product via Stock Entry.
                </Text>
              </View>
            )}
          </View>

          <Button
            label={existingItem ? "Save Changes" : "Create Product"}
            onPress={handleSave}
            loading={isPending}
            disabled={!isValid || isPending}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category picker modal */}
      <RNModal visible={showCatPicker} transparent animationType="slide" onRequestClose={() => setShowCatPicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowCatPicker(false)}>
          <View style={styles.catPickerOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.catPickerSheet}>
                <View style={styles.catPickerHandle} />
                <Text style={styles.catPickerTitle}>Select Category</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* None */}
                  <Pressable
                    onPress={() => { setForm((f) => ({ ...f, categoryId: "" })); setShowCatPicker(false); }}
                    style={[styles.catPickerRow, !form.categoryId && styles.catPickerRowActive]}
                  >
                    <Icon source="tag-off-outline" size={18} color={colors.textMuted} />
                    <Text style={[styles.catPickerRowText, !form.categoryId && { color: colors.primary }]}>None</Text>
                    {!form.categoryId && <Icon source="check" size={16} color={colors.primary} />}
                  </Pressable>
                  {categories.map((cat) => (
                    <Pressable
                      key={cat.id}
                      onPress={() => { setForm((f) => ({ ...f, categoryId: cat.id })); setShowCatPicker(false); }}
                      style={[styles.catPickerRow, form.categoryId === cat.id && styles.catPickerRowActive]}
                    >
                      <Icon source={getCatIcon(cat.name)} size={18} color={getCatPalette(cat.name).icon} />
                      <Text style={[styles.catPickerRowText, form.categoryId === cat.id && { color: colors.primary }]}>{cat.name}</Text>
                      {form.categoryId === cat.id && <Icon source="check" size={16} color={colors.primary} />}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemDetail screen
// ─────────────────────────────────────────────────────────────────────────────
export function ItemDetail() {
  const route = useRoute();
  const itemId: string = (route.params as any)?.itemId;
  const [activeTab, setActiveTab] = useState<"overview" | "stock" | "pricing" | "history">("overview");

  const stockQuery = useItemStockQuery(itemId);
  const priceHistoryQuery = useItemPriceHistoryQuery(itemId);
  const priceChangeHistoryQuery = useItemPriceChangeHistoryQuery(itemId);
  const movementsQuery = useStockMovementsQuery(itemId);

  const itemData = (stockQuery.data as any)?.item;
  const stock = (stockQuery.data as any)?.currentStock ?? 0;
  const minStock = Number(itemData?.minimumStock ?? 0);

  const tabs = [
    { id: "overview", label: "Overview", icon: "information-outline" },
    { id: "stock", label: "Movements", icon: "transfer" },
    { id: "pricing", label: "Pricing", icon: "currency-inr" },
    { id: "history", label: "History", icon: "history" },
  ] as const;

  if (!itemData)
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Product Details" fallbackRoute="ItemList" />
        <SkeletonList count={6} itemHeight={60} />
      </Screen>
    );

  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader title={itemData.name} subtitle={itemData.category?.name ?? "No Category"} fallbackRoute="ItemList" />

      {/* Hero strip */}
      <View style={styles.detailHero}>
        <View style={styles.detailHeroLeft}>
          <View style={[styles.detailAvatar, { backgroundColor: getAvatarColor(itemData.name) + "22" }]}>
            <Text style={[styles.detailAvatarText, { color: getAvatarColor(itemData.name) }]}>
              {itemData.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.detailName}>{itemData.name}</Text>
            <Text style={styles.detailSku}>{itemData.sku || "No SKU"}</Text>
          </View>
        </View>
        <View style={styles.detailHeroRight}>
          <StockBadge stock={stock} min={minStock} />
          <Text style={[styles.detailStockNum, { color: stock <= 0 ? colors.danger : stock <= minStock ? colors.warning : colors.primary }]}>
            {stock}
          </Text>
          <Text style={styles.detailStockUnit}>{itemData.unit}</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(t.id); }}
            style={[styles.tab, activeTab === t.id && styles.tabActive]}
          >
            <Icon source={t.icon} size={14} color={activeTab === t.id ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        {activeTab === "overview" && (
          <View style={styles.detailCard}>
            {[
              { label: "Unit", value: itemData.unit },
              { label: "Category", value: itemData.category?.name ?? "—" },
              { label: "MRP", value: money(itemData.mrp) },
              { label: "Selling Price", value: money(itemData.defaultSellingPrice) },
              { label: "Min Allowed Price", value: money(itemData.minimumAllowedPrice) },
              { label: "Purchase Price", value: money(itemData.purchasePrice) },
              { label: "Low Stock Alert", value: `${itemData.minimumStock ?? 0} ${itemData.unit}` },
            ].map((row, i, arr) => (
              <React.Fragment key={row.label}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>{row.label}</Text>
                  <Text style={styles.detailRowValue}>{row.value}</Text>
                </View>
                {i < arr.length - 1 && <Divider style={styles.rowDivider} />}
              </React.Fragment>
            ))}
          </View>
        )}

        {activeTab === "stock" && (
          <View style={styles.detailCard}>
            {movementsQuery.isLoading ? (
              <SkeletonList count={4} itemHeight={52} />
            ) : !(movementsQuery.data as any)?.length ? (
              <EmptyState icon="transfer" title="No stock movements" subtitle="Stock entries will appear here." />
            ) : (
              (movementsQuery.data as any[]).map((m: any, i: number, arr: any[]) => (
                <React.Fragment key={m.id}>
                  <View style={styles.movRow}>
                    <View style={[styles.movDot, { backgroundColor: m.type === "IN" ? colors.primary : colors.danger }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.movType}>{m.type === "IN" ? "Stock In" : "Stock Out"}</Text>
                      <Text style={styles.movDate}>{new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                    </View>
                    <Text style={[styles.movQty, { color: m.type === "IN" ? colors.primary : colors.danger }]}>
                      {m.type === "IN" ? "+" : "-"}{m.quantity} {itemData.unit}
                    </Text>
                  </View>
                  {i < arr.length - 1 && <Divider style={styles.rowDivider} />}
                </React.Fragment>
              ))
            )}
          </View>
        )}

        {activeTab === "pricing" && (
          <View style={styles.detailCard}>
            <View style={styles.priceGrid}>
              {[
                { label: "MRP", value: money(itemData.mrp), color: colors.textSecondary },
                { label: "Selling", value: money(itemData.defaultSellingPrice), color: colors.primary },
                { label: "Min Price", value: money(itemData.minimumAllowedPrice), color: colors.warning },
                { label: "Purchase", value: money(itemData.purchasePrice), color: colors.textPrimary },
              ].map((p) => (
                <View key={p.label} style={styles.priceCard}>
                  <Text style={styles.priceCardLabel}>{p.label}</Text>
                  <Text style={[styles.priceCardValue, { color: p.color }]}>{p.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === "history" && (
          <View style={styles.detailCard}>
            {priceChangeHistoryQuery.isLoading ? (
              <SkeletonList count={3} itemHeight={52} />
            ) : !priceChangeHistoryQuery.data?.length ? (
              <EmptyState icon="history" title="No price changes" subtitle="Price change history will appear here." />
            ) : (
              priceChangeHistoryQuery.data.map((h: any, i: number, arr: any[]) => (
                <React.Fragment key={h.id}>
                  <View style={styles.movRow}>
                    <View style={styles.detailCard}>
                      <Text style={styles.movType}>{h.field}</Text>
                      <Text style={styles.movDate}>{new Date(h.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</Text>
                    </View>
                    <Text style={styles.movQty}>
                      {money(h.oldValue)} → {money(h.newValue)}
                    </Text>
                  </View>
                  {i < arr.length - 1 && <Divider style={styles.rowDivider} />}
                </React.Fragment>
              ))
            )}
          </View>
        )}

        <View style={styles.detailActions}>
          <Button
            label="Edit Product"
            variant="secondary"
            onPress={() => navigate("AddEditItem", { item: itemData })}
            style={{ flex: 1 }}
          />
          <Button
            label="Stock Entry"
            onPress={() => navigate("StockEntry", { itemId })}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemList — main screen  (CATEGORY GRID → ITEM LIST)
// ─────────────────────────────────────────────────────────────────────────────
export function ItemList() {
  const token = useAuthStore((s) => s.token);
  const { activeShopId } = useShopStore();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [filter, setFilter] = useState<"ALL" | "IN" | "LOW" | "OUT">("ALL");
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
    allItems.forEach((i: any) => m.set(i.id, Number(i.currentStock ?? 0)));
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
    return allItems.filter((i: any) => {
      const s = stockByItem.get(i.id) ?? 0;
      if (filter === "OUT") return s <= 0;
      if (filter === "LOW") return s > 0 && s <= Number(i.minimumStock ?? 0);
      if (filter === "IN") return s > 0;
      return true;
    });
  }, [allItems, filter, stockByItem]);

  const enterCat = useCallback((id: string | "ALL") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCat(id);
    setSearch("");
    setFilter("ALL");
  }, []);

  const exitGrid = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCat(null);
    setSearch("");
    setFilter("ALL");
  }, []);

  const activeCatName =
    selectedCat === "ALL"
      ? "All Items"
      : selectedCat === "__uncat__"
      ? "Uncategorised"
      : categories.find((c) => c.id === selectedCat)?.name ?? "Items";

  const List = FlashList as any;

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
            <Pressable
              onPress={() => navigate("ManageCategories")}
              style={({ pressed }) => [styles.manageBtn, pressed && { opacity: 0.7 }]}
            >
              <Icon source="cog-outline" size={13} color={colors.primary} />
              <Text style={styles.manageBtnText}>Manage</Text>
            </Pressable>
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
        <Pressable
          onPress={() => navigate("AddEditItem")}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Icon source="plus" size={26} color="#fff" />
        </Pressable>
      </Screen>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LIST MODE
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader title="Products" subtitle={activeCatName} />
      <View style={{ flex: 1 }}>
        <List
          data={displayItems}
          keyExtractor={(item: Item) => item.id}
          estimatedItemSize={110}
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
          renderItem={({ item }: { item: Item }) => (
            <ItemCard
              item={item}
              stock={stockByItem.get(item.id) ?? 0}
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
              />
            )
          }
          contentContainerStyle={styles.listContent}
        />

        {/* FAB */}
        <Pressable
          onPress={() => navigate("AddEditItem")}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Icon source="plus" size={26} color="#fff" />
        </Pressable>
      </View>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Grid ──────────────────────────────────────────────────────────────────
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
  catCard: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  catCardAll: {
    borderColor: colors.primary,
  },
  catCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  catIconBg: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  catName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  catCount: {
    fontSize: fontSize.xs,
  },
  catCountNum: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
  },
  catCountLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },

  // ── Search bar ────────────────────────────────────────────────────────────
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    ...shadow.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    paddingVertical: 4,
  },

  // ── Filter chips ──────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: 2,
  },
  filterChip: {
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
  filterChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },

  // ── List mode ─────────────────────────────────────────────────────────────
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

  // ── Item card ─────────────────────────────────────────────────────────────
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadow.sm,
  },
  itemCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  itemAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemAvatarText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
  },
  itemInfo: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  itemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemMeta: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  itemCategory: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  itemSku: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  itemPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  itemUnit: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  itemMrp: {
    fontSize: 10,
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  itemRight: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  itemStockQty: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
  },
  itemStockUnit: {
    fontSize: 10,
    fontWeight: fontWeight.regular,
    color: colors.textSecondary,
  },
  itemActions: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: 2,
  },
  itemActionBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
  },
  itemActionBtnPrimary: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary + "40",
  },

  // ── FAB ───────────────────────────────────────────────────────────────────
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

  // ── ItemDetail ────────────────────────────────────────────────────────────
  detailHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.sm,
  },
  detailHeroLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  detailAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  detailAvatarText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
  },
  detailName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    maxWidth: 140,
  },
  detailSku: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  detailHeroRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  detailStockNum: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.black,
    lineHeight: 36,
  },
  detailStockUnit: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  tabRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  tabText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  detailContent: {
    padding: spacing.lg,
    paddingBottom: 100,
    gap: spacing.md,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  detailRowLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  detailRowValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  rowDivider: {
    backgroundColor: colors.border,
    height: 0.5,
    marginLeft: spacing.lg,
  },
  priceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: spacing.md,
    gap: spacing.md,
  },
  priceCard: {
    width: "47%",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  priceCardLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  priceCardValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
  },
  movRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  movDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  movType: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  movDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  movQty: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  detailActions: {
    flexDirection: "row",
    gap: spacing.md,
  },

  // ── AddEditItem ───────────────────────────────────────────────────────────
  aeiScroll: {
    padding: spacing.lg,
    paddingBottom: 100,
    gap: spacing.md,
  },
  aeiCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  aeiSectionLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  aeiRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  aeiInput: {
    backgroundColor: colors.surface,
  },
  aeiOutline: {
    borderRadius: radius.md,
  },
  catSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    backgroundColor: colors.surface,
  },
  catSelectorText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  aeiInfoTip: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "flex-start",
  },
  aeiInfoTipText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.info,
    lineHeight: 17,
  },
  catPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  catPickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
    maxHeight: "70%",
    ...shadow.lg,
  },
  catPickerHandle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  catPickerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  catPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  catPickerRowActive: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  catPickerRowText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
});
