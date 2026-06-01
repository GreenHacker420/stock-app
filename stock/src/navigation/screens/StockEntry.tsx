import React, { useMemo, useState, memo, useCallback } from "react";
import { 
  View, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  TextInput 
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Searchbar, Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { fetchItems, addStock, Item, StockEntryPayload } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
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
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.stockBadge}>
          <Text style={styles.stockBadgeText}>Unit: {item.unit}</Text>
        </View>
      </View>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.qtyInput}
          value={quantity}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          selectTextOnFocus
          returnKeyType="done"
        />
      </View>
    </View>
  );
}, (p, n) => p.item.id === n.item.id && p.quantity === n.quantity);

export function StockEntry() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();
  const navigation = useNavigation();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [successVisible, setSuccessVisible] = useState(false);

  const itemsQuery = useQuery({
    queryKey: ["items", activeShopId, debouncedSearch],
    queryFn: () => fetchItems(token ?? "", activeShopId ?? "", { search: debouncedSearch, limit: 50 }),
    enabled: !!token && !!activeShopId,
  });

  const entryItems = useMemo(() => {
    return Object.entries(entries)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([id, qty]) => ({ itemId: id, quantity: Number(qty) }));
  }, [entries]);

  const entryCount = entryItems.length;

  const updateEntry = useCallback((id: string, val: string) => {
    setEntries(prev => ({ ...prev, [id]: val }));
  }, []);

  const stockMutation = useMutation({
    mutationFn: () => {
      const payload: StockEntryPayload = {
        shopId: activeShopId ?? "",
        entries: entryItems,
        notes: "Bulk stock entry via app",
      };
      return addStock(token ?? "", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", activeShopId] });
      setEntries({});
      setSuccessVisible(true);
    },
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <AppHeader title="Stock Entry" subtitle="Update inventory levels" />
        
        <View style={styles.searchContainer}>
          <Searchbar
            placeholder="Search items to restock..."
            onChangeText={setSearch}
            value={search}
            style={styles.searchBar}
            inputStyle={styles.searchInput}
          />
        </View>

        <View style={styles.listContainer}>
          <FlashList
            data={itemsQuery.data?.items ?? []}
            estimatedItemSize={80}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <StockEntryRow 
                item={item} 
                quantity={entries[item.id] || ""}
                onChange={(val) => updateEntry(item.id, val)}
              />
            )}
            ListEmptyComponent={
              itemsQuery.isLoading ? (
                <SkeletonList count={8} itemHeight={80} />
              ) : (
                <EmptyState 
                  icon="📦" 
                  title="No items found" 
                  subtitle="Try searching for a different item name" 
                />
              )
            }
            contentContainerStyle={styles.listContent}
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text style={styles.footerText}>{entryCount} items being updated</Text>
          </View>
          <Button 
            label="SUBMIT STOCK ENTRY" 
            onPress={() => stockMutation.mutate()} 
            loading={stockMutation.isPending}
            disabled={entryCount === 0}
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>

      <SuccessModal
        visible={successVisible}
        title="Stock Updated"
        message={`Successfully updated stock for ${entryCount} items.`}
        onClose={() => {
          setSuccessVisible(false);
          navigation.goBack();
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
    elevation: 0,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
    backgroundColor: colors.bg,
  },
  rowInfo: {
    flex: 1,
    paddingRight: spacing.md,
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
    width: 100,
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
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.lg,
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
