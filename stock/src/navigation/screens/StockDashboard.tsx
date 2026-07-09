import { useMemo, useState, useCallback, memo, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { FlashList, type FlashListRef } from "@shopify/flash-list";

import { useCurrentStockQuery } from "../../hooks/useItems";
import { type StockLevel } from "../../api/client";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { AppChipGroup } from "../../components/ui/AppChipGroup";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { triggerLightHaptic, triggerMediumHaptic } from "../../utils/haptics";

// ── Stock Health Helpers ─────────────────────────────────────────────────────
const getSafeMin = (r: StockLevel) => {
  const m = Number(r.item?.minimumStock ?? 0);
  return Number.isFinite(m) ? m : 0;
};
const isOut   = (r: StockLevel) => r.availableStock <= 0;
const isLow   = (r: StockLevel) => { const m = getSafeMin(r); return r.availableStock > 0 && r.availableStock <= m; };
const isGood  = (r: StockLevel) => { const m = getSafeMin(r); return r.availableStock > m; };

const getHealth = (r: StockLevel) => {
  if (isOut(r))  return { label: "OUT",  color: colors.danger,  bg: "#fee2e2", accent: colors.danger };
  if (isLow(r))  return { label: "LOW",  color: colors.warning, bg: "#fef3c7", accent: colors.warning };
  return           { label: "OK",   color: colors.success, bg: colors.successLight, accent: colors.success };
};

const haptic = (style: "light" | "medium" = "light") => {
  if (style === "medium") triggerMediumHaptic();
  else triggerLightHaptic();
};

// ── Stock Card ───────────────────────────────────────────────────────────────
const StockCard = memo(function StockCard({
  record,
  onPress,
  onAddStock,
}: {
  record: StockLevel;
  onPress: () => void;
  onAddStock: () => void;
}) {
  const min    = getSafeMin(record);
  const health = getHealth(record);
  const cat    = (record.item as any)?.category?.name as string | undefined;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${record.item.name}, ${health.label} stock`}
    >
      {/* Left accent bar */}
      <View style={[styles.cardAccent, { backgroundColor: health.accent }]} />

      <View style={styles.cardBody}>
        {/* Top row: name + category + badge */}
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <Text style={styles.cardName} numberOfLines={2}>{record.item.name}</Text>
            <View style={styles.cardMeta}>
              {cat && (
                <View style={styles.catTag}>
                  <Text style={styles.catTagText}>{cat}</Text>
                </View>
              )}
              {record.item.sku ? (
                <Text style={styles.skuText}>{record.item.sku}</Text>
              ) : null}
            </View>
          </View>

          {/* Health badge */}
          <View style={[styles.healthBadge, { backgroundColor: health.bg }]}>
            <Text style={[styles.healthBadgeText, { color: health.color }]}>
              {health.label}
            </Text>
          </View>
        </View>

        {/* Stock numbers row */}
        <View style={styles.stockRow}>
          <View style={styles.stockCol}>
            <Text style={styles.stockNumLabel}>AVAILABLE</Text>
            <Text style={[styles.stockNum, { color: health.color }]}>
              {record.availableStock}
              <Text style={styles.stockUnit}> {record.item.unit}</Text>
            </Text>
          </View>

          <View style={styles.stockDivider} />

          <View style={styles.stockCol}>
            <Text style={styles.stockNumLabel}>PHYSICAL</Text>
            <Text style={styles.stockNumSecondary}>
              {record.physicalStock}
              {record.reservedStock > 0 && (
                <Text style={styles.reservedText}> ({record.reservedStock} rsv)</Text>
              )}
            </Text>
          </View>

          {min > 0 && (
            <>
              <View style={styles.stockDivider} />
              <View style={styles.stockCol}>
                <Text style={styles.stockNumLabel}>MIN STOCK</Text>
                <Text style={styles.stockNumSecondary}>{min}</Text>
              </View>
            </>
          )}

          {/* Quick add stock button */}
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); haptic("light"); onAddStock(); }}
            style={({ pressed }) => [styles.quickAddBtn, pressed && styles.quickAddPressed]}
            accessibilityLabel={`Add stock for ${record.item.name}`}
          >
            <Icon source="plus" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

// ── Tab definition ───────────────────────────────────────────────────────────
type TabKey = "all" | "good" | "low" | "out";
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "all",  label: "All",     icon: "view-list-outline" },
  { key: "good", label: "Healthy", icon: "check-circle-outline" },
  { key: "low",  label: "Low",     icon: "alert-circle-outline" },
  { key: "out",  label: "Out",     icon: "close-circle-outline" },
];

// ── Main Screen ──────────────────────────────────────────────────────────────
export function StockDashboard() {
  const activeShopId = useShopStore((s) => s.activeShopId);
  const user         = useAuthStore((s) => s.user);
  const isOwner      = user?.role === "OWNER";

  const [search,    setSearch]    = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const listRef = useRef<FlashListRef<StockLevel>>(null);
  const TypedFlashList = FlashList as any;

  const stockQuery = useCurrentStockQuery(undefined, { enabled: Boolean(activeShopId) });

  if (!activeShopId) {
    return (
      <Screen scroll={false} edges={["top", "left", "right"]}>
        <AppHeader title="Inventory" subtitle="Stock levels" fallbackRoute="Home" />
        <EmptyState icon="store-alert-outline" title="No shop selected" subtitle="Select a shop first." />
      </Screen>
    );
  }

  const onRefresh = useCallback(async () => {
    haptic("medium");
    await stockQuery.refetch();
  }, [stockQuery]);

  const all = stockQuery.data ?? [];

  const totalCount   = all.length;
  const goodCount    = useMemo(() => all.filter(isGood).length, [all]);
  const lowCount     = useMemo(() => all.filter(isLow).length,  [all]);
  const outCount     = useMemo(() => all.filter(isOut).length,  [all]);

  const tabCounts: Record<TabKey, number> = { all: totalCount, good: goodCount, low: lowCount, out: outCount };

  const q = useMemo(() => search.trim().toLowerCase(), [search]);

  const filtered = useMemo(() => {
    return all.filter((r) => {
      if (q) {
        const name = r.item?.name?.toLowerCase() ?? "";
        const sku  = r.item?.sku?.toLowerCase() ?? "";
        if (!name.includes(q) && !sku.includes(q)) return false;
      }
      if (activeTab === "good") return isGood(r);
      if (activeTab === "low")  return isLow(r);
      if (activeTab === "out")  return isOut(r);
      return true;
    });
  }, [all, activeTab, q]);

  const renderItem = useCallback(({ item }: { item: StockLevel }) => (
    <StockCard
      record={item}
      onPress={() => navigate("ItemDetail", { itemId: item.item.id })}
      onAddStock={() => navigate("StockEntry", { itemId: item.item.id })}
    />
  ), []);

  if (stockQuery.isError && all.length === 0) {
    return (
      <Screen scroll={false} edges={["top", "left", "right"]}>
        <AppHeader title="Inventory" subtitle="Stock levels" fallbackRoute="Home" />
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load stock"
          subtitle="Check your connection and try again."
          action={<Button label="Retry" onPress={() => stockQuery.refetch()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={["top", "left", "right"]}>
      <AppHeader title="Inventory" subtitle="Stock levels & health" fallbackRoute="Home" />

      {/* ── Summary Chips Row ───────────────────────────────────────────── */}
      <AppChipGroup
        value={activeTab}
        onChange={(value) => {
          setActiveTab(value);
        }}
        variant="summary"
        options={TABS.map((tab) => ({
          value: tab.key,
          label: tab.label,
          icon: tab.icon,
          badge: tabCounts[tab.key],
          tone: tab.key === "out" ? "red" : tab.key === "low" ? "amber" : tab.key === "good" ? "green" : "neutral",
        }))}
        style={styles.summaryRow}
      />

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Icon source="magnify" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name or SKU..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Icon source="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Owner-only: Add Product */}
        {isOwner && (
          <Pressable
            onPress={() => navigate("AddEditItem")}
            style={styles.addProductBtn}
            accessibilityLabel="Add new product"
          >
            <Icon source="cube-outline" size={20} color={colors.primary} />
          </Pressable>
        )}
      </View>

      {/* ── List ────────────────────────────────────────────────────────── */}
      <View style={styles.listWrap}>
        {stockQuery.isLoading ? (
          <SkeletonList count={6} itemHeight={100} />
        ) : (
          <TypedFlashList
            ref={listRef}
            data={filtered}
            keyExtractor={(r: StockLevel) => r.item.id}
            refreshing={stockQuery.isRefetching}
            onRefresh={onRefresh}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState
                icon={activeTab === "out" ? "close-circle-outline" : activeTab === "low" ? "alert-outline" : "warehouse"}
                title={q ? "No matching items" : activeTab === "out" ? "No out-of-stock items" : activeTab === "low" ? "No low-stock items" : "No stock records"}
                subtitle={q ? `No results for "${search}"` : "Stock records appear once products are created."}
              />
            }
          />
        )}
      </View>

      {/* ── FAB: New Stock Entry ─────────────────────────────────────────── */}
      <Pressable
        onPress={() => { haptic("medium"); navigate("StockEntry"); }}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        accessibilityLabel={isOwner ? "New stock entry" : "Request stock update"}
      >
        <Icon source="plus" size={24} color="#fff" />
        <Text style={styles.fabLabel}>
          {isOwner ? "Stock Entry" : "Request Update"}
        </Text>
      </Pressable>
    </Screen>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  summaryRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    height: "100%",
    padding: 0,
  },
  addProductBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },

  // Card
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: "hidden",
    ...shadow.sm,
    minHeight: 96,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  cardAccent: {
    width: 4,
    alignSelf: "stretch",
  },
  cardBody: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardTopLeft: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  catTag: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  catTagText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  skuText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  healthBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  healthBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },

  // Stock numbers
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stockCol: {
    flex: 1,
  },
  stockDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  stockNumLabel: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  stockNum: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    lineHeight: 22,
  },
  stockUnit: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  stockNumSecondary: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  reservedText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.regular,
  },

  quickAddBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs,
    backgroundColor: colors.primaryLight,
  },
  quickAddPressed: {
    opacity: 0.6,
  },

  // FAB
  fab: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 36 : 24,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    ...shadow.lg,
  },
  fabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  fabLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: "#fff",
  },
});
