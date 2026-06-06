import React, { useMemo, useState, memo, useCallback } from "react";
import { 
  View, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  ActivityIndicator 
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Searchbar, Text, Icon, Divider } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { Item } from "../../api/client";
import { useItemsQuery } from "../../hooks/useItems";
import { useCreateSaleMutation } from "../../hooks/useSales";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SuccessModal } from "../../components/ui/SuccessModal";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

const SaleItemCard = memo(({ 
  item, 
  quantity, 
  onAdd, 
  onRemove 
}: { 
  item: Item, 
  quantity: number, 
  onAdd: () => void, 
  onRemove: () => void 
}) => {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemSubtitle}>
          {item.sku || "No SKU"} • {money(item.defaultSellingPrice)} / {item.unit}
        </Text>
      </View>
      
      <View style={styles.quantityControls}>
        {quantity === 0 ? (
          <Pressable 
            onPress={onAdd}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.buttonPressed
            ]}
          >
            <Icon source="plus" size={24} color={colors.primary} />
            <Text style={styles.addButtonLabel}>ADD</Text>
          </Pressable>
        ) : (
          <View style={styles.counterRow}>
            <Pressable 
              onPress={onRemove}
              style={({ pressed }) => [
                styles.qtyButton,
                pressed && styles.buttonPressed
              ]}
            >
              <Icon source="minus" size={20} color={colors.primary} />
            </Pressable>
            
            <View style={styles.qtyDisplay}>
              <Text style={styles.qtyText}>{quantity}</Text>
            </View>
            
            <Pressable 
              onPress={onAdd}
              style={({ pressed }) => [
                styles.qtyButton,
                pressed && styles.buttonPressed
              ]}
            >
              <Icon source="plus" size={20} color={colors.primary} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}, (p, n) => p.item.id === n.item.id && p.quantity === n.quantity);

export function WalkInSale() {
  const navigation = useNavigation();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [cart, setCart] = useState<Record<string, { item: Item, quantity: number }>>({});
  const [successVisible, setSuccessVisible] = useState(false);

  const itemsQuery = useItemsQuery({ search: debouncedSearch, limit: 50 });

  const cartArray = useMemo(() => Object.values(cart), [cart]);
  const cartItemCount = useMemo(() => cartArray.reduce((sum, i) => sum + i.quantity, 0), [cartArray]);
  const cartTotal = useMemo(() => cartArray.reduce((sum, i) => sum + (i.quantity * Number(i.item.defaultSellingPrice)), 0), [cartArray]);

  const updateQuantity = useCallback((item: Item, delta: number) => {
    setCart(prev => {
      const current = prev[item.id] || { item, quantity: 0 };
      const nextQty = Math.max(0, current.quantity + delta);
      
      const nextCart = { ...prev };
      if (nextQty === 0) {
        delete nextCart[item.id];
      } else {
        nextCart[item.id] = { ...current, quantity: nextQty };
      }
      return nextCart;
    });
  }, []);

  const saleMutation = useCreateSaleMutation();

  const handleCompleteSale = () => {
    if (saleMutation.isPending) return;
    saleMutation.mutate({
      items: cartArray.map(i => ({ 
        itemId: i.item.id, 
        quantity: i.quantity, 
        rate: Number(i.item.defaultSellingPrice) 
      })),
      isWalkin: true,
      payments: [{
        paymentMode: "CASH",
        amount: cartTotal
      }],
    }, {
      onSuccess: () => {
        setSuccessVisible(true);
      }
    });
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <AppHeader title="Walk-in Sale" subtitle="Select items and complete checkout" />
        
        <View style={styles.searchContainer}>
          <Searchbar
            placeholder="Search name or SKU..."
            onChangeText={setSearch}
            value={search}
            style={styles.searchBar}
            inputStyle={styles.searchInput}
          />
        </View>

        <View style={styles.listContainer}>
          <FlashList
            data={itemsQuery.data?.items ?? []}
            keyExtractor={(item: Item) => item.id}
            renderItem={({ item }: { item: Item }) => (
              <SaleItemCard 
                item={item} 
                quantity={cart[item.id]?.quantity ?? 0}
                onAdd={() => updateQuantity(item, 1)}
                onRemove={() => updateQuantity(item, -1)}
              />
            )}
            ListEmptyComponent={
              itemsQuery.isLoading ? (
                <SkeletonList count={6} itemHeight={90} />
              ) : (
                <EmptyState 
                  icon="magnify" 
                  title="No products found" 
                  subtitle="Try searching by name or SKU" 
                />
              )
            }
            contentContainerStyle={styles.listContent}
          />
        </View>

        {cartItemCount > 0 && (
          <View style={styles.cartSummary}>
            <View style={styles.cartInfo}>
              <Text style={styles.cartCount}>{cartItemCount} items</Text>
              <Text style={styles.cartTotal}>{money(cartTotal)}</Text>
            </View>
            <Button 
              label="COMPLETE SALE →" 
              variant="success"
              onPress={handleCompleteSale} 
              loading={saleMutation.isPending}
              style={styles.checkoutButton}
            />
          </View>
        )}
      </KeyboardAvoidingView>

      <SuccessModal
        visible={successVisible}
        title="Sale Completed"
        message={`Sale of ${money(cartTotal)} recorded successfully.`}
        onClose={() => {
          setSuccessVisible(false);
          setCart({});
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
    paddingBottom: 100,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
    backgroundColor: colors.bg,
  },
  itemInfo: {
    flex: 1,
    paddingRight: spacing.md,
  },
  itemName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  quantityControls: {
    minWidth: 120,
    alignItems: 'flex-end',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
    minWidth: 80,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addButtonLabel: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  qtyButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  qtyDisplay: {
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  cartSummary: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.lg,
  },
  cartInfo: {
    flex: 1,
  },
  cartCount: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  cartTotal: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  checkoutButton: {
    flex: 1.5,
  }
});
