import React from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Text, Icon, Divider, Button as PaperButton } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useOwnerDashboardQuery } from "../../hooks/useDashboard";

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
        <Section title="Physical management">
          <View style={styles.gridContainer}>
            <Pressable onPress={() => navigate("StockDashboard")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="warehouse" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>DASHBOARD</Text>
              <Text style={styles.statValue}>Alerts</Text>
            </Pressable>
            <Pressable onPress={() => navigate("StockEntry")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="plus-box" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>ENTRY</Text>
              <Text style={styles.statValue}>Restock</Text>
            </Pressable>
            <Pressable onPress={() => navigate("ItemList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="barcode-scan" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>CATALOG</Text>
              <Text style={styles.statValue}>Pricing</Text>
            </Pressable>
            <Pressable onPress={() => navigate("StockMovementHistory")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
              <Icon source="swap-horizontal" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>LEDGER</Text>
              <Text style={styles.statValue}>History</Text>
            </Pressable>
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

export function OwnerAlerts() {
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data;

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Work Queue" subtitle="Tasks requiring owner attention." />
      
      {dashboardQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {(dashboard?.pendingVerifications || 0) + (dashboard?.cashSessionDifferencesCount || 0) + (dashboard?.correctionRequests || 0) > 0 ? (
            <Section title="Approvals & Verifications">
              <View style={styles.alertsContainer}>
                {/* Payment & Expense Verifications */}
                <Pressable
                  onPress={() => navigate("VerificationQueue")}
                  style={({ pressed }) => [
                    styles.alertCard,
                    (dashboard?.pendingVerifications ?? 0) > 0 && styles.alertCardActive,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.alertContent}>
                    <Icon 
                      source="shield-check-outline" 
                      size={28} 
                      color={(dashboard?.pendingVerifications ?? 0) > 0 ? colors.primary : colors.textMuted} 
                    />
                    <View style={styles.alertTextContainer}>
                      <Text style={styles.alertTitle}>Verification Queue</Text>
                      <Text style={styles.alertDesc}>Expenses and payment records</Text>
                    </View>
                  </View>
                  <Text style={[
                    styles.alertBadge,
                    (dashboard?.pendingVerifications ?? 0) > 0 ? styles.alertBadgeActive : styles.alertBadgeClean
                  ]}>
                    {dashboard?.pendingVerifications ?? 0}
                  </Text>
                </Pressable>

                {/* Cash Session Differences */}
                <Pressable
                  onPress={() => navigate("CashClosingReview")}
                  style={({ pressed }) => [
                    styles.alertCard,
                    (dashboard?.cashSessionDifferencesCount ?? 0) > 0 && styles.alertCardDanger,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.alertContent}>
                    <Icon 
                      source="cash-alert" 
                      size={28} 
                      color={(dashboard?.cashSessionDifferencesCount ?? 0) > 0 ? colors.danger : colors.textMuted} 
                    />
                    <View style={styles.alertTextContainer}>
                      <Text style={styles.alertTitle}>Cash Mismatches</Text>
                      <Text style={styles.alertDesc}>Day closing differences</Text>
                    </View>
                  </View>
                  <Text style={[
                    styles.alertBadge,
                    (dashboard?.cashSessionDifferencesCount ?? 0) > 0 ? styles.alertBadgeDanger : styles.alertBadgeClean
                  ]}>
                    {dashboard?.cashSessionDifferencesCount ?? 0}
                  </Text>
                </Pressable>

                {/* Correction Requests */}
                <Pressable
                  onPress={() => navigate("CorrectionRequests")}
                  style={({ pressed }) => [
                    styles.alertCard,
                    (dashboard?.correctionRequests ?? 0) > 0 && styles.alertCardActive,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.alertContent}>
                    <Icon 
                      source="file-alert-outline" 
                      size={28} 
                      color={(dashboard?.correctionRequests ?? 0) > 0 ? colors.primary : colors.textMuted} 
                    />
                    <View style={styles.alertTextContainer}>
                      <Text style={styles.alertTitle}>Correction Requests</Text>
                      <Text style={styles.alertDesc}>Invoice edit & cancel approvals</Text>
                    </View>
                  </View>
                  <Text style={[
                    styles.alertBadge,
                    (dashboard?.correctionRequests ?? 0) > 0 ? styles.alertBadgeActive : styles.alertBadgeClean
                  ]}>
                    {dashboard?.correctionRequests ?? 0}
                  </Text>
                </Pressable>
              </View>
            </Section>
          ) : (
            <View style={styles.emptyContainer}>
              <Icon source="check-circle-outline" size={64} color={colors.success} />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptyDesc}>
                There are no pending payment verifications, session mismatches, or change approvals at this time.
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
