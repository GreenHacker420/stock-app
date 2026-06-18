import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";

import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { EmptyState } from "../../components/ui/EmptyState";
import { useStockMovementsQuery } from "../../hooks/useItems";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

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
  const { data: movements, isLoading, isFetching, refetch } = useStockMovementsQuery(undefined, filterType);

  const filterTabs = [
    { label: "ALL", value: undefined },
    { label: "STOCK IN", value: "STOCK_IN" },
    { label: "SALES", value: "SALE" },
    { label: "MEMOS", value: "DM" },
    { label: "ADJUST", value: "MANUAL_ADJUSTMENT" },
    { label: "DAMAGE", value: "DAMAGE_LOSS" },
  ];

  const List = FlashList as any;

  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader 
        title="Stock Ledger" 
        subtitle="Physical inventory transactions & audit logs." 
        showBack
      />

      {/* Filter Pill Row */}
      <View style={styles.filterOuterContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.filterContainer}
        >
          {filterTabs.map((tab) => {
            const isActive = filterType === tab.value;
            return (
              <Pressable
                key={tab.label}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFilterType(tab.value);
                }}
                style={[
                  styles.filterPill,
                  isActive && styles.filterPillActive
                ]}
              >
                <Text style={[
                  styles.filterPillText,
                  isActive && styles.filterPillTextActive
                ]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.listWrapper}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <List
            data={movements}
            keyExtractor={(item: any) => item.id}
            estimatedItemSize={115}
            onRefresh={refetch}
            refreshing={isFetching}
            renderItem={({ item: move }: { item: any }) => {
              const hasIn = Number(move.quantityIn || 0) > 0;
              const quantity = hasIn ? move.quantityIn : move.quantityOut;
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
              if (move.sale) {
                referenceLabel = `Invoice #${move.sale.saleNumber}`;
                referenceIcon = "receipt";
              } else if (move.deliveryMemo) {
                referenceLabel = `DM #${move.deliveryMemo.dmNumber}`;
                referenceIcon = "truck-delivery";
              } else if (move.order) {
                referenceLabel = `Order #${move.order.orderNumber}`;
                referenceIcon = "cart-outline";
              }

              return (
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
                          {hasIn ? "+" : "-"}{qty(quantity)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
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
});
