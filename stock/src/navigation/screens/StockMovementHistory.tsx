import React, { useState } from "react";
import { View, StyleSheet, ActivityIndicator, Pressable, Modal } from "react-native";
import { Text, Icon } from "react-native-paper";
import { navigate } from "../navigation-ref";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore } from "../../auth/auth-store";
import type { StockMovement } from "../../api/client";

import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { EmptyState } from "../../components/ui/EmptyState";
import { AppChipGroup } from "../../components/ui/AppChipGroup";
import { useStockMovementsQuery } from "../../hooks/useItems";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import {
  getStockMovementDirection,
  getStockMovementQuantity,
  getStockMovementReferenceKind,
} from "../../utils/items/stock-movement";

const qty = (val?: string | number | null) => {
  const num = Number(val ?? 0);
  return num % 1 === 0 ? num.toString() : num.toFixed(3);
};

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

const getMovementTone = (type?: string) => {
  switch (type) {
    case "STOCK_IN":
    case "RETURN":
    case "OPENING_STOCK":
      return "green";
    case "SALE":
    case "DM":
    case "STOCK_OUT":
    case "ORDER_DISPATCH":
      return "blue";
    case "DAMAGE_LOSS":
      return "red";
    case "MANUAL_ADJUSTMENT":
    default:
      return "neutral";
  }
};

