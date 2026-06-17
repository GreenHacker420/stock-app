import React from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Text, Card, Icon, FAB } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { EmptyState } from "../../components/ui/EmptyState";
import { useDeliveryMemosQuery } from "../../hooks/useDeliveryMemos";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";

const money = (value?: string | number | null) => "₹" + Number(value ?? 0).toLocaleString("en-IN");

export function DeliveryMemoList() {
  const { data: dms, isLoading, isFetching, refetch } = useDeliveryMemosQuery();

  const handlePress = (id: string) => {
    navigate("DeliveryMemoDetail", { id });
  };

  const getStatusTone = (status?: string) => {
    switch (status) {
      case "PAID":
      case "FULLY_PAID":
      case "CONVERTED":
        return "green";
      case "PARTIALLY_PAID":
      case "CREATED":
        return "amber";
      case "CANCELLED":
        return "red";
      case "OVERDUE":
        return "red";
      default:
        return "neutral";
    }
  };

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader 
        title="Delivery Memos" 
        subtitle="Manage kachha bills and collections." 
        showBack
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : dms && dms.length > 0 ? (
        <View style={styles.flex1}>
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
            {dms.map((dm: any) => {
              const dateStr = new Date(dm.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric"
              });

              return (
                <Pressable
                  key={dm.id}
                  onPress={() => handlePress(dm.id)}
                  style={({ pressed }) => [
                    styles.cardPressable,
                    pressed && styles.pressed
                  ]}
                >
                  <Card style={styles.card}>
                    <Card.Content style={styles.cardContent}>
                      <View style={styles.cardHeader}>
                        <View style={styles.headerTitleCol}>
                          <Text style={styles.dmNumber}>DM #{dm.dmNumber}</Text>
                          <Text style={styles.dateText}>{dateStr}</Text>
                        </View>
                        <StatusPill 
                          label={dm.status || "CREATED"} 
                          tone={getStatusTone(dm.status)} 
                        />
                      </View>

                      <View style={styles.customerRow}>
                        <Icon source="account-circle-outline" size={20} color={colors.textSecondary} />
                        <Text style={styles.customerName} numberOfLines={1}>
                          {dm.customer?.name || "Walk-in Customer"}
                        </Text>
                      </View>

                      <View style={styles.amountGrid}>
                        <View style={styles.amountCol}>
                          <Text style={styles.amountLabel}>ESTIMATED AMOUNT</Text>
                          <Text style={styles.amountValue}>{money(dm.estimatedAmount)}</Text>
                        </View>
                        <View style={styles.amountCol}>
                          <Text style={styles.amountLabel}>PAID AMOUNT</Text>
                          <Text style={[styles.amountValue, { color: colors.success }]}>
                            {money(dm.paidAmount)}
                          </Text>
                        </View>
                        <View style={[styles.amountCol, styles.rightAlign]}>
                          <Text style={styles.amountLabel}>BALANCE DUE</Text>
                          <Text style={[
                            styles.amountValue, 
                            { color: Number(dm.balanceAmount) > 0 ? colors.danger : colors.textSecondary }
                          ]}>
                            {money(dm.balanceAmount)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.cardFooter}>
                        <View style={styles.footerInfo}>
                          <Icon source="package-variant-closed" size={14} color={colors.textMuted} />
                          <Text style={styles.footerText}>
                            {dm.items?.length || 0} items listed
                          </Text>
                        </View>
                        <View style={[styles.footerInfo, styles.flexEnd]}>
                          <Text style={styles.viewLink}>View details</Text>
                          <Icon source="chevron-right" size={16} color={colors.primary} />
                        </View>
                      </View>
                    </Card.Content>
                  </Card>
                </Pressable>
              );
            })}
          </ScrollView>

          <FAB
            icon="plus"
            style={styles.fab}
            color="#ffffff"
            onPress={() => navigate("CreateDeliveryMemo")}
            label="New Memo"
          />
        </View>
      ) : (
        <View style={styles.flex1}>
          <EmptyState 
            title="No Delivery Memos" 
            subtitle="Create your first kachha bill / delivery memo to get started."
            icon="truck-delivery"
          />
          <FAB
            icon="plus"
            style={styles.fab}
            color="#ffffff"
            onPress={() => navigate("CreateDeliveryMemo")}
            label="New Memo"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 110,
    gap: spacing.md,
  },
  cardPressable: {
    borderRadius: radius.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    elevation: 2,
  },
  cardContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitleCol: {
    gap: 2,
  },
  dmNumber: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customerName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    flex: 1,
  },
  amountGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
  },
  amountCol: {
    gap: 4,
  },
  rightAlign: {
    alignItems: "flex-end",
  },
  amountLabel: {
    fontSize: 9,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  flexEnd: {
    flex: 1,
    justifyContent: "flex-end",
  },
  viewLink: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: fontWeight.extrabold,
  },
  fab: {
    position: "absolute",
    margin: 24,
    right: 0,
    bottom: 24,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
