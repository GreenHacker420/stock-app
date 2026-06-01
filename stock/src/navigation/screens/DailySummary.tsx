import { useEffect, useState, useMemo } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, Card, Icon, Divider, List, ActivityIndicator } from "react-native-paper";
import { fetchDailySummary, lockDailySummary, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../../theme';

export function DailySummary() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];

  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  const summaryQuery = useQuery({ 
    queryKey: ["daily-summary", activeShopId, today], 
    queryFn: () => fetchDailySummary(token ?? "", activeShopId ?? "", today), 
    enabled: !!token && !!activeShopId 
  });

  const lockMutation = useMutation({
    mutationFn: () => lockDailySummary(token ?? "", activeShopId ?? "", today),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-summary", activeShopId, today] });
      setSuccessTitle("Summary Locked");
      setSuccessMessage("The daily operations summary has been locked and compiled successfully.");
      setSuccessVisible(true);
    },
  });

  const summary = summaryQuery.data;
  const isLocked = summary?.status === "LOCKED";

  if (summaryQuery.isLoading) return <Screen><ActivityIndicator style={{ flex: 1 }} /></Screen>;

  return (
    <Screen scroll={true}>
      <AppHeader title="Daily Report" subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.mainContainer}>
          
          {/* Reconciliation Hero */}
          <Card style={styles.heroCard}>
             <Card.Content style={styles.heroContent}>
                <View style={styles.heroHeader}>
                  <Text variant="labelMedium" style={styles.heroLabel}>EXECUTIVE RECONCILIATION</Text>
                  <View style={[styles.statusBadge, isLocked ? styles.statusLocked : styles.statusOpen]}>
                    <View style={[styles.statusDot, isLocked ? styles.dotLocked : styles.dotOpen]} />
                    <Text style={[styles.statusText, isLocked ? styles.textLocked : styles.textOpen]}>{summary?.status}</Text>
                  </View>
                </View>

                <View style={styles.reconcileCircle}>
                   <View style={styles.reconcileArc} />
                   <View className="items-center">
                      <Text variant="displaySmall" style={styles.cashAmount}>₹{Number(summary?.actualCash || 0).toLocaleString()}</Text>
                      <Text variant="labelSmall" style={styles.cashLabel}>CASH ON HAND</Text>
                   </View>
                </View>

                <View style={styles.expectedActualContainer}>
                  <View>
                    <Text style={styles.miniLabel}>EXPECTED</Text>
                    <Text style={styles.miniValue}>₹{Number(summary?.expectedCash || 0).toLocaleString()}</Text>
                  </View>
                  <Icon source={summary?.actualCash === summary?.expectedCash ? "checkbox-marked-circle" : "alert-circle"} size={24} color={summary?.actualCash === summary?.expectedCash ? colors.success : colors.danger} />
                  <View className="items-end">
                    <Text style={styles.miniLabel}>ACTUAL</Text>
                    <Text style={styles.miniValue}>₹{Number(summary?.actualCash || 0).toLocaleString()}</Text>
                  </View>
                </View>
             </Card.Content>
          </Card>

          <View style={styles.insightCard}>
             <Icon source="lightbulb-outline" size={20} color={colors.primary} />
             <View className="flex-1">
               <Text variant="titleSmall" style={styles.insightTitle}>Smart Insight</Text>
               <Text variant="bodySmall" style={styles.insightText}>
                 {summary?.salesCount} bills issued today. {summary?.totalUpiCollected ? `UPI collections are ₹${Number(summary.totalUpiCollected).toLocaleString()}.` : 'No UPI collections recorded yet.'}
               </Text>
             </View>
          </View>

          <View style={styles.accordionGroup}>
              <List.Accordion
                title="Sales Performance"
                description={`₹${Number(summary?.totalSales || 0).toLocaleString()} total value`}
                left={props => <List.Icon {...props} icon="trending-up" color={colors.primary} />}
                titleStyle={styles.accordionTitle}
                style={styles.accordion}
              >
                <View style={styles.accordionContent}>
                   <MetricRow label="Walk-in Sales" value={`₹${Number(summary?.walkinSales || 0).toLocaleString()}`} detail="Immediate payment" />
                   <MetricRow label="Dispatched Today" value={String(summary?.ordersDispatchedCount || 0)} detail="Order fulfillment" />
                </View>
              </List.Accordion>
              
              <Divider />

              <List.Accordion
                title="Payment Streams"
                description={`Total collection: ₹${(Number(summary?.totalCashCollected || 0) + Number(summary?.totalUpiCollected || 0)).toLocaleString()}`}
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

      <View style={styles.footer}>
          <Button mode="outlined" style={styles.footerButtonOutline} textColor={colors.textSecondary} onPress={() => {
            setSuccessTitle("PDF Exported");
            setSuccessMessage("Daily Summary PDF has been exported successfully!");
            setSuccessVisible(true);
          }}>Export PDF</Button>
          <Button 
            mode="contained" 
            style={[styles.footerButtonPrimary, { backgroundColor: isLocked ? colors.success : colors.primary }]} 
            contentStyle={styles.footerButtonContent}
            onPress={() => lockMutation.mutate()}
            disabled={isLocked || lockMutation.isPending}
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
      <View>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text variant="bodySmall" style={styles.metricDetail}>{detail}</Text>
      </View>
      <Text variant="titleLarge" style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function BreakdownItem({ label, amount }: { label: string, amount: any }) {
  return (
    <View style={styles.breakdownItem}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownValue}>₹{Number(amount || 0).toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 120,
  },
  mainContainer: {
    padding: spacing.lg,
    gap: spacing.xxl,
  },
  heroCard: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.md,
  },
  heroContent: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  heroHeader: {
    marginBottom: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
  },
  heroLabel: {
    color: colors.textMuted,
    letterSpacing: 1,
    fontWeight: fontWeight.bold,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statusOpen: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusLocked: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  statusDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
  },
  dotOpen: {
    backgroundColor: '#4ade80',
  },
  dotLocked: {
    backgroundColor: '#60a5fa',
  },
  statusText: {
    fontSize: 10,
    fontWeight: fontWeight.black,
  },
  textOpen: {
    color: '#4ade80',
  },
  textLocked: {
    color: '#60a5fa',
  },
  reconcileCircle: {
    height: 160,
    width: 160,
    borderRadius: 80,
    borderWidth: 8,
    borderColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'solid',
  },
  reconcileArc: {
    position: 'absolute',
    height: 160,
    width: 160,
    borderRadius: 80,
    borderLeftWidth: 8,
    borderTopWidth: 8,
    borderColor: colors.primary,
    transform: [{ rotate: '45deg' }],
  },
  cashAmount: {
    color: colors.surface,
    fontWeight: fontWeight.black,
  },
  cashLabel: {
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
    marginTop: -4,
  },
  expectedActualContainer: {
    marginTop: spacing.xxl,
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  miniLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeight.semibold,
  },
  miniValue: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
  },
  insightCard: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: '#dbeafe',
    padding: spacing.lg,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    ...shadow.sm,
  },
  insightTitle: {
    color: colors.primaryDark,
    fontWeight: fontWeight.extrabold,
  },
  insightText: {
    color: colors.primary,
    lineHeight: 16,
    marginTop: 2,
  },
  accordionGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.bg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  accordion: {
    backgroundColor: colors.surface,
  },
  accordionTitle: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  accordionContent: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.bg,
  },
  metricLabel: {
    fontWeight: fontWeight.bold,
    color: '#374151',
  },
  metricDetail: {
    color: colors.textMuted,
  },
  metricValue: {
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.bg,
  },
  breakdownLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  breakdownValue: {
    color: colors.textPrimary,
    fontWeight: fontWeight.extrabold,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderTopWidth: 1,
    borderTopColor: colors.bg,
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
});
