import React, { useMemo, useState, memo, useCallback, useEffect } from "react";
import { 
  View, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  TextInput,
  ScrollView,
  Alert
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { Searchbar, Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import * as Haptics from "expo-haptics";

import { Item } from "../../api/client";
import { useItemsQuery, useAddStockMutation, useItemStockQuery, useCategoriesQuery } from "../../hooks/useItems";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { navigate, goBack } from "../navigation-ref";

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

const StockEntryRow = memo(({ 
  item, 
  quantity, 
  onChange 
}: { 
  item: Item, 
  quantity: string, 
  onChange: (val: string) => void 
}) => {
  const numericVal = Number(quantity) || 0;
  const color = numericVal > 0 ? colors.success : numericVal < 0 ? colors.danger : colors.textPrimary;
  
  const handleIncrement = () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const currentVal = Number(quantity) || 0;
    onChange(String(currentVal + 1));
  };

  const handleDecrement = () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const currentVal = Number(quantity) || 0;
    onChange(String(currentVal - 1));
  };

  return (
    <View style={[
      styles.row,
      numericVal > 0 && styles.rowPositive,
      numericVal < 0 && styles.rowNegative,
      { borderLeftColor: numericVal > 0 ? colors.success : numericVal < 0 ? colors.danger : colors.border }
    ]}>
      <View style={styles.rowHeader}>
        <View style={styles.rowIconBg}>
          <Icon source="package-variant-closed" size={20} color={colors.textSecondary} />
        </View>
        <Text style={styles.itemName}>{formatItemName(item.name)}</Text>
      </View>
      
      <View style={styles.rowFooter}>
        <View style={styles.stockBadge}>
          <Text style={styles.stockBadgeText}>Unit: {item.unit} • SKU: {item.sku || "N/A"}</Text>
        </View>
        
        <View style={styles.counterContainer}>
          <Pressable 
            onPress={handleDecrement}
            style={({ pressed }) => [
              styles.counterBtn,
              pressed && styles.pressed
            ]}
          >
            <Icon source="minus" size={16} color={colors.textSecondary} />
          </Pressable>

          <TextInput
            style={[styles.qtyInput, { color }]}
            value={quantity}
            onChangeText={(text) => {
              if (text === "-" || text === "") {
                onChange(text);
                return;
              }
              const num = Number(text);
              if (!isNaN(num)) {
                onChange(text);
              }
            }}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            selectTextOnFocus
            returnKeyType="done"
          />

          <Pressable 
            onPress={handleIncrement}
            style={({ pressed }) => [
              styles.counterBtn,
              pressed && styles.pressed
            ]}
          >
            <Icon source="plus" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}, (p, n) => p.item.id === n.item.id && p.quantity === n.quantity);

export function StockEntry() {
  const route = useRoute();
  const user = useAuthStore((state) => state.user);
  const isStaff = user?.role === "STAFF";

  // Check if we are managing a specific item
  const routeParams = route.params as { itemId?: string } | undefined;
  const specificItemId = routeParams?.itemId;

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("ALL");
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [editedItemsMap, setEditedItemsMap] = useState<Record<string, Item>>({});
  const [showOnlyEdited, setShowOnlyEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [successVisible, setSuccessVisible] = useState(false);

  // Categories query
  const categoriesQuery = useCategoriesQuery();
  const categories = categoriesQuery.data ?? [];

  // If specific item, fetch its details
  const specificItemQuery = useItemStockQuery(specificItemId);
  const specificItem = (specificItemQuery.data as any)?.item as Item | undefined;

  const itemsQuery = useItemsQuery({ 
    search: debouncedSearch, 
    categoryId: selectedCategoryId === "ALL" ? undefined : selectedCategoryId,
    limit: specificItemId ? 0 : 100 // Disable general query if we have a specific item
  });

  const displayItems = useMemo(() => {
    if (specificItemId) {
      return specificItem ? [specificItem] : [];
    }
    if (showOnlyEdited) {
      const allEdited = Object.values(editedItemsMap).filter(item => {
        const qty = entries[item.id];
        const num = Number(qty);
        return qty !== undefined && qty !== "" && !isNaN(num) && num !== 0;
      });
      
      // Filter edited by category local filter if selected
      let filteredEdited = allEdited;
      if (selectedCategoryId !== "ALL") {
        filteredEdited = allEdited.filter(item => item.category?.id === selectedCategoryId);
      }

      if (!search.trim()) return filteredEdited;
      return filteredEdited.filter(item => 
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sku?.toLowerCase().includes(search.toLowerCase())
      );
    }
    return itemsQuery.data?.items ?? [];
  }, [specificItemId, specificItem, itemsQuery.data, showOnlyEdited, editedItemsMap, entries, search, selectedCategoryId]);

  const entryItems = useMemo(() => {
    return Object.entries(entries)
      .filter(([_, qty]) => {
        const num = Number(qty);
        return !isNaN(num) && num !== 0;
      })
      .map(([id, qty]) => ({ itemId: id, quantity: Number(qty) }));
  }, [entries]);

  const entryCount = entryItems.length;

  const updateEntry = useCallback((item: Item, val: string) => {
    const id = item.id;
    setEntries(prev => ({ ...prev, [id]: val }));
    if (val !== "" && val !== "0" && val !== "-") {
      setEditedItemsMap(prev => ({ ...prev, [id]: item }));
    }
  }, []);

  const stockMutation = useAddStockMutation();

  const handleSubmit = () => {
    const defaultNote = specificItemId 
      ? (isStaff ? `Restock for ${specificItem?.name}` : `Manual restock for ${specificItem?.name}`)
      : (isStaff ? "Bulk stock entry request by staff" : "Bulk stock entry via app");

    stockMutation.mutate({
      entries: entryItems,
      notes: notes.trim() || defaultNote,
    }, {
      onSuccess: () => {
        if (Platform.OS !== "web") {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        setSuccessVisible(true);
      },
      onError: (err) => {
        Alert.alert("Submission Failed", err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  const handleCategoryPress = (catId: string) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedCategoryId(catId);
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AppHeader 
          title={specificItemId ? "Update Stock" : "Stock Entry"} 
          subtitle={specificItemId ? `Adding stock for ${specificItem?.name || 'item'}...` : "Update inventory levels"} 
          fallbackRoute={specificItemId ? "StockDashboard" : "Home"}
        />
        
        {!specificItemId && (
          <View style={styles.headerContainer}>
            <Searchbar
              placeholder="Search items to restock..."
              onChangeText={setSearch}
              value={search}
              style={styles.searchBar}
              inputStyle={styles.searchInput}
              elevation={0}
            />

            {/* Category horizontal filters */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>FILTER BY CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeTabsContent}>
                <Pressable 
                  onPress={() => handleCategoryPress("ALL")}
                  style={[
                    styles.modeChip, 
                    selectedCategoryId === "ALL" ? styles.modeChipActive : styles.modeChipInactive
                  ]}
                >
                  <Icon 
                    source="format-list-bulleted" 
                    size={14} 
                    color={selectedCategoryId === "ALL" ? colors.textInverse : colors.textSecondary} 
                  />
                  <Text 
                    style={[
                      styles.modeChipText, 
                      selectedCategoryId === "ALL" ? styles.modeChipTextActive : styles.modeChipTextInactive
                    ]}
                  >
                    All Categories
                  </Text>
                </Pressable>
                {categories.map(cat => (
                  <Pressable 
                    key={cat.id} 
                    onPress={() => handleCategoryPress(cat.id)}
                    style={[
                      styles.modeChip, 
                      selectedCategoryId === cat.id ? styles.modeChipActive : styles.modeChipInactive
                    ]}
                  >
                    <Icon 
                      source="tag-outline" 
                      size={14} 
                      color={selectedCategoryId === cat.id ? colors.textInverse : colors.textSecondary} 
                    />
                    <Text 
                      style={[
                        styles.modeChipText, 
                        selectedCategoryId === cat.id ? styles.modeChipTextActive : styles.modeChipTextInactive
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* List filters: Edited vs All */}
            <View style={styles.filterChipsRow}>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowOnlyEdited(false);
                }}
                style={[styles.filterChip, !showOnlyEdited && styles.filterChipActive]}
              >
                <Icon source="package-variant" size={14} color={!showOnlyEdited ? colors.primary : colors.textSecondary} />
                <Text style={[styles.filterChipText, !showOnlyEdited && styles.filterChipTextActive]}>All Items</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowOnlyEdited(true);
                }}
                style={[styles.filterChip, showOnlyEdited && styles.filterChipActive]}
              >
                <Icon source="pencil-box-multiple-outline" size={14} color={showOnlyEdited ? colors.primary : colors.textSecondary} />
                <Text style={[styles.filterChipText, showOnlyEdited && styles.filterChipTextActive]}>Edited ({entryCount})</Text>
              </Pressable>

              {entryCount > 0 && (
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    setEntries({});
                    setEditedItemsMap({});
                    setShowOnlyEdited(false);
                  }}
                  style={styles.clearBtn}
                >
                  <Icon source="trash-can-outline" size={14} color={colors.danger} />
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Product rows list */}
        <View style={styles.listContainer}>
          {(() => {
            const List = FlashList as any;
            const isLoading = specificItemId ? specificItemQuery.isLoading : itemsQuery.isLoading;
            
            if (isLoading) return <SkeletonList count={8} itemHeight={80} />;

            return (
              <List
                data={displayItems}
                keyExtractor={(item: Item) => item.id}
                renderItem={({ item }: { item: Item }) => (
                  <StockEntryRow 
                    item={item} 
                    quantity={entries[item.id] || ""}
                    onChange={(val) => updateEntry(item, val)}
                  />
                )}
                ListEmptyComponent={
                  <EmptyState 
                    icon="package-variant-closed" 
                    title={showOnlyEdited ? "No edited items" : "No items found"} 
                    subtitle={specificItemId ? "Failed to load the specific item." : (showOnlyEdited ? "Select 'All Items' and modify a quantity to edit." : "Try searching for a different item name")} 
                    action={
                      !specificItemId && !showOnlyEdited && (
                        <Button 
                          label="Create Product" 
                          icon="plus" 
                          onPress={() => navigate("AddEditItem")}
                        />
                      )
                    }
                  />
                }
                contentContainerStyle={styles.listContent}
                estimatedItemSize={90}
              />
            );
          })()}
        </View>

        {/* Footer Container */}
        <View style={styles.footer}>
          {entryCount > 0 && (
            <TextInput
              style={styles.notesInput}
              placeholder="Add stock movement notes (optional)..."
              value={notes}
              onChangeText={setNotes}
              maxLength={200}
              placeholderTextColor={colors.textMuted}
            />
          )}
          <View style={styles.footerInfo}>
            <Text style={styles.footerText}>
              {specificItemId 
                ? `Adjusting ${specificItem ? formatItemName(specificItem.name) : 'item'} by ${entries[specificItemId || ''] || '0'}` 
                : `${entryCount} items being updated`}
            </Text>
          </View>
          <Button 
            label={specificItemId ? "CONFIRM STOCK UPDATE" : "SUBMIT STOCK ENTRY"} 
            onPress={handleSubmit} 
            loading={stockMutation.isPending}
            disabled={entryCount === 0}
            fullWidth
            size="lg"
            variant="primary"
          />
        </View>
      </KeyboardAvoidingView>

      <SuccessModal
        visible={successVisible}
        title={isStaff ? "Request Submitted" : "Stock Updated"}
        message={
          isStaff 
            ? `Your stock entry request has been sent for owner approval.`
            : `Successfully updated stock level.`
        }
        onClose={() => {
          setSuccessVisible(false);
          setEntries({});
          setEditedItemsMap({});
          setNotes("");
          goBack();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
  filterSection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 1,
    marginLeft: 4,
  },
  modeTabsContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeChipInactive: {
    backgroundColor: colors.surfaceOffset,
    borderColor: colors.border,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
  },
  modeChipTextActive: {
    color: colors.textInverse,
  },
  modeChipTextInactive: {
    color: colors.textSecondary,
  },
  filterChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.primary,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingVertical: 6,
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    gap: spacing.sm,
    ...shadow.sm,
  },
  rowPositive: {
    backgroundColor: "rgba(22, 163, 74, 0.03)",
    borderColor: "rgba(22, 163, 74, 0.2)",
  },
  rowNegative: {
    backgroundColor: "rgba(220, 38, 38, 0.03)",
    borderColor: "rgba(220, 38, 38, 0.2)",
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  stockBadge: {
    backgroundColor: colors.surfaceOffset,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  stockBadgeText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    width: 120,
    height: 38,
    overflow: 'hidden',
  },
  counterBtn: {
    width: 32,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    flex: 1,
    height: '100%',
    textAlign: 'center',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.5,
  },
  footer: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.md,
  },
  notesInput: {
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  footerInfo: {
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  }
});