const getMovementLabel = (type?: string) => {
  return (type || "MOVEMENT").replace("_", " ").toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const getMovementStyle = (type: string) => {
  switch (type) {
    case "STOCK_IN":
    case "RETURN":
    case "OPENING_STOCK":
      return {
        borderColor: colors.success,
        bgTint: "rgba(22, 163, 74, 0.02)",
        badgeBg: "rgba(22, 163, 74, 0.08)",
        textColor: colors.success,
      };
    case "DAMAGE_LOSS":
    case "STOCK_OUT":
      return {
        borderColor: colors.danger,
        bgTint: "rgba(220, 38, 38, 0.02)",
        badgeBg: "rgba(220, 38, 38, 0.08)",
        textColor: colors.danger,
      };
    case "SALE":
    case "DM":
    case "ORDER_DISPATCH":
      return {
        borderColor: colors.primary,
        bgTint: "rgba(37, 99, 235, 0.02)",
        badgeBg: "rgba(37, 99, 235, 0.08)",
        textColor: colors.primary,
      };
    case "MANUAL_ADJUSTMENT":
    default:
      return {
        borderColor: colors.warning,
        bgTint: "rgba(217, 119, 6, 0.02)",
        badgeBg: "rgba(217, 119, 6, 0.08)",
        textColor: colors.warning,
      };
  }
};

export function StockMovementHistory() {
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === "OWNER";
  const { data: movements, isLoading, isFetching, refetch } = useStockMovementsQuery(undefined, filterType);

  const filterTabs = [
    { label: "ALL", value: "ALL" },
    { label: "STOCK IN", value: "STOCK_IN" },
    { label: "SALES", value: "SALE" },
    { label: "MEMOS", value: "DM" },
    { label: "ADJUST", value: "MANUAL_ADJUSTMENT" },
    { label: "DAMAGE", value: "DAMAGE_LOSS" },
  ];

  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader 
        title="Stock Ledger" 
        subtitle="Physical inventory transactions & audit logs." 
        showBack
      />

      {/* Filter Pill Row */}
      <View style={styles.filterOuterContainer}>
        <AppChipGroup
          scrollable
          value={filterType ?? "ALL"}
          onChange={(value) => setFilterType(value === "ALL" ? undefined : value)}
          options={filterTabs.map((tab) => ({ value: tab.value, label: tab.label }))}
        />
      </View>

      <View style={styles.listWrapper}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlashList
            data={movements}
            keyExtractor={(item: StockMovement) => item.id}
            onRefresh={refetch}
            refreshing={isFetching}
            renderItem={({ item: move }: { item: StockMovement }) => {
              const direction = getStockMovementDirection(move);
              const quantity = getStockMovementQuantity(move);
              const dateStr = new Date(move.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
              });
              const itemTitle = move.item?.name ? formatItemName(move.item.name) : "Unknown Item";
              const operator = move.createdBy?.name || "System";
              const mvStyle = getMovementStyle(move.movementType);

              // Reference logic
              let referenceLabel = "Internal Entry";
              let referenceIcon = "file-document-outline";
              const referenceKind = getStockMovementReferenceKind(move.referenceType);
              if (referenceKind === "SALE") {
                referenceLabel = move.sale?.saleNumber ? `Invoice #${move.sale.saleNumber}` : "Linked sale";
                referenceIcon = "receipt";
              } else if (referenceKind === "DM") {
                referenceLabel = move.deliveryMemo?.dmNumber ? `DM #${move.deliveryMemo.dmNumber}` : "Linked delivery memo";
                referenceIcon = "truck-delivery";
              } else if (referenceKind === "ORDER") {
                referenceLabel = move.order?.orderNumber ? `Order #${move.order.orderNumber}` : "Linked order";
                referenceIcon = "cart-outline";
              }

              return (
                <Pressable
                  onPress={() => setSelectedMovement(move)}
                  style={({ pressed }) => pressed && { opacity: 0.8 }}
                >
                  <View style={[
                    styles.ledgerCard,
                    { borderLeftColor: mvStyle.borderColor, backgroundColor: colors.surface }
                  ]}>
                    <View style={styles.cardInner}>
                    {/* Left details */}
                    <View style={styles.detailsCol}>
                      <Text style={styles.itemText} numberOfLines={1}>{itemTitle}</Text>
                      
                      <View style={styles.metaRow}>
                        <StatusPill 
                          label={getMovementLabel(move.movementType)} 
                          tone={getMovementTone(move.movementType)}
                          style={styles.typePill}
                        />
                        <View style={styles.iconLabel}>
                          <Icon source="account-circle-outline" size={14} color={colors.textMuted} />
                          <Text style={styles.metaText}>{operator}</Text>
                        </View>
                        <View style={styles.iconLabel}>
                          <Icon source="clock-outline" size={14} color={colors.textMuted} />
                          <Text style={styles.metaText}>{dateStr}</Text>
                        </View>
                      </View>

                      <View style={styles.referenceRow}>
                        <Icon source={referenceIcon} size={14} color={colors.textSecondary} />
                        <Text style={styles.referenceText}>{referenceLabel}</Text>
                      </View>

                      {move.reason && (
                        <Text style={styles.reasonText} numberOfLines={1}>
                          Note: "{move.reason}"
                        </Text>
                      )}
                    </View>

                    {/* Right quantities */}
                    <View style={styles.qtyCol}>
                      <View style={[
                        styles.qtyBadge,
                        { backgroundColor: mvStyle.badgeBg }
                      ]}>
                        <Text style={[
                          styles.qtyText,
                          { color: mvStyle.textColor }
                        ]}>
                          {direction === "in" ? "+" : direction === "out" ? "-" : ""}{qty(quantity)}
                        </Text>
                      </View>
                      {isOwner && (
                        <Pressable
                          style={styles.cardEditBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            navigate("AddEditItem", { itemId: move.itemId });
                          }}
                        >
                          <Icon source="pencil-outline" size={16} color={colors.textSecondary} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
            }}
            ListEmptyComponent={
              <EmptyState 
                title="No transactions found" 
                subtitle="Physical stock movements will log automatically when items are sold, returned, or restocked."
                icon="swap-horizontal"
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

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
              const direction = getStockMovementDirection(selectedMovement);
              const quantity = getStockMovementQuantity(selectedMovement);
              const referenceKind = getStockMovementReferenceKind(selectedMovement.referenceType);
              const referenceId = selectedMovement.referenceId;
              const quantityColor = direction === "in" ? colors.success : direction === "out" ? colors.danger : colors.textSecondary;

              return (
                <View style={styles.modalBody}>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.detailLabel}>Product</Text>
                    <View style={styles.modalProductValueContainer}>
                      <Text style={[styles.detailValue, { flexShrink: 1, textAlign: "right" }]}>
                        {selectedMovement.item?.name ? formatItemName(selectedMovement.item.name) : "Unknown Item"}
                      </Text>
                      {isOwner && (
                        <Pressable
                          onPress={() => {
                            setSelectedMovement(null);
                            navigate("AddEditItem", { itemId: selectedMovement.itemId });
                          }}
                          style={styles.modalEditBtn}
                        >
                          <Icon source="pencil-outline" size={14} color={colors.primary} />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <Text style={styles.detailLabel}>Movement Type</Text>
                    <Text style={styles.detailValue}>
                      {getMovementLabel(selectedMovement.movementType)}
                    </Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <Text style={styles.detailLabel}>Quantity Changed</Text>
                    <Text
                      style={[styles.detailValue, { color: quantityColor, fontWeight: fontWeight.black }]}
                    >
                      {direction === "in" ? "+" : direction === "out" ? "−" : ""}{qty(quantity)} {selectedMovement.item?.unit || ""}
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
                    <View style={styles.modalReasonCard}>
                      <Text style={styles.modalReasonTitle}>Note / Reason</Text>
                      <Text style={styles.modalReasonText}>{selectedMovement.reason}</Text>
                    </View>
                  ) : null}

                  {referenceKind === "SALE" && referenceId ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.linkRow,
                        pressed && styles.linkRowPressed
                      ]}
                      onPress={() => {
                        setSelectedMovement(null);
                        navigate("SaleDetail", { id: referenceId });
                      }}
                    >
                      <View style={styles.linkLeft}>
                        <Icon source="receipt" size={20} color={colors.primary} />
                        <Text style={styles.linkLabel}>
                          {selectedMovement.sale?.saleNumber
                            ? `View Sale #${selectedMovement.sale.saleNumber}`
                            : "View sale details"}
                        </Text>
                      </View>
                      <Icon source="chevron-right" size={20} color={colors.primary} />
                    </Pressable>
                  ) : null}

                  {referenceKind === "DM" && referenceId ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.linkRow,
                        pressed && styles.linkRowPressed
                      ]}
                      onPress={() => {
                        setSelectedMovement(null);
                        navigate("DeliveryMemoDetail", { id: referenceId });
                      }}
                    >
                      <View style={styles.linkLeft}>
                        <Icon source="file-document-outline" size={20} color={colors.primary} />
                        <Text style={styles.linkLabel}>
                          {selectedMovement.deliveryMemo?.dmNumber
                            ? `View Delivery Memo #${selectedMovement.deliveryMemo.dmNumber}`
                            : "View delivery memo details"}
                        </Text>
                      </View>
                      <Icon source="chevron-right" size={20} color={colors.primary} />
                    </Pressable>
                  ) : null}

                  {referenceKind === "ORDER" && referenceId ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.linkRow,
                        pressed && styles.linkRowPressed
                      ]}
                      onPress={() => {
                        setSelectedMovement(null);
                        navigate("OrderDetail", { orderId: referenceId });
                      }}
                    >
                      <View style={styles.linkLeft}>
                        <Icon source="package-variant-closed" size={20} color={colors.primary} />
                        <Text style={styles.linkLabel}>
                          {selectedMovement.order?.orderNumber
                            ? `View Order #${selectedMovement.order.orderNumber}`
                            : "View order details"}
                        </Text>
                      </View>
                      <Icon source="chevron-right" size={20} color={colors.primary} />
                    </Pressable>
                  ) : null}
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
  listWrapper: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterOuterContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: "#ffffff",
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  ledgerCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    gap: spacing.md,
  },
  detailsCol: {
    flex: 1,
    gap: 6,
  },
  itemText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  iconLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  referenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  referenceText: {
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  reasonText: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  qtyCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 80,
    gap: spacing.xs,
  },
  cardEditBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    fontVariant: ['tabular-nums'],
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    minHeight: 18,
    borderRadius: radius.sm,
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
  modalProductValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  modalEditBtn: {
    padding: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
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
  modalReasonCard: {
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalReasonTitle: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  modalReasonText: {
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
