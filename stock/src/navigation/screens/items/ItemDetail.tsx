import { Fragment, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Alert, Dimensions, Pressable, Modal } from "react-native";
import { Image } from "expo-image";
import { Text, Divider, Icon } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
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
import { InfoRow } from "../../../components/ui/InfoRow";
import { Button } from "../../../components/ui/Button";
import { StockMovementRow } from "../../../components/domain/stock/StockMovementRow";
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
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const user = useAuthStore((s) => s.user);
  const { activeShopId } = useShopStore();
  const isOwner = user?.role === "OWNER";
  const canManageStock = hasPermission(user, STOCK_MOVEMENT_PERMISSION);

  const stockQuery = useItemStockQuery(itemId);
  const priceChangeHistoryQuery = useItemPriceChangeHistoryQuery(itemId, {
    enabled: activeTab === "history",
  });
  const movementsQuery = useStockMovementsQuery(itemId, undefined, {
    enabled: activeTab === "stock",
  });

  const shopsQuery = useShopsQuery();
  const transferMutation = useTransferStockMutation();

  const [transferModalVisible, setTransferModalVisible] = useState(false);

  const stockData = stockQuery.data as ItemStockResponse | undefined;
  const itemData = stockData?.item;
  const imageUrls = useMemo(() => {
    if (!itemData?.imageUrl) return [];
    return itemData.imageUrl.split(",").filter(Boolean);
  }, [itemData?.imageUrl]);
  const physicalStock = stockData?.currentStock ?? 0;
  const reservedStock = stockData?.reservedStock ?? 0;
  const availableStock = stockData?.availableStock ?? 0;
  const minStock = Number(itemData?.minimumStock ?? 0);

  const otherShops = useMemo(() => {
    return (shopsQuery.data ?? []).filter((s) => s.id !== itemData?.shopId);
  }, [shopsQuery.data, itemData?.shopId]);

  const handleConfirmTransfer = ({ targetShopId, quantity, reason }: { targetShopId: string; quantity: number; reason: string }) => {
    if (!itemData) return;
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
          setTransferModalVisible(false);
          stockQuery.refetch();
          if (activeTab === "stock") {
            movementsQuery.refetch();
          }
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

  if (stockQuery.isLoading) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Product Details" fallbackRoute="ItemList" />
        <SkeletonList count={6} itemHeight={60} />
      </Screen>
    );
  }

  if (stockQuery.isError || !itemData) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Product Details" fallbackRoute="ItemList" />
        <EmptyState
          icon="package-variant-closed"
          title="Product not found"
          subtitle={stockQuery.error?.message || "Could not retrieve details for this product."}
          action={
            <Button
              label="Back to Catalog"
              onPress={() => navigate("ItemList")}
            />
          }
        />
      </Screen>
    );
  }

  if (activeShopId && itemData.shopId !== activeShopId) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Access Denied" fallbackRoute="ItemList" />
        <EmptyState
          icon="store-alert-outline"
          title="Shop Mismatch"
          subtitle="This product belongs to another shop. Switch shops first to view details."
          action={
            <Button
              label="Go Back"
              onPress={() => navigate("ItemList")}
            />
          }
        />
      </Screen>
    );
  }

  const showEdit = isOwner;
  const showTransfer = canManageStock;
  const showStockEntry = canManageStock;

  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader title={itemData.name} subtitle={itemData.category?.name ?? "No Category"} fallbackRoute="ItemList" />

      {imageUrls.length > 0 && (
        <View style={styles.carouselContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const contentOffset = e.nativeEvent.contentOffset.x;
              const viewSize = e.nativeEvent.layoutMeasurement.width;
              const pageNum = Math.floor(contentOffset / viewSize);
              setActiveImageIndex(pageNum);
            }}
            scrollEventThrottle={16}
            style={styles.carouselScrollView}
          >
            {imageUrls.map((url, idx) => (
              <Pressable
                key={idx}
                onPress={() => setPreviewImageUrl(url)}
                style={({ pressed }) => [
                  styles.carouselImageContainer,
                  pressed && { opacity: 0.9 }
                ]}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.carouselImage}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </ScrollView>

          {imageUrls.length > 1 && (
            <View style={styles.dotsRow}>
              {imageUrls.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    activeImageIndex === idx && styles.activeDot
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      )}

      <ItemSummaryCard item={itemData} availableStock={availableStock} minStock={minStock} />
      <ItemTabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        {activeTab === "overview" && (
          <View style={styles.detailCard}>
            {[
              { label: "Available Stock", value: `${availableStock} ${itemData.unit}`, tone: availableStock <= 0 ? "red" : availableStock <= minStock ? "amber" : "green" },
              { label: "Reserved Stock", value: `${reservedStock} ${itemData.unit}`, tone: reservedStock > 0 ? "amber" : "default" },
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
                <InfoRow label={row.label} value={row.value} tone={row.tone as any} style={styles.detailRow} />
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
              (movementsQuery.data as StockMovementEntry[]).map((m, i, arr) => {
                const quantityIn = Number(m.quantityIn || 0);
                const quantityOut = Number(m.quantityOut || 0);
                const isEntryIn = quantityIn > 0;
                const quantityVal = isEntryIn ? quantityIn : quantityOut;

                return (
                  <Fragment key={m.id}>
                    <StockMovementRow
                      title={isEntryIn ? "Stock In" : "Stock Out"}
                      date={new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      quantity={`${isEntryIn ? "+" : "-"}${quantityVal} ${itemData.unit}`}
                      tone={isEntryIn ? "green" : "red"}
                    />
                    {i < arr.length - 1 && <Divider style={styles.rowDivider} />}
                  </Fragment>
                );
              })
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
          onEdit={() => navigate("AddEditItem", { itemId: itemData.id })}
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

      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <Pressable 
          style={styles.lightboxOverlay} 
          onPress={() => setPreviewImageUrl(null)}
        >
          <View style={styles.lightboxContent}>
            {previewImageUrl && (
              <Image
                source={{ uri: previewImageUrl }}
                style={styles.lightboxImage}
                contentFit="contain"
              />
            )}
            <Pressable 
              onPress={() => setPreviewImageUrl(null)} 
              style={[styles.closeLightboxBtn, { top: insets.top > 0 ? insets.top + spacing.md : spacing.xl }]}
            >
              <Icon source="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  carouselContainer: {
    height: 220,
    width: "100%",
    backgroundColor: "#f3f4f6",
    position: "relative",
  },
  carouselScrollView: {
    width: "100%",
    height: "100%",
  },
  carouselImageContainer: {
    width: Dimensions.get("window").width,
    height: 220,
  },
  carouselImage: {
    width: "100%",
    height: "100%",
  },
  dotsRow: {
    position: "absolute",
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  activeDot: {
    width: 14,
    backgroundColor: "#ffffff",
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxContent: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  lightboxImage: {
    width: "90%",
    height: "80%",
  },
  closeLightboxBtn: {
    position: "absolute",
    right: spacing.xl,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
});
