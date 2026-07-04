import { useMemo, useState, memo, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Pressable,
  TextInput,
  Alert,
  Keyboard,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { Item } from "../../api/client";
import {
  useItemsQuery,
  useAddStockMutation,
  useItemStockQuery,
  useCategoriesQuery,
  useCurrentStockQuery,
} from "../../hooks/useItems";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { AppKeyboardAvoidingView } from "../../components/ui/AppKeyboardAvoidingView";
import { AppChipGroup } from "../../components/ui/AppChipGroup";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { navigate, goBack } from "../navigation-ref";
import { triggerLightHaptic, triggerMediumHaptic } from "../../utils/haptics";

// ── Helpers ───────────────────────────────────────────────────────────────────
const haptic = (s: "light" | "medium" = "light") => {
  if (s === "medium") triggerMediumHaptic();
  else triggerLightHaptic();
};

// ── Item Row ──────────────────────────────────────────────────────────────────
const ItemRow = memo(
  function ItemRow({
    item,
    qty,
    currentStock,
    onChange,
    onFocusScrollTo,
  }: {
    item: Item;
    qty: string;
    currentStock?: { physicalStock: number };
    onChange: (val: string) => void;
    onFocusScrollTo: () => void;
  }) {
    const inputRef = useRef<TextInput>(null);
    const num = Number(qty) || 0;

    const accentColor =
      num > 0 ? colors.success :
      num < 0 ? colors.danger  :
      "transparent";

    const bump = (delta: number) => {
      haptic();
      onChange(String((Number(qty) || 0) + delta));
    };

    return (
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.row,
          { borderLeftColor: accentColor },
          num > 0 && styles.rowPositive,
          num < 0 && styles.rowNegative,
        ]}
        accessibilityLabel={`${item.name}, quantity ${qty || 0}`}
      >
        {/* Left: info */}
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.rowMeta}>
            {item.category?.name && (
              <View style={styles.catTag}>
                <Text style={styles.catTagText}>{item.category.name}</Text>
              </View>
            )}
            <View style={styles.stockTag}>
              <Icon source="cube-outline" size={10} color={colors.textMuted} />
              <Text style={styles.stockTagText}>
                {currentStock !== undefined ? currentStock.physicalStock : "—"}
                {" "}{item.unit}
              </Text>
            </View>
          </View>
        </View>

        {/* Right: stepper */}
        <View style={styles.stepper}>
          <Pressable
            onPress={() => bump(-1)}
            style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
            hitSlop={4}
            accessibilityLabel="Decrease"
          >
            <Icon source="minus" size={18} color={num > 0 ? colors.textSecondary : colors.danger} />
          </Pressable>

          <TextInput
            ref={inputRef}
            style={[
              styles.stepInput,
              num > 0 && { color: colors.success },
              num < 0 && { color: colors.danger },
            ]}
            value={qty}
            onFocus={onFocusScrollTo}
            onChangeText={(t) => {
              if (t === "" || t === "-") { onChange(t); return; }
              const n = Number(t);
              if (!isNaN(n)) onChange(t);
            }}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />

          <Pressable
            onPress={() => bump(1)}
            style={({ pressed }) => [styles.stepBtn, styles.stepBtnPlus, pressed && styles.stepBtnPressed]}
            hitSlop={4}
            accessibilityLabel="Increase"
          >
            <Icon source="plus" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </Pressable>
    );
  },
  (p, n) =>
    p.item.id === n.item.id &&
    p.qty === n.qty &&
    p.currentStock?.physicalStock === n.currentStock?.physicalStock
);

