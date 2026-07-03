import { Fragment, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { Text, Divider, Icon } from "react-native-paper";
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
import { Button } from "../../../components/ui/Button";
import { StockBadge } from "../../../components/items/StockBadge";
import { StockTransferDialog } from "../../../components/items/StockTransferDialog";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import { navigate } from "../../navigation-ref";
import { getAvatarColor, initialsOf, money } from "../../../utils/items/display";
import { triggerLightHaptic } from "../../../utils/haptics";
import { STOCK_MOVEMENT_PERMISSION } from "../../../utils/items/permissions";
import { ItemDetailRouteParams, ItemStockResponse, PriceChangeHistoryEntry, StockMovementEntry } from "../../../types/items";

export function ItemDetail() {
  const route = useRoute();
  const { itemId } = route.params as ItemDetailRouteParams;
  const [activeTab, setActiveTab] = useState<"overview" | "stock" | "pricing" | "history">("overview");

  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === "OWNER";
  const canManageStock = !!user?.permissions?.includes(STOCK_MOVEMENT_PERMISSION);

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

      {/* Hero strip */}
      <View style={styles.detailHero}>
        <View style={styles.detailHeroLeft}>
          <View style={[styles.detailAvatar, { backgroundColor: getAvatarColor(itemData.name) + "22" }]}>
            <Text style={[styles.detailAvatarText, { color: getAvatarColor(itemData.name) }]}>
              {initialsOf(itemData.name)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.sm }}>
            <Text style={styles.detailName} numberOfLines={2}>{itemData.name}</Text>
            <Text style={styles.detailSku}>{itemData.sku || "No SKU"}</Text>
          </View>
        </View>
        <View style={styles.detailHeroRight}>
          <StockBadge stock={availableStock} min={minStock} />
          <Text style={[styles.detailStockNum, { color: availableStock <= 0 ? colors.danger : availableStock <= minStock ? colors.warning : colors.primary }]}>
            {availableStock}
          </Text>
          <Text style={styles.detailStockUnit}>Available {itemData.unit}</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => { triggerLightHaptic(); setActiveTab(t.id); }}
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
                    <View style={{ flex: 1 }}>
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
                    <View style={{ flex: 1 }}>
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

        {(showEdit || showTransfer || showStockEntry) && (
          <View style={styles.detailActions}>
            {(showEdit || showTransfer) && (
              <View style={styles.detailActionsRow}>
                {showEdit && (
                  <Button
                    label="Edit Product"
                    variant="secondary"
                    onPress={() => navigate("AddEditItem", { item: itemData })}
                    style={{ flex: 1 }}
                  />
                )}
                {showTransfer && (
                  <Button
                    label="Transfer Stock"
                    variant="secondary"
                    onPress={() => setTransferModalVisible(true)}
                    style={{ flex: 1 }}
                  />
                )}
              </View>
            )}
            {showStockEntry && (
              <Button
                label="Stock Entry"
                onPress={() => navigate("StockEntry", { itemId })}
                fullWidth
              />
            )}
          </View>
        )}
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
    gap: spacing.md,
  },
  detailActionsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
});
