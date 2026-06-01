import React, { useMemo } from "react";
import { ScrollView, View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Text, Icon, Button } from "react-native-paper";

import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useShopsQuery } from "../../hooks/useShops";
import { useCurrentCashSessionQuery } from "../../hooks/useCashSessions";
import { useOwnerDashboardQuery } from "../../hooks/useDashboard";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

type DashboardActionProps = {
  icon: string;
  title: string;
  subtitle: string;
  tone: "green" | "blue" | "amber" | "red";
  onPress: () => void;
  isLast?: boolean;
};

function DashboardAction({ icon, title, subtitle, tone, onPress, isLast }: DashboardActionProps) {
  const tones = {
    green: { bg: 'rgba(5, 150, 105, 0.08)', color: colors.success },
    amber: { bg: 'rgba(217, 119, 6, 0.08)', color: colors.warning },
    blue: { bg: 'rgba(30, 64, 175, 0.08)', color: colors.primary },
    red: { bg: 'rgba(220, 38, 38, 0.08)', color: colors.danger },
  };
  const palette = tones[tone];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        isLast ? styles.actionRowLast : styles.actionRow,
        pressed && styles.pressed
      ]}
    >
      <View style={styles.actionRowLeft}>
        <View style={[styles.actionIconBg, { backgroundColor: palette.bg }]}>
          <Icon source={icon} size={20} color={palette.color} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Icon source="chevron-right" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