// ── Main Screen ───────────────────────────────────────────────────────────────
export function StockEntry() {
  const route       = useRoute();
  const user        = useAuthStore((s) => s.user);
  const activeShopId = useShopStore((s) => s.activeShopId);
  const isStaff     = user?.role === "STAFF";

  const params        = route.params as { itemId?: string } | undefined;
  const specificItemId = params?.itemId;

  const [search,       setSearch]       = useState("");
  const [catId,        setCatId]        = useState<string>("ALL");
  const [entries,      setEntries]      = useState<Record<string, string>>({});
  const [editedMap,    setEditedMap]    = useState<Record<string, Item>>({});
  const [onlyEdited,   setOnlyEdited]   = useState(false);
  const [notes,        setNotes]        = useState("");
  const [successVisible, setSuccess]   = useState(false);

  const listRef = useRef<any>(null);

  const categoriesQuery = useCategoriesQuery();
  const categories = categoriesQuery.data ?? [];

  const stockQuery = useCurrentStockQuery(specificItemId ?? undefined);
  const stockMap   = useMemo(() => {
    const m = new Map<string, { physicalStock: number }>();
    for (const lvl of stockQuery.data ?? []) {
      m.set(lvl.item.id, { physicalStock: lvl.physicalStock });
    }
    return m;
  }, [stockQuery.data]);

  const specificItemQuery = useItemStockQuery(specificItemId);
  const specificItem      = (specificItemQuery.data as any)?.item as Item | undefined;

  const itemsQuery = useItemsQuery({ limit: 1000, enabled: !specificItemId });
  const allItems   = useMemo(
    () => itemsQuery.data?.items ?? [],
    [itemsQuery.data?.items]
  );

  const [debSearch, setDebSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 180);
    return () => clearTimeout(t);
  }, [search]);

  const displayItems = useMemo(() => {
    if (specificItemId) return specificItem ? [specificItem] : [];
    let list = onlyEdited
      ? Object.values(editedMap).filter((it) => {
          const n = Number(entries[it.id]);
          return !isNaN(n) && n !== 0;
        })
      : allItems;
    if (catId !== "ALL") list = list.filter((it) => it.category?.id === catId);
    if (debSearch.trim()) {
      const q = debSearch.toLowerCase();
      list = list.filter(
        (it) => it.name.toLowerCase().includes(q) || (it.sku && it.sku.toLowerCase().includes(q))
      );
    }
    return list;
  }, [specificItemId, specificItem, allItems, onlyEdited, editedMap, entries, debSearch, catId]);

  const entryItems = useMemo(
    () =>
      Object.entries(entries)
        .filter(([, v]) => { const n = Number(v); return !isNaN(n) && n !== 0; })
        .map(([id, v]) => ({ itemId: id, quantity: Number(v) })),
    [entries]
  );
  const entryCount = entryItems.length;

  const updateEntry = useCallback((item: Item, val: string) => {
    const id  = item.id;
    const num = Number(val);
    const empty = val === "" || val === "0" || isNaN(num) || num === 0;
    setEntries((prev) => {
      const next = { ...prev };
      if (empty) delete next[id]; else next[id] = val;
      return next;
    });
    setEditedMap((prev) => {
      const next = { ...prev };
      if (empty) delete next[id]; else next[id] = item;
      return next;
    });
  }, []);

  const stockMutation = useAddStockMutation();

  const handleSubmit = () => {
    if (stockMutation.isPending || entryCount === 0) return;
    haptic("medium");
    const defaultNote =
      specificItemId
        ? `${isStaff ? "Restock request" : "Manual restock"} for ${specificItem?.name ?? "item"}`
        : isStaff
        ? "Bulk stock entry request by staff"
        : "Bulk stock entry via app";

    stockMutation.mutate(
      { entries: entryItems, notes: notes.trim() || defaultNote },
      {
        onSuccess: () => {
          triggerMediumHaptic();
          setSuccess(true);
        },
        onError: (err) =>
          Alert.alert("Submission Failed", err instanceof Error ? err.message : "Something went wrong."),
      }
    );
  };

  const isLoading = specificItemId ? specificItemQuery.isLoading : (itemsQuery.isLoading && allItems.length === 0);
  const isError   = specificItemId ? specificItemQuery.isError   : itemsQuery.isError;

  return (
    <Screen edges={["top", "left", "right", "bottom"]}>
      <AppKeyboardAvoidingView style={styles.kav}>
        <AppHeader
          title={specificItemId ? "Update Stock" : "Stock Entry"}
          subtitle={
            specificItemId
              ? `Adding stock for ${specificItem?.name ?? "item"}`
              : isStaff
              ? "Quantities will be submitted for owner approval"
              : "Update inventory stock levels"
          }
          fallbackRoute={specificItemId ? "StockDashboard" : "Home"}
        />

        {/* ── Filters (only for bulk mode) ──────────────────────────── */}
        {!specificItemId && (
          <View style={styles.filtersWrap}>
            {/* Search */}
            <View style={styles.searchBox}>
              <Icon source="magnify" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search items..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Icon source="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Category chips */}
            {categories.length > 0 && (
              <AppChipGroup
                scrollable
                value={catId}
                onChange={(value) => {
                  setCatId(value);
                }}
                options={[
                  { value: "ALL", label: "All" },
                  ...categories.map((category) => ({ value: category.id, label: category.name })),
                ]}
              />
            )}

            {/* All / Edited toggle row */}
            <View style={styles.toggleRow}>
              <AppChipGroup
                value={onlyEdited ? "edited" : "all"}
                onChange={(value) => {
                  setOnlyEdited(value === "edited");
                }}
                options={[
                  { value: "all", label: "All Items", icon: "format-list-bulleted" },
                  {
                    value: "edited",
                    label: "Edited",
                    icon: "pencil-box-multiple-outline",
                    badge: entryCount > 0 ? entryCount : undefined,
                  },
                ]}
                style={styles.toggleChips}
              />
              {entryCount > 0 && (
                <Pressable
                  onPress={() => {
                    haptic("medium");
                    setEntries({});
                    setEditedMap({});
                    setOnlyEdited(false);
                  }}
                  style={styles.clearBtn}
                  hitSlop={8}
                >
                  <Icon source="trash-can-outline" size={13} color={colors.danger} />
                  <Text style={styles.clearBtnText}>Clear</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* ── List ────────────────────────────────────────────────────── */}
        <View style={styles.listWrap}>
          {isLoading ? (
            <SkeletonList count={8} itemHeight={76} />
          ) : isError ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Could not load items"
              subtitle="Check your connection and try again."
              action={
                <Button
                  label="Retry"
                  onPress={() => {
                    if (specificItemId) specificItemQuery.refetch();
                    else itemsQuery.refetch();
                  }}
                />
              }
            />
          ) : (
            (() => {
              const List = FlashList as any;
              return (
                <List
                  ref={listRef}
                  data={displayItems}
                  keyExtractor={(it: Item) => it.id}
                  estimatedItemSize={84}
                  renderItem={({ item, index }: { item: Item; index: number }) => (
                    <ItemRow
                      item={item}
                      qty={entries[item.id] ?? ""}
                      currentStock={stockMap.get(item.id)}
                      onChange={(val) => updateEntry(item, val)}
                      onFocusScrollTo={() => {
                        setTimeout(() => {
                          try {
                            listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
                          } catch {}
                        }, 120);
                      }}
                    />
                  )}
                  ListEmptyComponent={
                    <EmptyState
                      icon="package-variant-closed"
                      title={onlyEdited ? "No edited items yet" : "No items found"}
                      subtitle={
                        specificItemId
                          ? "Failed to load this item."
                          : onlyEdited
                          ? "Go to 'All Items' and change a quantity."
                          : search.trim()
                          ? `No results for "${search}"`
                          : "No products in this category."
                      }
                      action={
                        !specificItemId && !onlyEdited ? (
                          <Button label="Create Product" icon="plus" onPress={() => navigate("AddEditItem")} />
                        ) : undefined
                      }
                    />
                  }
                  contentContainerStyle={styles.listContent}
                />
              );
            })()
          )}
        </View>

        {/* ── Sticky footer ────────────────────────────────────────────── */}
        <View style={styles.footer}>
          {/* Staff notice */}
          {isStaff && entryCount > 0 && (
            <View style={styles.staffNotice}>
              <Icon source="information-outline" size={14} color="#0284c7" />
              <Text style={styles.staffNoticeText}>
                Your request will be sent to the owner for approval.
              </Text>
            </View>
          )}

          {/* Notes field */}
          {entryCount > 0 && (
            <TextInput
              style={styles.notesInput}
              placeholder="Add a note (optional)..."
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              maxLength={200}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          )}

          {/* Summary + CTA */}
          <View style={styles.footerRow}>
            <View style={styles.footerSummary}>
              <Text style={styles.footerCount}>
                {entryCount === 0 ? "No changes" : `${entryCount} item${entryCount > 1 ? "s" : ""} modified`}
              </Text>
              {specificItemId && entries[specificItemId] && (
                <Text style={styles.footerDelta}>
                  Δ {entries[specificItemId] > "0" ? "+" : ""}{entries[specificItemId]}
                </Text>
              )}
            </View>
            <View style={styles.footerCta}>
              <Button
                label={
                  specificItemId
                    ? "Confirm Update"
                    : isStaff
                    ? "Submit Request"
                    : "Apply to Stock"
                }
                onPress={handleSubmit}
                loading={stockMutation.isPending}
                disabled={entryCount === 0 || stockMutation.isPending}
                fullWidth
                size="lg"
                variant="primary"
              />
            </View>
          </View>
        </View>
      </AppKeyboardAvoidingView>

      <SuccessModal
        visible={successVisible}
        title={isStaff ? "Request Submitted" : "Stock Updated"}
        message={
          isStaff
            ? "Your stock entry has been sent for owner approval."
            : "Inventory levels updated successfully."
        }
        onClose={() => {
          setSuccess(false);
          setEntries({});
          setEditedMap({});
          setNotes("");
          goBack();
        }}
      />
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  kav: { flex: 1 },

  // Filters
  filtersWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  searchBox: {
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  toggleChips: {
    flex: 1,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    paddingVertical: 6,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },

  // List
  listWrap: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 120,
  },

  // Item Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
    marginBottom: spacing.sm,
    padding: spacing.md,
    gap: spacing.md,
    minHeight: 72,
    ...shadow.sm,
  },
  rowPositive: {
    backgroundColor: "rgba(22,163,74,0.03)",
    borderColor: "rgba(22,163,74,0.2)",
  },
  rowNegative: {
    backgroundColor: "rgba(220,38,38,0.03)",
    borderColor: "rgba(220,38,38,0.2)",
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  catTag: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  catTagText: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  stockTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  stockTagText: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },

  // Stepper
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    height: 44,
    width: 130,
  },
  stepBtn: {
    width: 42,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnPlus: {
    backgroundColor: colors.primaryLight,
  },
  stepBtnPressed: {
    opacity: 0.5,
  },
  stepInput: {
    flex: 1,
    height: 44,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    padding: 0,
    fontVariant: ["tabular-nums"],
  },

  // Footer
  footer: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === "ios" ? spacing.xxl : spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
    ...shadow.md,
  },
  staffNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "#e0f2fe",
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  staffNoticeText: {
    flex: 1,
    fontSize: 11,
    color: "#0284c7",
    fontWeight: fontWeight.medium,
  },
  notesInput: {
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    minHeight: 40,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  footerSummary: {
    gap: 2,
  },
  footerCount: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  footerDelta: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    color: colors.primary,
  },
  footerCta: {
    flex: 1,
  },
});
