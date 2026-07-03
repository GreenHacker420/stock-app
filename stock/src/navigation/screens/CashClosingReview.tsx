import { useEffect, useState } from "react";
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text, Card, Icon, Divider } from "react-native-paper";

import { fetchCashSessions, reviewCashSession, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { StatusPill } from "../../components/ui/StatusPill";
import { Button } from "../../components/ui/Button";
import { AppSegmentedControl } from "../../components/ui/AppSegmentedControl";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { EmptyState } from "../../components/ui/EmptyState";

export function CashClosingReview() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();

  const [shopId, setShopId] = useState<string | undefined>();
  const [filter, setFilter] = useState("pending");

  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  useEffect(() => {
    if (!shopsQuery.data?.length) return;
    if (shopId && shopsQuery.data.some((shop) => shop.id === shopId)) return;
    const activeShop = activeShopId
      ? shopsQuery.data.find((shop) => shop.id === activeShopId)
      : undefined;
    setShopId(activeShop?.id ?? shopsQuery.data[0].id);
  }, [activeShopId, shopId, shopsQuery.data]);

  const sessionsQuery = useQuery({
    queryKey: ["cash-sessions", shopId],
    queryFn: () => fetchCashSessions(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const reviewMutation = useMutation({
    mutationFn: (sessionId: string) => reviewCashSession(token ?? "", sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-sessions", shopId] });
      queryClient.invalidateQueries({ queryKey: ["shops"] });
    },
  });

  const filteredSessions = sessionsQuery.data?.filter((session) => {
    if (filter === "pending") {
      return session.status === "CLOSED";
    } else {
      return session.status === "REVIEWED" || session.status === "LOCKED";
    }
  }) ?? [];

  const pendingCount = sessionsQuery.data?.filter(s => s.status === 'CLOSED').length ?? 0;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title="Closing Review"
        subtitle={`${pendingCount} sessions awaiting executive approval.`}
      />

      <View style={styles.headerControls}>
         <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />
      </View>

      <View style={styles.tabBar}>
         <AppSegmentedControl
           value={filter}
           onChange={setFilter}
           options={[
             { value: "pending", label: "Pending" },
             { value: "reviewed", label: "History" },
           ]}
           style={styles.tabs}
         />
         <View style={styles.recordBadge}>
            <Text style={styles.recordBadgeText}>{filteredSessions.length} RECORDS</Text>
         </View>
      </View>

      <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          {sessionsQuery.isLoading ? (
            <View style={styles.loadingWrapper}>
               <ActivityIndicator color={colors.primary} />
               <Text style={styles.loadingText}>Scanning ledger records...</Text>
            </View>
          ) : null}

          {!sessionsQuery.isLoading && filteredSessions.length === 0 ? (
            <EmptyState 
              icon="check-circle-outline" 
              title="Clear Ledger" 
              subtitle="All shop closures have been processed." 
            />
          ) : null}

          <View style={styles.sessionList}>
            {filteredSessions.map((session) => {
              const diff = Number(session.difference || 0);
              const isMismatched = Math.abs(diff) > 0.01;

              return (
                <View key={session.id} style={styles.sessionCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.operatorRow}>
                       <Icon source="account-tie-outline" size={18} color={colors.textInverse} />
                       <Text style={styles.operatorName}>OPERATOR: {session.staff?.name.toUpperCase()}</Text>
                    </View>
                    <StatusPill label={session.status} tone={session.status === "REVIEWED" ? "green" : "amber"} />
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.mainMetrics}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>EXPECTED LEDGER</Text>
                        <Text style={styles.metricValue}>₹{session.expectedCash.toLocaleString()}</Text>
                      </View>
                      <View style={[styles.metricItem, { alignItems: 'flex-end' }]}>
                        <Text style={styles.metricLabel}>PHYSICAL COUNT</Text>
                        <Text style={[styles.metricValue, { color: isMismatched ? colors.danger : colors.success }]}>
                           ₹{(session.actualCash || 0).toLocaleString()}
                        </Text>
                      </View>
                    </View>

	                    <View style={styles.detailsBox}>
	                      <DetailRow label="Handover Amount" value={`₹${(session.cashHandover || 0).toLocaleString()}`} />

	                      {isMismatched ? (
                        <View style={styles.mismatchBox}>
                           <DetailRow label="Reconciliation Gap" value={`${diff > 0 ? "+" : ""}₹${diff.toFixed(2)}`} isAlert />
                           <Text style={styles.mismatchReason}>Remark: {session.differenceReason || "No explanation provided"}</Text>
                        </View>
                      ) : (
                        <View style={styles.matchedBox}>
                           <Text style={styles.matchedLabel}>Status</Text>
                           <Text style={styles.matchedValue}>MATCHED</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.cardFooter}>
                       <View>
                          <Text style={styles.footerLabel}>SHIFT DURATION</Text>
                          <Text style={styles.footerValue}>
                            {new Date(session.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {session.closedAt ? new Date(session.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing'}
                          </Text>
                       </View>
                       {session.status === "CLOSED" && (
                         <Button
                            label="Approve"
                            size="sm"
                            loading={reviewMutation.isPending && reviewMutation.variables === session.id}
                            onPress={() => reviewMutation.mutate(session.id)}
                            style={styles.approveButton}
                          />
                       )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
      </ScrollView>
    </Screen>
  );
}

function DetailRow({ label, value, isAlert }: { label: string, value: string, isAlert?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, isAlert && styles.alertValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerControls: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabs: {
    width: 180,
  },
  recordBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  recordBadgeText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: fontWeight.black,
  },
  listContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  loadingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xxl,
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  sessionList: {
    gap: spacing.lg,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
  },
  cardHeader: {
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  operatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  operatorName: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  mainMetrics: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    color: colors.textMuted,
    fontWeight: fontWeight.black,
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  detailsBox: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: fontWeight.medium,
  },
  rowValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: fontWeight.bold,
  },
  alertValue: {
    color: colors.danger,
  },
  deductionRow: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  deductionReason: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  mismatchBox: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(220, 38, 38, 0.1)',
  },
  mismatchReason: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
  matchedBox: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(5, 150, 105, 0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  matchedLabel: {
    fontSize: 12,
    color: colors.success,
    fontWeight: fontWeight.bold,
  },
  matchedValue: {
    fontSize: 12,
    color: colors.success,
    fontWeight: fontWeight.black,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  footerLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  footerValue: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  approveButton: {
    minWidth: 100,
  }
});
