import React, { useMemo, useState, memo, useCallback, useEffect } from "react";
import { 
  View, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  TextInput 
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { Searchbar, Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import * as Haptics from "expo-haptics";

import { Item } from "../../api/client";
import { useItemsQuery, useAddStockMutation, useItemStockQuery } from "../../hooks/useItems";
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentVal = Number(quantity) || 0;
    onChange(String(currentVal + 1));
  };

  const handleDecrement = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentVal = Number(quantity) || 0;
    onChange(String(currentVal - 1));
  };

  return (
    <View style={[
      styles.row,
      numericVal > 0 && styles.rowPositive,
      numericVal < 0 && styles.rowNegative,
      { borderLeftColor: numericVal > 0 ? colors.success : numericVal < 0 ? colors.danger : 'transparent' }
    ]}>
      <View style={styles.rowLeft}>
        <View style={styles.rowIconBg}>
          <Icon source="package-variant-closed" size={20} color={colors.textSecondary} />
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.itemName} numberOfLines={2}>{formatItemName(item.name)}</Text>
          <View style={styles.stockBadge}>
            <Text style={styles.stockBadgeText}>Unit: {item.unit} • SKU: {item.sku || "N/A"}</Text>
          </View>
        </View>
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
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [successVisible, setSuccessVisible] = useState(false);

  // If specific item, fetch its details
  const specificItemQuery = useItemStockQuery(specificItemId);
  const specificItem = (specificItemQuery.data as any)?.item as Item | undefined;

  const itemsQuery = useItemsQuery({ 
    search: debouncedSearch, 
    limit: specificItemId ? 0 : 50 // Disable general query if we have a specific item
  });

  const displayItems = useMemo(() => {
    if (specificItemId) {
      return specificItem ? [specificItem] : [];
    }
    return itemsQuery.data?.items ?? [];
  }, [specificItemId, specificItem, itemsQuery.data]);

  const entryItems = useMemo(() => {
    return Object.entries(entries)
      .filter(([_, qty]) => Number(qty) !== 0) // Allow negative for correction if needed, though bulk usually positive
      .map(([id, qty]) => ({ itemId: id, quantity: Number(qty) }));
  }, [entries]);

  const entryCount = entryItems.length;

  const updateEntry = useCallback((id: string, val: string) => {
    setEntries(prev => ({ ...prev, [id]: val }));
  }, []);

  const stockMutation = useAddStockMutation();

  const handleSubmit = () => {
    stockMutation.mutate({
      entries: entryItems,
      notes: specificItemId 
        ? (isStaff ? `Restock for ${specificItem?.name}` : `Manual restock for ${specificItem?.name}`)
        : (isStaff ? "Bulk stock entry request by staff" : "Bulk stock entry via app"),
    }, {
      onSuccess: () => {
        setSuccessVisible(true);
      }
    });
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <AppHeader 
          title={specificItemId ? "Update Stock" : "Stock Entry"} 
          subtitle={specificItemId ? `Adding stock for ${specificItem?.name || 'item'}...` : "Update inventory levels"} 
          fallbackRoute={specificItemId ? "StockDashboard" : "Home"}
        />
        
        {!specificItemId && (
          <View style={styles.searchContainer}>
            <Searchbar
              placeholder="Search items to restock..."
              onChangeText={setSearch}
              value={search}
              style={styles.searchBar}
              inputStyle={styles.searchInput}
              elevation={0}
            />
          </View>
        )}

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
                    onChange={(val) => updateEntry(item.id, val)}
                  />
                )}
                ListEmptyComponent={
                  <EmptyState 
                    icon="package-variant-closed" 
                    title="No items found" 
                    subtitle={specificItemId ? "Failed to load the specific item." : "Try searching for a different item name"} 
                  />
                }
                contentContainerStyle={styles.listContent}
                estimatedItemSize={90}
              />
            );
          })()}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text style={styles.footerText}>
              {specificItemId 
                ? `Adjusting ${specificItem?.name || 'item'} by ${entries[specificItemId || ''] || '0'}` 
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
  searchContainer: {
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
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    gap: spacing.md,
  },
  rowPositive: {
    backgroundColor: "rgba(22, 163, 74, 0.04)",
    borderColor: "rgba(22, 163, 74, 0.2)",
  },
  rowNegative: {
    backgroundColor: "rgba(220, 38, 38, 0.04)",
    borderColor: "rgba(220, 38, 38, 0.2)",
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  rowInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
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
