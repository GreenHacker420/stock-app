import { Fragment, useMemo, useState, useRef } from "react";
import { View, StyleSheet, ScrollView, Alert, Dimensions, Pressable, Modal } from "react-native";
import { Image } from "expo-image";
import { Text, Divider, Icon } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);


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
import { CollapsingItemHero } from "../../../components/items/CollapsingItemHero";
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

  const [cardLayout, setCardLayout] = useState<{ y: number; height: number } | null>(null);
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const onCardLayout = (e: any) => {
    const { y, height } = e.nativeEvent.layout;
    setCardLayout({ y, height });
  };


  const targetLayout = useMemo(() => {
    if (!cardLayout) return null;
    return {
      x: 28, // 16 marginHorizontal + 12 card padding
      y: cardLayout.y + (cardLayout.height - 52) / 2,
      width: 52,
      height: 52,
    };
  }, [cardLayout]);

  const thumbnailStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 50, 60, 170, 180],
      [1, 1, 0, 0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const scrollViewRef = useRef<any>(null);

  const HERO_HEIGHT = 220;
  const MORPH_START = 50;
  const MORPH_END = 180;
  const screenWidth = Dimensions.get("window").width;

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    if (!targetLayout) {
      return { opacity: 0 };
    }

    const opacity = interpolate(
      scrollY.value,
      [MORPH_START, MORPH_START + 10, MORPH_END - 10, MORPH_END],
      [0, 1, 1, 0],
      Extrapolation.CLAMP
    );

    const width = interpolate(
      scrollY.value,
      [MORPH_START, MORPH_END],
      [screenWidth, targetLayout.width],
      Extrapolation.CLAMP
    );

    const height = interpolate(
      scrollY.value,
      [MORPH_START, MORPH_END],
      [HERO_HEIGHT, targetLayout.height],
      Extrapolation.CLAMP
    );

    const borderRadius = interpolate(
      scrollY.value,
      [MORPH_START, MORPH_END],
      [0, 12],
      Extrapolation.CLAMP
    );

    const translateX = interpolate(
      scrollY.value,
      [MORPH_START, MORPH_END],
      [0, targetLayout.x],
      Extrapolation.CLAMP
    );

    const p = interpolate(
      scrollY.value,
      [MORPH_START, MORPH_END],
      [0, 1],
      Extrapolation.CLAMP
    );

    const currentHeroY = -scrollY.value * 0.6;
    const currentThumbY = targetLayout.y - scrollY.value;
    const translateY = currentHeroY + p * (currentThumbY - currentHeroY);

    return {
      position: "absolute",
      top: 0,
      left: 0,
      width,
      height,
      borderRadius,
      opacity,
      transform: [{ translateX }, { translateY }],
    };
  });



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
  const [selectedMovement, setSelectedMovement] = useState<StockMovementEntry | null>(null);

  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case "OPENING_STOCK": return "Opening Stock";
      case "STOCK_IN": return "Stock In";
      case "STOCK_OUT": return "Stock Out";
      case "SALE": return "Sales Deduction";
      case "DM": return "Delivery Memo";
      case "ORDER_DISPATCH": return "Order Dispatch";
      case "RETURN": return "Return / Exchange";
      case "DAMAGE_LOSS": return "Damage & Loss";
      case "MANUAL_ADJUSTMENT": return "Manual Adjustment";
      default: return type.replace(/_/g, " ");
    }
  };

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

  const activeUrl = imageUrls[activeImageIndex] || imageUrls[0];

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title={itemData.name} subtitle={itemData.category?.name ?? "No Category"} fallbackRoute="ItemList" />

      <View style={{ flex: 1, position: "relative" }}>
        <Animated.ScrollView
          ref={scrollViewRef}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
        <CollapsingItemHero
          imageUrls={imageUrls}
          activeImageIndex={activeImageIndex}
          onActiveImageChange={setActiveImageIndex}
          scrollY={scrollY}
          targetLayout={targetLayout}
          onImagePress={setPreviewImageUrl}
        />

        <View onLayout={onCardLayout}>
          <ItemSummaryCard
            item={itemData}
            availableStock={availableStock}
            minStock={minStock}
            thumbnailStyle={thumbnailStyle}
          />
        </View>

        <ItemTabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        <View style={styles.detailContent}>
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
                      <Pressable 
                        onPress={() => setSelectedMovement(m)}
                        style={({ pressed }) => pressed && { opacity: 0.7 }}
                      >
                        <StockMovementRow
                          title={getMovementTypeLabel(m.movementType)}
                          date={new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          quantity={`${isEntryIn ? "+" : "-"}${quantityVal} ${itemData.unit}`}
                          tone={isEntryIn ? "green" : "red"}
                        />
                      </Pressable>
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
        </View>
      </Animated.ScrollView>

      {targetLayout && activeUrl && (
        <AnimatedExpoImage
          source={{ uri: activeUrl }}
          style={overlayAnimatedStyle}
          contentFit="cover"
          pointerEvents="none"
        />
      )}
    </View>
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

      <Modal
        visible={!!selectedMovement}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMovement(null)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setSelectedMovement(null)}
        >
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ledger Entry Details</Text>
              <Pressable 
                onPress={() => setSelectedMovement(null)}
                style={styles.modalCloseBtn}
              >
                <Icon source="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            {selectedMovement && (() => {
              const qtyIn = Number(selectedMovement.quantityIn || 0);
              const qtyOut = Number(selectedMovement.quantityOut || 0);
              const isEntryIn = qtyIn > 0;
              const qtyVal = isEntryIn ? qtyIn : qtyOut;

              return (
                <View style={styles.modalBody}>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.detailLabel}>Movement Type</Text>
                    <Text style={styles.detailValue}>
                      {getMovementTypeLabel(selectedMovement.movementType)}
                    </Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <Text style={styles.detailLabel}>Quantity Changed</Text>
                    <Text style={[styles.detailValue, { color: isEntryIn ? colors.success : colors.danger, fontWeight: fontWeight.black }]}>
                      {isEntryIn ? "+" : "-"}{qtyVal} {itemData?.unit || ""}
                    </Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <Text style={styles.detailLabel}>Timestamp</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedMovement.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <Text style={styles.detailLabel}>Recorded By</Text>
                    <Text style={styles.detailValue}>
                      {selectedMovement.createdBy?.name || "System"} ({selectedMovement.createdBy?.role || "SYSTEM"})
                    </Text>
                  </View>

                  {selectedMovement.approvedBy && (
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.detailLabel}>Approved By</Text>
                      <Text style={styles.detailValue}>
                        {selectedMovement.approvedBy.name}
                      </Text>
                    </View>
                  )}

                  {selectedMovement.reason ? (
                    <View style={styles.reasonCard}>
                      <Text style={styles.reasonTitle}>Note / Reason</Text>
                      <Text style={styles.reasonText}>{selectedMovement.reason}</Text>
                    </View>
                  ) : null}

                  {selectedMovement.referenceType === "SALE" && (selectedMovement as any).sale && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.linkRow,
                        pressed && styles.linkRowPressed
                      ]}
                      onPress={() => {
                        setSelectedMovement(null);
                        navigate("SaleDetail", { id: selectedMovement.referenceId! });
                      }}
                    >
                      <View style={styles.linkLeft}>
                        <Icon source="receipt" size={20} color={colors.primary} />
                        <Text style={styles.linkLabel}>
                          View Sale: #{(selectedMovement as any).sale.saleNumber}
                        </Text>
                      </View>
                      <Icon source="chevron-right" size={20} color={colors.primary} />
                    </Pressable>
                  )}

                  {selectedMovement.referenceType === "DM" && (selectedMovement as any).deliveryMemo && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.linkRow,
                        pressed && styles.linkRowPressed
                      ]}
                      onPress={() => {
                        setSelectedMovement(null);
                        navigate("DeliveryMemoDetail", { id: selectedMovement.referenceId! });
                      }}
                    >
                      <View style={styles.linkLeft}>
                        <Icon source="file-document-outline" size={20} color={colors.primary} />
                        <Text style={styles.linkLabel}>
                          View Delivery Memo: #{(selectedMovement as any).deliveryMemo.dmNumber}
                        </Text>
                      </View>
                      <Icon source="chevron-right" size={20} color={colors.primary} />
                    </Pressable>
                  )}

                  {selectedMovement.referenceType === "ORDER" && (selectedMovement as any).order && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.linkRow,
                        pressed && styles.linkRowPressed
                      ]}
                      onPress={() => {
                        setSelectedMovement(null);
                        navigate("OrderDetail", { orderId: selectedMovement.referenceId! });
                      }}
                    >
                      <View style={styles.linkLeft}>
                        <Icon source="package-variant-closed" size={20} color={colors.primary} />
                        <Text style={styles.linkLabel}>
                          View Order: #{(selectedMovement as any).order.orderNumber}
                        </Text>
                      </View>
                      <Icon source="chevron-right" size={20} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
              );
            })()}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalContentCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: radius.full,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  modalBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  reasonCard: {
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonTitle: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  reasonText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontStyle: "italic",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  linkRowPressed: {
    opacity: 0.8,
  },
  linkLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  linkLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
});
