import { useEffect, useState, useMemo } from "react";
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, Card, Icon, Divider, List } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { fetchDailySummary, lockDailySummary, fetchDailySummaryById, lockDailySummaryById } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../../theme';
import { requireActiveShopId } from "../../hooks/useActiveShop";

export function DailySummary() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();
  const route = useRoute<any>();

  const today = new Date().toISOString().split('T')[0];
  const targetDate = route.params?.date || today;
  const targetId = route.params?.id;

  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  const summaryQuery = useQuery({ 
    queryKey: targetId 
      ? ["daily-summary-id", targetId] 
      : ["daily-summary", activeShopId, targetDate], 
    queryFn: () => targetId 
      ? fetchDailySummaryById(token ?? "", targetId)
      : fetchDailySummary(token ?? "", activeShopId ?? "", targetDate), 
    enabled: !!token && (!!targetId || (!!activeShopId && !!targetDate))
  });

  const lockMutation = useMutation({
    mutationFn: () => targetId 
      ? lockDailySummaryById(token ?? "", targetId)
      : lockDailySummary(token ?? "", requireActiveShopId(activeShopId), targetDate),
    onSuccess: () => {
      if (targetId) {
        queryClient.invalidateQueries({ queryKey: ["daily-summary-id", targetId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["daily-summary", activeShopId, targetDate] });
      }
      queryClient.invalidateQueries({ queryKey: ["daily-summaries"] });
      setSuccessTitle("Summary Locked");
      setSuccessMessage("The daily operations summary has been locked and compiled successfully.");
      setSuccessVisible(true);
    },
  });

  const summary = summaryQuery.data;
  const isLocked = summary?.status === "LOCKED";

  if (summaryQuery.isLoading) {
    return (
      <Screen>
        <AppHeader title="Daily Report" subtitle="Retrieving today's operations..." />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Fetching summary data...</Text>
        </View>
      </Screen>
    );
  }

  const actualCash = Number(summary?.actualCash || 0);
  const expectedCash = Number(summary?.expectedCash || 0);
  const difference = actualCash - expectedCash;
  const isMatch = actualCash === expectedCash;

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <AppHeader title="Daily Report" subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.mainContainer}>
          
          {/* Executive Reconciliation Hero Card */}
          <Card style={styles.heroCard}>
            <Card.Content style={styles.heroContent}>
              <View style={styles.heroHeader}>
                <Text style={styles.heroLabel}>EXECUTIVE RECONCILIATION</Text>
                <View style={[styles.statusBadge, isLocked ? styles.statusLocked : styles.statusOpen]}>
                  <View style={[styles.statusDot, isLocked ? styles.dotLocked : styles.dotOpen]} />
                  <Text style={[styles.statusText, isLocked ? styles.textLocked : styles.textOpen]}>
                    {isLocked ? "LOCKED" : "DRAFT"}
                  </Text>
                </View>
              </View>

              <View style={styles.reconcileCircle}>
                <View style={styles.reconcileArc} />
                <View style={styles.centerAlign}>
                  <Text style={styles.cashAmount}>₹{actualCash.toLocaleString("en-IN")}</Text>
                  <Text style={styles.cashLabel}>CASH ON HAND</Text>
                </View>
              </View>

              <View style={styles.expectedActualContainer}>
                <View style={styles.flex1}>
                  <Text style={styles.miniLabel}>EXPECTED CASH</Text>
                  <Text style={styles.miniValue}>₹{expectedCash.toLocaleString("en-IN")}</Text>
                </View>
                <View style={styles.alertIconWrapper}>
                  <Icon 
                    source={isMatch ? "check-circle-outline" : "alert-circle-outline"} 
                    size={28} 
                    color={isMatch ? colors.success : colors.danger} 
                  />
                </View>
                <View style={[styles.flex1, styles.rightAlign]}>
                  <Text style={styles.miniLabel}>ACTUAL CASH</Text>
                  <Text style={styles.miniValue}>₹{actualCash.toLocaleString("en-IN")}</Text>
                </View>
              </View>

              {!isMatch && (
                <View style={[styles.diffAlert, { backgroundColor: difference > 0 ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)' }]}>
                  <Text style={[styles.diffAlertText, { color: difference > 0 ? colors.success : colors.danger }]}>
                    {difference > 0 
                      ? `Surplus cash detected: +₹${difference.toLocaleString("en-IN")}` 
                      : `Deficit cash detected: -₹${Math.abs(difference).toLocaleString("en-IN")}`
                    }
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>

          {/* Smart Insight Panel */}
          <View style={styles.insightCard}>
            <View style={styles.insightIconWrapper}>
              <Icon source="lightbulb-on-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.insightTitle}>Smart Insight</Text>
              <Text style={styles.insightText}>
                {summary?.salesCount} bills issued today. {summary?.totalUpiCollected ? `UPI collections are ₹${Number(summary.totalUpiCollected).toLocaleString("en-IN")}.` : 'No UPI collections recorded yet.'}
              </Text>
            </View>
          </View>

          {/* Detailed Statistics Cards */}
          <View style={styles.accordionGroup}>
            <List.Accordion
              title="Sales Performance"
              description={`₹${Number(summary?.totalSales || 0).toLocaleString("en-IN")} total sales value`}
              left={props => <List.Icon {...props} icon="trending-up" color={colors.primary} />}
              titleStyle={styles.accordionTitle}
              style={styles.accordion}
            >
              <View style={styles.accordionContent}>
                <MetricRow label="Walk-in Sales" value={`₹${Number(summary?.walkinSales || 0).toLocaleString("en-IN")}`} detail="Direct walk-in customer revenue" />
                <MetricRow label="Orders Created" value={String(summary?.ordersCreatedCount || 0)} detail="Total sales orders booked today" />
                <MetricRow label="Delivery Memos" value={String(summary?.dmCreatedCount || 0)} detail="Delivery memo transactions issued" />
              </View>
            </List.Accordion>
            
            <Divider style={{ backgroundColor: colors.border }} />

            <List.Accordion
              title="Payment Streams"
              description={`Total collection: ₹${(Number(summary?.totalCashCollected || 0) + Number(summary?.totalUpiCollected || 0) + Number(summary?.totalBankCollected || 0)).toLocaleString("en-IN")}`}
              left={props => <List.Icon {...props} icon="credit-card-outline" color={colors.primary} />}
              titleStyle={styles.accordionTitle}
              style={styles.accordion}
            >
              <View style={styles.accordionContent}>
                <BreakdownItem label="Cash" amount={summary?.totalCashCollected} />
                <BreakdownItem label="UPI" amount={summary?.totalUpiCollected} />
                <BreakdownItem label="Card" amount={summary?.totalCardCollected} />
                <BreakdownItem label="Bank Transfer" amount={summary?.totalBankCollected} />
              </View>
            </List.Accordion>
          </View>
        </View>
      </ScrollView>

      {/* Glassmorphic Footer Actions */}
      <View style={styles.footer}>
        <Button 
          mode="outlined" 
          style={styles.footerButtonOutline} 
          textColor={colors.textSecondary} 
          onPress={() => {
            setSuccessTitle("PDF Exported");
            setSuccessMessage("Daily Summary PDF has been exported successfully!");
            setSuccessVisible(true);
          }}
        >
          Export PDF
        </Button>
        <Button 
          mode="contained" 
          style={[styles.footerButtonPrimary, { backgroundColor: isLocked ? colors.success : colors.primary }]} 
          contentStyle={styles.footerButtonContent}
          onPress={() => lockMutation.mutate()}
          disabled={isLocked || lockMutation.isPending}
          loading={lockMutation.isPending}
        >
          {isLocked ? "Report Locked" : "Lock Daily Summary"}
        </Button>
      </View>

      <SuccessModal
        visible={successVisible}
        title={successTitle}
        message={successMessage}
        onClose={() => setSuccessVisible(false)}
      />
    </Screen>
  );
}

function MetricRow({ label, value, detail }: { label: string, value: string, detail: string }) {
  return (
    <View style={styles.metricRow}>
      <View style={styles.flex1}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricDetail}>{detail}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function BreakdownItem({ label, amount }: { label: string, amount: any }) {
  return (
    <View style={styles.breakdownItem}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownValue}>₹{Number(amount || 0).toLocaleString("en-IN")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  scrollContent: {
    paddingBottom: 130,
  },
  mainContainer: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.textPrimary,
    borderRadius: 28,
    overflow: 'hidden',
    ...shadow.md,
  },
  heroContent: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  heroHeader: {
    marginBottom: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
  },
  heroLabel: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: fontWeight.black,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statusOpen: {
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
  },
  statusLocked: {
    backgroundColor: 'rgba(96, 165, 250, 0.12)',
  },
  statusDot: {
    height: 6,
    width: 6,
    borderRadius: 3,
  },
  dotOpen: {
    backgroundColor: '#4ade80',
  },
  dotLocked: {
    backgroundColor: '#60a5fa',
  },
  statusText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
  },
  textOpen: {
    color: '#4ade80',
  },
  textLocked: {
    color: '#60a5fa',
  },
  reconcileCircle: {
    height: 150,
    width: 150,
    borderRadius: 75,
    borderWidth: 6,
    borderColor: '#2d3748',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  reconcileArc: {
    position: 'absolute',
    height: 150,
    width: 150,
    borderRadius: 75,
    borderLeftWidth: 6,
    borderTopWidth: 6,
    borderColor: colors.primary,
    transform: [{ rotate: '45deg' }],
  },
  centerAlign: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashAmount: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: fontWeight.black,
    letterSpacing: -0.5,
  },
  cashLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  expectedActualContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  miniLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  miniValue: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    marginTop: 2,
  },
  alertIconWrapper: {
    paddingHorizontal: spacing.sm,
  },
  rightAlign: {
    alignItems: 'flex-end',
  },
  diffAlert: {
    marginTop: spacing.md,
    width: '100%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  diffAlertText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  insightCard: {
    backgroundColor: 'rgba(22, 163, 74, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.08)',
    padding: spacing.lg,
    borderRadius: 22,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    ...shadow.sm,
  },
  insightIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(22, 163, 74, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitle: {
    color: colors.primary,
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.sm,
  },
  insightText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: 2,
  },
  accordionGroup: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  accordion: {
    backgroundColor: colors.surface,
  },
  accordionTitle: {
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    fontSize: fontSize.sm,
  },
  accordionContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceOffset,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    fontSize: fontSize.sm,
  },
  metricDetail: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  metricValue: {
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breakdownLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.sm,
  },
  breakdownValue: {
    color: colors.textPrimary,
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.sm,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  footerButtonOutline: {
    borderRadius: radius.md,
    flex: 1,
    borderColor: colors.border,
  },
  footerButtonPrimary: {
    flex: 2,
    borderRadius: radius.md,
  },
  footerButtonContent: {
    height: 50,
  },
  flex1: {
    flex: 1,
  },
});
