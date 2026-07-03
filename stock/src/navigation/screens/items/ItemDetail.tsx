import { Fragment, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { Text, Divider } from "react-native-paper";
import { useRoute } from "@react-navigation/native";

import { useAuthStore } from "../../../auth/auth-store";
import {
  useItemStockQuery,
  useItemPriceChangeHistoryQuery,
  useStockMovementsQuery,
} from "../../../hooks/useItems";
import { useShopsQuery, useTransferStockMutation } from "../../../hooks/useShops";
import { Screen } from "../../../components/Screen";
import { AppHeader } from "../../../components/ui/AppHeader";
import { SkeletonList } from "../../../components/ui/SkeletonCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { StockTransferDialog } from "../../../components/items/StockTransferDialog";
import { ItemSummaryCard } from "../../../components/items/ItemSummaryCard";
import { ItemDetailActions } from "../../../components/items/ItemDetailActions";
import { ItemDetailTabId, ItemTabBar } from "../../../components/items/ItemTabBar";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import { navigate } from "../../navigation-ref";
import { money } from "../../../utils/items/display";
import { STOCK_MOVEMENT_PERMISSION, hasPermission } from "../../../utils/items/permissions";
import { ItemDetailRouteParams, ItemStockResponse, PriceChangeHistoryEntry, StockMovementEntry } from "../../../types/items";

export function ItemDetail() {
  const route = useRoute();
  const { itemId } = route.params as ItemDetailRouteParams;
  const [activeTab, setActiveTab] = useState<ItemDetailTabId>("overview");

  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === "OWNER";
  const canManageStock = hasPermission(user, STOCK_MOVEMENT_PERMISSION);

  const stockQuery = useItemStockQuery(itemId);
  const priceChangeHistoryQuery = useItemPriceChangeHistoryQuery(itemId);
  const movementsQuery = useStockMovementsQuery(itemId);

  const shopsQuery = useShopsQuery();
  const transferMutation = useTransferStockMutation();

  const [transferModalVisible, setTransferModalVisible] = useState(false);

  const stockData = stockQuery.data as ItemStockResponse | undefined;
  const itemData = stockData?.item;
  const physicalStock = stockData?.currentStock ?? 0;
  const reservedStock = stockData?.reservedStock ?? 0;
  const availableStock = stockData?.availableStock ?? 0;
  const minStock = Number(itemData?.minimumStock ?? 0);

  const otherShops = useMemo(() => {
    return (shopsQuery.data ?? []).filter((s) => s.id !== itemData?.shopId);
  }, [shopsQuery.data, itemData?.shopId]);

  const handleConfirmTransfer = ({ targetShopId, quantity, reason }: { targetShopId: string; quantity: number; reason: string }) => {
    if (!itemData) return;
    setTransferModalVisible(false);
    transferMutation.mutate(
      {
        sourceShopId: itemData.shopId,
        targetShopId,
        itemId,
        quantity,
        reason,
      },
      {
        onSuccess: () => {
          stockQuery.refetch();
          movementsQuery.refetch();
        },
        onError: (err: any) => {
          Alert.alert("Error", err?.message || "Failed to transfer stock.");
        },
      }
    );
  };

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

  const showEdit = isOwner;
  const showTransfer = canManageStock;
  const showStockEntry = canManageStock;

  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader title={itemData.name} subtitle={itemData.category?.name ?? "No Category"} fallbackRoute="ItemList" />

      <ItemSummaryCard item={itemData} availableStock={availableStock} minStock={minStock} />
      <ItemTabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        {activeTab === "overview" && (
          <View style={styles.detailCard}>
            {[
              { label: "Available Stock", value: `${availableStock} ${itemData.unit}`, highlight: true, color: availableStock <= 0 ? colors.danger : availableStock <= minStock ? colors.warning : colors.success },
              { label: "Reserved Stock", value: `${reservedStock} ${itemData.unit}`, color: reservedStock > 0 ? colors.warning : colors.textSecondary },
              { label: "Physical Stock", value: `${physicalStock} ${itemData.unit}` },
              { label: "Unit", value: itemData.unit },
              { label: "Category", value: itemData.category?.name ?? "—" },
              { label: "MRP", value: money(itemData.mrp) },
              { label: "Selling Price", value: money(itemData.defaultSellingPrice) },
              { label: "Min Allowed Price", value: money(itemData.minimumAllowedPrice) },
              { label: "Purchase Price", value: money(itemData.purchasePrice) },
              { label: "Low Stock Alert", value: `${itemData.minimumStock ?? 0} ${itemData.unit}` },
            ].map((row, i, arr) => (
              <Fragment key={row.label}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailRowLabel, row.highlight && { fontWeight: fontWeight.bold, color: colors.textPrimary }]}>{row.label}</Text>
                  <Text style={[styles.detailRowValue, row.color && { color: row.color, fontWeight: fontWeight.bold }]}>{row.value}</Text>
                </View>
                {i < arr.length - 1 && <Divider style={styles.rowDivider} />}
              </Fragment>
            ))}
          </View>
        )}

        {activeTab === "stock" && (
          <View style={styles.detailCard}>
            {movementsQuery.isLoading ? (
              <SkeletonList count={4} itemHeight={52} />
            ) : !(movementsQuery.data as StockMovementEntry[] | undefined)?.length ? (
              <EmptyState icon="transfer" title="No stock movements" subtitle="Stock entries will appear here." />
            ) : (
              (movementsQuery.data as StockMovementEntry[]).map((m, i, arr) => (
                <Fragment key={m.id}>
                  <View style={styles.movRow}>
                    <View style={[styles.movDot, { backgroundColor: m.type === "IN" ? colors.primary : colors.danger }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.movType}>{m.type === "IN" ? "Stock In" : "Stock Out"}</Text>
                      <Text style={styles.movDate}>{new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                    </View>
                    <Text style={[styles.movQty, { color: m.type === "IN" ? colors.primary : colors.danger }]}>
                      {m.type === "IN" ? "+" : "-"}{m.quantity} {itemData.unit}
                    </Text>
                  </View>
                  {i < arr.length - 1 && <Divider style={styles.rowDivider} />}
                </Fragment>
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
            ) : !(priceChangeHistoryQuery.data as PriceChangeHistoryEntry[] | undefined)?.length ? (
              <EmptyState icon="history" title="No price changes" subtitle="Price change history will appear here." />
            ) : (
              (priceChangeHistoryQuery.data as PriceChangeHistoryEntry[]).map((h, i, arr) => (
                <Fragment key={h.id}>
                  <View style={styles.movRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.movType}>{h.priceType}</Text>
                      <Text style={styles.movDate}>{new Date(h.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</Text>
                    </View>
                    <Text style={styles.movQty}>
                      {money(h.oldPrice)} → {money(h.newPrice)}
                    </Text>
                  </View>
                  {i < arr.length - 1 && <Divider style={styles.rowDivider} />}
                </Fragment>
              ))
            )}
          </View>
        )}

        <ItemDetailActions
          showEdit={showEdit}
          showTransfer={showTransfer}
          showStockEntry={showStockEntry}
          onEdit={() => navigate("AddEditItem", { item: itemData })}
          onTransfer={() => setTransferModalVisible(true)}
          onStockEntry={() => navigate("StockEntry", { itemId })}
        />
      </ScrollView>

      <StockTransferDialog
        visible={transferModalVisible}
        unit={itemData.unit}
        availableStock={availableStock}
        otherShops={otherShops}
        isPending={transferMutation.isPending}
        onDismiss={() => setTransferModalVisible(false)}
        onConfirm={handleConfirmTransfer}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    gap: spacing.md,
    minHeight: 52,
  },
  detailRowLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    flex: 1,
    minWidth: 0,
  },
  detailRowValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
    flexShrink: 1,
    textAlign: "right",
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
    minHeight: 56,
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
    flexShrink: 1,
    textAlign: "right",
  },
});
