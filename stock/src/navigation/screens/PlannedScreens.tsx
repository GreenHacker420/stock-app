import { useMemo } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Text, Icon, Divider, Button as PaperButton } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useOwnerDashboardQuery } from "../../hooks/useDashboard";
import * as Haptics from "expo-haptics";

import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { useAuthStore } from "../../auth/auth-store";
import { navigate } from "../navigation-ref";

const smartTitle = (routeName: string) => {
  return routeName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const configs: Record<string, { title: string; subtitle: string; primary: string }> = {
  SplitPayment: {
    title: "Split Payment",
    subtitle: "Divide a single bill across multiple payment methods.",
    primary: "Proceed to split",
  },
  StockMovementHistory: {
    title: "Stock Ledger",
    subtitle: "Complete audit log of physical item movements.",
    primary: "Download CSV",
  },
  CorrectionRequests: {
    title: "Correction Queue",
    subtitle: "Approval requests for editing or deleting records.",
    primary: "Bulk approve",
  },
  RateChangeRequests: {
    title: "Price Approvals",
    subtitle: "Requests to sell items below minimum set price.",
    primary: "Review all",
  },
  ChequeList: {
    title: "Cheque Tracking",
    subtitle: "Monitor received, cleared, and bounced cheques.",
    primary: "Record deposit",
  },
  DeliveryMemoList: {
    title: "Delivery Memos",
    subtitle: "Manage kachha bills and pending conversions.",
    primary: "Create new DM",
  },
};

function ConfiguredScreen({ config }: { config: typeof configs[string] }) {
  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title={config.title} subtitle={config.subtitle} showBack />
      <View style={styles.emptyContainer}>
        <Icon source="progress-wrench" size={80} color={colors.surfaceOffset} />
        <Text style={styles.emptyTitle}>{config.title} is coming soon</Text>
        <Text style={styles.emptyDesc}>
          We are currently refining the {config.title.toLowerCase()} workflow to ensure it meets operational standards.
        </Text>
        <Button label={config.primary} variant="primary" style={{ marginTop: spacing.xl, width: 220 }} />
      </View>
    </Screen>
  );
}

