import React, { useMemo, useState, memo, useCallback, useEffect } from "react";
import { 
  View, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  TextInput 
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Searchbar, Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

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

const StockEntryRow = memo(({ 
  item, 
  quantity, 
  onChange 
}: { 
  item: Item, 
  quantity: string, 
  onChange: (val: string) => void 
}) => {
  const numericVal = Number(quantity);
  const color = numericVal > 0 ? colors.success : numericVal < 0 ? colors.danger : colors.textPrimary;
  const prefix = numericVal > 0 ? "+" : "";

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.stockBadge}>
          <Text style={styles.stockBadgeText}>Unit: {item.unit} • SKU: {item.sku || "N/A"}</Text>
        </View>
      </View>
      
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.qtyInput, { color }]}
            value={quantity}
            onChangeText={(text) => {
              // Allow minus sign for typing negative numbers
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
            autoFocus={true}
            returnKeyType="done"
          />
          {numericVal !== 0 && (
            <Text style={[styles.prefixOverlay, { color }]}>{prefix}</Text>
          )}
        </View>
      </View>
    </View>
  );
}, (p, n) => p.item.id === n.item.id && p.quantity === n.quantity);

export function StockEntry() {
  const navigation = useNavigation();
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
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            (navigation as any).navigate("StockDashboard");
          }
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
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
    backgroundColor: colors.bg,
    gap: spacing.md,
  },
  rowInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  stockBadge: {
    backgroundColor: colors.surfaceOffset,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  stockBadgeText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  inputContainer: {
    width: 110,
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  prefixOverlay: {
    position: 'absolute',
    left: 10,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
  },
  qtyInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    height: 48,
    textAlign: 'center',
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    boxShadow: "0 -4px 12px rgba(0, 0, 0, 0.05)",
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