export function Home() {
  const user = useAuthStore((state) => state.user);
  const { activeShopId, setActiveShopId } = useShopStore();
  const shopsQuery = useShopsQuery();
  const sessionQuery = useCurrentCashSessionQuery();

  const navigation = useNavigation();
  const navigate = (screen: string) => {
    (navigation as any).navigate(screen);
  };

  const selectedShop = useMemo(() => 
    shopsQuery.data?.find(s => s.id === activeShopId), 
    [shopsQuery.data, activeShopId]
  );

  const initials = useMemo(() => {
    if (user?.name) {
      return user.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }
    return "SC";
  }, [user?.name]);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={user?.role === "OWNER" ? "Dashboard" : (selectedShop?.name ?? "Shop Hub")}
        subtitle={user?.role === "OWNER" ? "Live operations overview" : "Ready for today's tasks"}
        role={user?.role}
        initials={initials}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {!activeShopId ? (
          <Section title="Select Shop">
            <View style={styles.sectionGap}>
              {shopsQuery.isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                shopsQuery.data?.map(shop => (
                  <ActionTile
                    key={shop.id}
                    title={shop.name}
                    subtitle={`${shop.city} • Code: ${shop.code}`}
                    icon="storefront-outline"
                    tone="blue"
                    onPress={() => setActiveShopId(shop.id)}
                  />
                ))
              )}
            </View>
          </Section>
        ) : (
          <>
            {user?.role === "OWNER" ? (
              <OwnerHome navigate={navigate} />
            ) : (
              <StaffHome navigate={navigate} session={sessionQuery.data} sessionLoading={sessionQuery.isLoading} />
            )}
          </>
        )}

        <View style={styles.statusSection}>
          <Text style={styles.statusTitle}>SYSTEM STATUS</Text>
          <View style={styles.statusPills}>
            <StatusPill 
              label="API Connected" 
              tone="green" 
            />
            <StatusPill 
              label={activeShopId ? "Shop Active" : "No Shop Selected"} 
              tone={activeShopId ? "blue" : "amber"} 
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function OwnerHome({ navigate }: { navigate: (s: string) => void }) {
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data as any;
  const money = (value: any) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

  if (dashboardQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Fetching dashboard data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.dashboardContainer}>
      <View style={styles.metricsGrid}>
        <View style={styles.metricsRow}>
          <MetricCard label="Today Sales" value={money(dashboard?.todaySales)} icon="trending-up" tone="blue" />
          <MetricCard label="Cash Collected" value={money(dashboard?.cashCollected)} icon="cash-multiple" tone="green" />
        </View>
        <View style={styles.metricsRow}>
          <MetricCard label="Pending DM" value={money(dashboard?.pendingDmAmount)} icon="clock-outline" tone="amber" />
          <MetricCard label="Orders to Pack" value={String(dashboard?.ordersToPack ?? 0)} icon="package-variant" tone="blue" />
        </View>
      </View>

      <Section title="Quick actions">
        <View style={styles.sectionGap}>
          
          <View style={styles.actionCard}>
            <DashboardAction 
              icon="cart-plus" 
              title="New Counter Sale" 
              subtitle="Start a direct walk-in checkout" 
              tone="green" 
              onPress={() => navigate("WalkInSale")} 
            />
            <DashboardAction 
              icon="package-variant" 
              title="Create Order" 
              subtitle="Book a new order for staff fulfillment" 
              tone="blue" 
              onPress={() => navigate("CreateOrder")} 
            />
            <DashboardAction 
              icon="cash-register" 
              title="Take Payment" 
              subtitle="Record a collection from a customer" 
              tone="blue" 
              onPress={() => navigate("TakePayment")} 
            />
            <DashboardAction 
              icon="check-decagram-outline" 
              title="Verify Payments" 
              subtitle="Review pending UPI and cheque entries" 
              tone="blue" 
              onPress={() => navigate("PaymentVerification")} 
              isLast={true}
            />
          </View>

          <View style={styles.actionCard}>
            <DashboardAction 
              icon="warehouse" 
              title="Inventory Catalog" 
              subtitle="Manage items, pricing, and stock levels" 
              tone="green" 
              onPress={() => navigate("ItemList")} 
            />
            <DashboardAction 
              icon="account-group-outline" 
              title="Customer Accounts" 
              subtitle="Manage outstanding balances and pricing" 
              tone="blue" 
              onPress={() => navigate("CustomerList")} 
            />
            <DashboardAction 
              icon="account-tie-outline" 
              title="Staff Management" 
              subtitle="Add and update staff accounts" 
              tone="amber" 
              onPress={() => navigate("StaffManagement")} 
              isLast={true}
            />
          </View>

          <View style={styles.actionCard}>
            <DashboardAction 
              icon="receipt" 
              title="Sales History" 
              subtitle="View all sales and detailed records" 
              tone="blue" 
              onPress={() => navigate("SalesList")} 
            />
            <DashboardAction 
              icon="file-chart-outline" 
              title="Daily Summary" 
              subtitle="Review, lock, and export operational reports" 
              tone="green" 
              onPress={() => navigate("DailySummary")} 
            />
            <DashboardAction 
              icon="storefront-outline" 
              title="Manage Shops" 
              subtitle="Overview of all locations in this account" 
              tone="amber" 
              onPress={() => navigate("Updates")} 
              isLast={true}
            />
          </View>

        </View>
      </Section>
    </View>
  );
}