export function OwnerRecords() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Operations History" subtitle="Consolidated business records." />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Section title="Direct reports">
          <View style={styles.gridContainer}>
            <Pressable onPress={() => navigate("SalesList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="receipt" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>SALES LOG</Text>
              <Text style={styles.statValue}>Invoices</Text>
            </Pressable>
            <Pressable onPress={() => navigate("Expenses")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="cash-minus" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>EXPENSES</Text>
              <Text style={styles.statValue}>Outgoings</Text>
            </Pressable>
            <Pressable onPress={() => navigate("CustomerList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="account-group" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>CUSTOMERS</Text>
              <Text style={styles.statValue}>Profiles</Text>
            </Pressable>
            <Pressable onPress={() => navigate("DailySummaryList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="file-chart-outline" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>SUMMARIES</Text>
              <Text style={styles.statValue}>Day End</Text>
            </Pressable>
          </View>
        </Section>

        <Section title="Banking & Finance">
          <View style={styles.gridContainer}>
            <Pressable onPress={() => navigate("ChequeList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="card-bulleted-outline" size={24} color={colors.textSecondary} />
              <Text style={styles.statLabel}>CHEQUES</Text>
              <Text style={styles.statValue}>Collection</Text>
            </Pressable>
            <Pressable onPress={() => navigate("AuditLog")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="history" size={24} color={colors.textSecondary} />
              <Text style={styles.statLabel}>AUDIT LOG</Text>
              <Text style={styles.statValue}>Tracking</Text>
            </Pressable>
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

export function OwnerStock() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Inventory Ops" subtitle="Monitor and adjust stock levels." />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Section title="Inventory Controls">
          <View style={styles.gridContainer}>
            <Pressable onPress={() => navigate("StockEntry")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="plus-box" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>ADD STOCK</Text>
              <Text style={styles.statValue}>Restock Entry</Text>
            </Pressable>
            <Pressable onPress={() => navigate("AddEditItem")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="package-variant-plus" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>ADD PRODUCT</Text>
              <Text style={styles.statValue}>New Item</Text>
            </Pressable>
            <Pressable onPress={() => navigate("ManageCategories")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="tag-multiple-outline" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>CATEGORIES</Text>
              <Text style={styles.statValue}>Manage Cats</Text>
            </Pressable>
            <Pressable onPress={() => navigate("ItemList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="barcode-scan" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>CATALOG</Text>
              <Text style={styles.statValue}>Browse Items</Text>
            </Pressable>
            <Pressable onPress={() => navigate("StockMovementHistory")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="swap-horizontal" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>STOCK LEDGER</Text>
              <Text style={styles.statValue}>History</Text>
            </Pressable>
            <Pressable onPress={() => navigate("StockDashboard")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="warehouse" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>DASHBOARD</Text>
              <Text style={styles.statValue}>Stock Alerts</Text>
            </Pressable>
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

type AlertCardProps = {
  title: string;
  desc: string;
  count: number;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  onPress: () => void;
};

function AlertCard({ title, desc, count, icon, color, bgColor, borderColor, onPress }: AlertCardProps) {
  const isPending = count > 0;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.queueCard,
        {
          backgroundColor: isPending ? bgColor : colors.surface,
          borderColor: isPending ? borderColor : colors.border,
          borderLeftColor: isPending ? color : colors.border,
        }
      ]}
    >
      {({ pressed }) => (
        <View style={StyleSheet.flatten([styles.queueCardInner, pressed && styles.pressed])}>
          <View style={styles.queueCardLeft}>
            <View style={[
              styles.queueIconBg,
              { backgroundColor: isPending ? 'rgba(255,255,255,0.7)' : colors.surfaceOffset }
            ]}>
              <Icon source={icon} size={22} color={isPending ? color : colors.textMuted} />
            </View>
            <View style={styles.queueCardInfo}>
              <Text style={styles.queueCardTitle}>{title}</Text>
              <Text style={styles.queueCardDesc} numberOfLines={2}>
                {isPending ? desc : "All caught up"}
              </Text>
            </View>
          </View>
          <View style={[
            styles.queueBadge,
            { backgroundColor: isPending ? color : colors.surfaceOffset }
          ]}>
            <Text style={[
              styles.queueBadgeText,
              { color: isPending ? '#ffffff' : colors.textSecondary }
            ]}>
              {count}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export function OwnerAlerts() {
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data as any;

  const alertCards = useMemo(() => [
    {
      id: "verifications",
      title: "Verifications Queue",
      desc: "Approve pending stock adjustments and expense requests.",
      count: dashboard?.pendingVerifications ?? 0,
      icon: "shield-check-outline",
      route: "VerificationQueue",
      params: undefined,
      color: colors.success,
      bgColor: "rgba(22, 163, 74, 0.06)",
      borderColor: "rgba(22, 163, 74, 0.2)",
    },
    {
      id: "gst",
      title: "Pending GST Invoices",
      desc: "Sales invoices requiring entry into Tally GST console.",
      count: dashboard?.gstInvoicesPendingCount ?? 0,
      icon: "file-percent-outline",
      route: "SalesList",
      params: { filter: 'gst_pending' },
      color: colors.warning,
      bgColor: "rgba(217, 119, 6, 0.06)",
      borderColor: "rgba(217, 119, 6, 0.2)",
    },
    {
      id: "stock",
      title: "Low Stock Alerts",
      desc: "Items below catalog safety levels. Requires replenishment.",
      count: dashboard?.lowStockAlerts ?? 0,
      icon: "alert-circle-outline",
      route: "StockDashboard",
      params: undefined,
      color: colors.danger,
      bgColor: "rgba(220, 38, 38, 0.06)",
      borderColor: "rgba(220, 38, 38, 0.2)",
    },
    {
      id: "payments",
      title: "Payment Approvals",
      desc: "Verify pending bank, cheque, and UPI collection entries.",
      count: dashboard?.paymentVerificationPending ?? 0,
      icon: "check-decagram-outline",
      route: "PaymentVerification",
      params: undefined,
      color: colors.info,
      bgColor: "rgba(2, 132, 199, 0.06)",
      borderColor: "rgba(2, 132, 199, 0.2)",
    },
    {
      id: "reconciliations",
      title: "Cash Session Mismatches",
      desc: "Review daily cash session differences at drawer closing.",
      count: dashboard?.cashMismatch ?? 0,
      icon: "cash-register",
      route: "CashClosingReview",
      params: undefined,
      color: "#8b5cf6",
      bgColor: "rgba(139, 92, 246, 0.06)",
      borderColor: "rgba(139, 92, 246, 0.2)",
    },
    {
      id: "corrections",
      title: "Correction Requests",
      desc: "Approve staff requests for invoice edits or cancellations.",
      count: dashboard?.correctionRequests ?? 0,
      icon: "file-alert-outline",
      route: "CorrectionRequests",
      params: undefined,
      color: colors.warning,
      bgColor: "rgba(217, 119, 6, 0.06)",
      borderColor: "rgba(217, 119, 6, 0.2)",
    }
  ], [dashboard]);

  const activeAlerts = useMemo(() => alertCards.filter(card => card.count > 0), [alertCards]);

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Work Queue" subtitle="Tasks requiring owner attention." />
      
      {dashboardQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {activeAlerts.length > 0 ? (
            <Section title="Active Tasks Queue">
              <View style={styles.alertsContainer}>
                {activeAlerts.map((card) => (
                  <AlertCard 
                    key={card.id}
                    title={card.title}
                    desc={card.desc}
                    count={card.count}
                    icon={card.icon}
                    color={card.color}
                    bgColor={card.bgColor}
                    borderColor={card.borderColor}
                    onPress={() => navigate(card.route as any, card.params as any)}
                  />
                ))}
              </View>
            </Section>
          ) : (
            <View style={styles.emptyContainer}>
              <Icon source="check-circle-outline" size={64} color={colors.success} />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptyDesc}>
                There are no pending payment verifications, session mismatches, low stock levels, or invoice change approvals at this time.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}



export function GenericPlannedScreen() {
  const route = useRoute();
  return <ConfiguredScreen config={configs[route.name] ?? { title: smartTitle(route.name), subtitle: "ShopControl screen.", primary: "Save" }} />;
}

const styles = StyleSheet.create({
  queueCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    ...shadow.sm,
    marginBottom: spacing.xs,
  },
  queueCardInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    gap: spacing.md,
  },
  queueCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  queueIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceOffset,
  },
  queueCardInfo: {
    flex: 1,
    gap: 2,
  },
  queueCardTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  queueCardDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  queueBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: colors.surfaceOffset,
  },
  queueBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  scrollContent: {
    paddingBottom: 100,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: spacing.xs,
  },
  statCardDanger: {
    borderColor: "rgba(220, 38, 38, 0.25)",
    backgroundColor: "rgba(220, 38, 38, 0.01)",
  },
  statLabel: {
    fontSize: fontSize.xs - 2,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  statValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  alertsContainer: {
    gap: spacing.md,
  },
  alertCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...shadow.sm,
  },
  alertCardActive: {
    borderColor: "rgba(217, 119, 6, 0.25)",
    backgroundColor: "rgba(217, 119, 6, 0.01)",
  },
  alertCardDanger: {
    borderColor: "rgba(220, 38, 38, 0.25)",
    backgroundColor: "rgba(220, 38, 38, 0.01)",
  },
  alertContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  alertTextContainer: {
    flex: 1,
    gap: 2,
  },
  alertTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  alertDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  alertBadge: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  alertBadgeClean: {
    backgroundColor: colors.surfaceOffset,
    color: colors.textSecondary,
  },
  alertBadgeWarning: {
    backgroundColor: "rgba(217, 119, 6, 0.1)",
    color: colors.warning,
  },
  alertBadgeDanger: {
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    color: colors.danger,
  },
  alertBadgeActive: {
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    color: colors.primary,
  },
  emptyContainer: {
    padding: spacing.huge,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  loadingContainer: {
    padding: spacing.huge,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  dashboardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  headerUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  headerGreetingCol: {
    gap: 2,
  },
  greetingGreeting: {
    fontSize: 9,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  greetingName: {
    fontSize: 18,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerBtnText: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  redDot: {
    position: "absolute",
    top: 10,
    right: 11,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  metricCard: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: spacing.sm,
  },
  metricCardPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  metricCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  metricIconWrapperLight: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: spacing.md,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chartSubtitle: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.success,
  },
  chartDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chartDropdownText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  chartContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 140,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  chartCol: {
    alignItems: "center",
    width: "15%",
    gap: spacing.xs,
  },
  chartBarWrapper: {
    width: 14,
    height: 100,
    backgroundColor: colors.surfaceOffset,
    borderRadius: 7,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  chartBarSegment: {
    width: "100%",
  },
  chartColLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
});
