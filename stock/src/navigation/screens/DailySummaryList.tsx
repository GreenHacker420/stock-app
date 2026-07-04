import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Card, Icon } from "react-native-paper";
import { ListScreen } from "../../components/layout/ListScreen";
import { StatusPill } from "../../components/ui/StatusPill";
import { EmptyState } from "../../components/ui/EmptyState";
import { useDailySummariesQuery } from "../../hooks/useDailySummary";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";

const money = (value?: string | number | null) => "₹" + Number(value ?? 0).toLocaleString("en-IN");

export function DailySummaryList() {
  const { data: summaries, isLoading, isFetching, refetch } = useDailySummariesQuery();

  const handlePress = (item: any) => {
    navigate("DailySummary", { id: item.id, date: item.date });
  };

  const getStatusTone = (status?: string) => {
    switch (status) {
      case "LOCKED":
        return "green";
      case "DRAFT":
      case "GENERATED":
        return "amber";
      default:
        return "neutral";
    }
  };

  return (
    <ListScreen
      title="Day End Reports"
      subtitle="Historical records of shop-end closing balances."
      showBack
      data={summaries ?? []}
      keyExtractor={(item: any) => item.id}
      isLoading={isLoading}
      isRefreshing={isFetching}
      onRefresh={refetch}
      empty={
        <EmptyState
          title="No reports compiled yet"
          subtitle="Reports will appear once staff closes the counter session for a day."
          icon="file-chart-outline"
        />
      }
      renderItem={({ item }: { item: any }) => {
            const dateStr = new Date(item.date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              weekday: "short"
            });
            const actual = Number(item.actualCash || 0);
            const expected = Number(item.expectedCash || 0);
            const diff = actual - expected;

        return (
              <Pressable
                onPress={() => handlePress(item)}
                style={({ pressed }) => [
                  styles.cardPressable,
                  pressed && styles.pressed
                ]}
              >
                <Card style={styles.card}>
                  <Card.Content style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <View style={styles.dateRow}>
                        <Icon source="calendar-month-outline" size={18} color={colors.textSecondary} />
                        <Text style={styles.dateText}>{dateStr}</Text>
                      </View>
                      <StatusPill 
                        label={item.status || "DRAFT"} 
                        tone={getStatusTone(item.status)} 
                      />
                    </View>

                    <View style={styles.statGrid}>
                      <View style={styles.statCol}>
                        <Text style={styles.statLabel}>SALES VALUE</Text>
                        <Text style={styles.statValue}>{money(item.totalSales)}</Text>
                      </View>
                      <View style={styles.statCol}>
                        <Text style={styles.statLabel}>CASH ON HAND</Text>
                        <Text style={styles.statValue}>{money(item.actualCash)}</Text>
                      </View>
                    </View>

                    {diff !== 0 && (
                      <View style={[
                        styles.mismatchBadge,
                        { backgroundColor: diff > 0 ? "rgba(22, 163, 74, 0.08)" : "rgba(220, 38, 38, 0.08)" }
                      ]}>
                        <Icon 
                          source={diff > 0 ? "arrow-up-bold-circle-outline" : "arrow-down-bold-circle-outline"} 
                          size={14} 
                          color={diff > 0 ? colors.success : colors.danger} 
                        />
                        <Text style={[
                          styles.mismatchText, 
                          { color: diff > 0 ? colors.success : colors.danger }
                        ]}>
                          {diff > 0 ? `Surplus: +${money(diff)}` : `Mismatch: -${money(Math.abs(diff))}`}
                        </Text>
                      </View>
                    )}

                    <View style={styles.cardFooter}>
                      <View style={styles.footerInfo}>
                        <Icon source="receipt-outline" size={14} color={colors.textMuted} />
                        <Text style={styles.footerText}>{item.salesCount || 0} Bills Issued</Text>
                      </View>
                      <View style={styles.footerInfo}>
                        <Icon source="truck-delivery-outline" size={14} color={colors.textMuted} />
                        <Text style={styles.footerText}>{item.dmCreatedCount || 0} DMs</Text>
                      </View>
                      <View style={[styles.footerInfo, styles.flexEnd]}>
                        <Text style={styles.viewLink}>View Report</Text>
                        <Icon source="chevron-right" size={16} color={colors.primary} />
                      </View>
                    </View>
                  </Card.Content>
                </Card>
              </Pressable>
        );
      }}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 100,
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
    alignItems: "center",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dateText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  statGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCol: {
    flex: 1,
    gap: 4,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  mismatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 4,
  },
  mismatchText: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
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
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