function StaffHome({ navigate, session, sessionLoading }: { navigate: (s: string) => void; session?: any; sessionLoading: boolean }) {
  if (sessionLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading session status...</Text>
      </View>
    );
  }

  const isOpen = session?.status === "OPEN";

  return (
    <View style={styles.dashboardContainer}>
      
      {/* Session Status Banner */}
      <View style={[
        styles.staffBanner, 
        { 
          backgroundColor: isOpen ? 'rgba(5, 150, 105, 0.05)' : 'rgba(217, 119, 6, 0.05)',
          borderColor: isOpen ? colors.success : colors.warning 
        }
      ]}>
        <View style={styles.staffBannerHeader}>
          <View style={[
            styles.staffBannerIconBg, 
            { backgroundColor: isOpen ? colors.successLight : colors.warningLight }
          ]}>
            <Icon 
              source={isOpen ? "check-circle" : "alert-circle"} 
              size={24} 
              color={isOpen ? colors.success : colors.warning} 
            />
          </View>
          <View style={styles.flex1}>
            <Text style={[
              styles.staffBannerTitle, 
              { color: isOpen ? colors.success : colors.warning }
            ]}>
              {isOpen ? "Cash Session Active" : "Cash Session Closed"}
            </Text>
            <Text style={[styles.staffBannerDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {isOpen 
                ? "Counter cash tracking is active. Ready to process sales." 
                : "You must open a cash session to start registering sales."
              }
            </Text>
          </View>
        </View>
        <Button
          mode="contained"
          onPress={() => navigate(isOpen ? "WalkInSale" : "OpenCashSession")}
          style={[
            styles.staffBannerButton,
            { backgroundColor: isOpen ? colors.success : colors.primary }
          ]}
          contentStyle={styles.staffBannerButtonContent}
          labelStyle={{ fontWeight: fontWeight.bold, fontSize: fontSize.sm }}
          icon={isOpen ? "cart-plus" : "play"}
        >
          {isOpen ? "New Counter Sale" : "Open Cash Session"}
        </Button>
      </View>

      <View style={styles.gridContainer}>
        <View style={styles.metricsRow}>
          <Pressable 
            onPress={() => navigate("OrdersToPack")} 
            style={({ pressed }) => [styles.gridItem, pressed && styles.pressed]}
          >
            <View style={[styles.gridIconContainer, { backgroundColor: colors.primaryLight }]}>
              <Icon source="package-variant" size={28} color={colors.primary} />
            </View>
            <Text style={styles.gridLabel}>Orders</Text>
          </Pressable>
          
          <Pressable 
            onPress={() => {}} 
            style={({ pressed }) => [styles.gridItem, pressed && styles.pressed]}
          >
            <View style={[styles.gridIconContainer, { backgroundColor: colors.successLight }]}>
              <Icon source="file-document-outline" size={28} color={colors.success} />
            </View>
            <Text style={styles.gridLabel}>Create DM</Text>
          </Pressable>
        </View>

        <View style={styles.metricsRow}>
          <Pressable 
            onPress={() => navigate("TakePayment")} 
            style={({ pressed }) => [styles.gridItem, pressed && styles.pressed]}
          >
            <View style={[styles.gridIconContainer, { backgroundColor: colors.warningLight }]}>
              <Icon source="cash-register" size={28} color={colors.warning} />
            </View>
            <Text style={styles.gridLabel}>Payment</Text>
          </Pressable>
          
          <Pressable 
            onPress={() => navigate("StockEntry")} 
            style={({ pressed }) => [styles.gridItem, pressed && styles.pressed]}
          >
            <View style={[styles.gridIconContainer, { backgroundColor: colors.surfaceDark }]}>
              <Icon source="inventory" size={28} color={colors.textSecondary} />
            </View>
            <Text style={styles.gridLabel}>Stock Entry</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.staffFooterActions}>
        <Pressable 
          onPress={() => navigate("DailySummary")}
          style={({ pressed }) => [styles.secondaryActionButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryActionLabel}>Today's Summary</Text>
        </Pressable>
        
        {isOpen && (
          <Pressable 
            onPress={() => navigate("CloseDay")}
            style={({ pressed }) => [
              styles.secondaryActionButton, 
              { borderColor: colors.danger },
              pressed && styles.pressed
            ]}
          >
            <Text style={[styles.secondaryActionLabel, { color: colors.danger }]}>Close Day</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.huge,
    paddingTop: spacing.md,
  },
  sectionGap: {
    gap: spacing.md,
  },
  dashboardContainer: {
    gap: spacing.xl,
  },
  metricsGrid: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  loadingContainer: {
    padding: spacing.huge,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  statusSection: {
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusTitle: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  statusPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadow.sm,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  actionRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
  },
  actionRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    flex: 1,
  },
  actionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  actionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  flex1: {
    flex: 1,
  },
  staffBanner: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    ...shadow.sm,
    gap: spacing.md,
  },
  staffBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  staffBannerIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  staffBannerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
  },
  staffBannerDesc: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: 2,
    paddingRight: 10,
  },
  staffBannerButton: {
    borderRadius: radius.lg,
    marginTop: 4,
  },
  staffBannerButtonContent: {
    height: 48,
  },
  gridContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  gridItem: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.sm,
  },
  gridIconContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  staffFooterActions: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  secondaryActionButton: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  secondaryActionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
});
