import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Text, Card, Icon } from "react-native-paper";
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

export function StockMovementHistory() {
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const { data: movements, isLoading, isFetching, refetch } = useStockMovementsQuery(undefined, filterType);

  const filterTabs = [
    { label: "ALL", value: undefined },
    { label: "STOCK IN", value: "STOCK_IN" },
    { label: "SALES", value: "SALE" },
    { label: "MEMOS", value: "DM" },
    { label: "ADJUST", value: "ADJUSTMENT" },
    { label: "DAMAGE", value: "DAMAGE" },
  ];

  const getMovementTone = (type?: string) => {
    switch (type) {
      case "STOCK_IN":
      case "RETURN":
        return "green";
      case "SALE":
      case "DM":
      case "STOCK_OUT":
        return "blue";
      case "DAMAGE":
        return "red";
      case "ADJUSTMENT":
      default:
        return "neutral";
    }
  };

  const getMovementLabel = (type?: string) => {
    return (type || "MOVEMENT").replace("_", " ");
  };

  return (
    <Screen edges={["top", "left", "right"]}>
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
                onPress={() => setFilterType(tab.value)}
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

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : movements && movements.length > 0 ? (
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={isFetching} 
              onRefresh={refetch} 
              colors={[colors.primary]} 
            />
          }
        >
          {movements.map((move: any) => {
            const hasIn = Number(move.quantityIn || 0) > 0;
            const quantity = hasIn ? move.quantityIn : move.quantityOut;
            const dateStr = new Date(move.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            });
            const itemTitle = move.item?.name || "Unknown Item";
            const operator = move.createdBy?.name || "System";

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
              <Card key={move.id} style={styles.ledgerCard}>
                <Card.Content style={styles.cardContent}>
                  {/* Left row / main details */}
                  <View style={styles.cardBody}>
                    <View style={styles.detailsCol}>
                      <Text style={styles.itemText} numberOfLines={1}>{itemTitle}</Text>
                      
                      <View style={styles.metaRow}>
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

                    {/* Right row / quantities & type */}
                    <View style={styles.qtyCol}>
                      <View style={[
                        styles.qtyBadge,
                        hasIn ? styles.qtyBadgeIn : styles.qtyBadgeOut
                      ]}>
                        <Text style={[
                          styles.qtyText,
                          hasIn ? styles.qtyTextIn : styles.qtyTextOut
                        ]}>
                          {hasIn ? "+" : "-"}{qty(quantity)}
                        </Text>
                      </View>
                      <StatusPill 
                        label={getMovementLabel(move.movementType)} 
                        tone={getMovementTone(move.movementType)}
                        style={styles.typePill}
                      />
                    </View>
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </ScrollView>
      ) : (
        <EmptyState 
          title="No transactions found" 
          subtitle="Physical stock movements will log automatically when items are sold, returned, or restocked."
          icon="swap-horizontal"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
    gap: spacing.sm,
  },
  ledgerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    elevation: 1,
  },
  cardContent: {
    padding: spacing.md,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  detailsCol: {
    flex: 1,
    gap: 6,
  },
  itemText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
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
    gap: 8,
    minWidth: 80,
  },
  qtyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBadgeIn: {
    backgroundColor: "rgba(22, 163, 74, 0.08)",
  },
  qtyBadgeOut: {
    backgroundColor: "rgba(220, 38, 38, 0.08)",
  },
  qtyText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
  },
  qtyTextIn: {
    color: colors.success,
  },
  qtyTextOut: {
    color: colors.danger,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    minHeight: 18,
    borderRadius: radius.sm,
  },
});
