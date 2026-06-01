import React, { useMemo, useState } from "react";
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
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

type CategoryCardProps = {
  title: string;
  icon: string;
  onPress: () => void;
};

function CategoryCard({ title, icon, onPress }: CategoryCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.catCard,
        pressed && styles.pressed
      ]}
    >
      <View style={styles.catCardIconWrapper}>
        <Icon source={icon} size={30} color={colors.primary} />
      </View>
      <Text style={styles.catCardText} numberOfLines={1}>{title.toUpperCase()}</Text>
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

  const subtitleText = useMemo(() => {
    if (user?.role === "OWNER") {
      return `Welcome back, ${user.name.split(/\s+/)[0]}`;
    }
    return "Ready for today's tasks";
  }, [user]);

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
        subtitle={subtitleText}
        role={user?.role}
        initials={initials}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {!activeShopId ? (
          <View style={styles.selectShopContainer}>
            <Text style={styles.sectionTitleText}>SELECT ACTIVE SHOP</Text>
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
          </View>
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

function StatusPill({ label, tone }: { label: string; tone: "green" | "blue" | "amber" }) {
  const tones = {
    green: { bg: 'rgba(22, 163, 74, 0.08)', color: colors.success },
    blue: { bg: 'rgba(34, 197, 94, 0.08)', color: colors.primary },
    amber: { bg: 'rgba(217, 119, 6, 0.08)', color: colors.warning },
  };
  const currentTone = tones[tone];
  return (
    <View style={[styles.statusPillWrapper, { backgroundColor: currentTone.bg }]}>
      <Text style={[styles.statusPillLabel, { color: currentTone.color }]}>{label}</Text>
    </View>
  );
}

function OwnerHome({ navigate }: { navigate: (s: string) => void }) {
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data as any;

  const [activeCategory, setActiveCategory] = useState<'sales' | 'inventory' | 'reports'>('sales');

  if (dashboardQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Fetching operations data...</Text>
      </View>
    );
  }

  const renderCategoryCards = () => {
    switch (activeCategory) {
      case 'sales':
        return (
          <View style={styles.gridContainer}>
            <CategoryCard title="Walk-In Sale" icon="basket-outline" onPress={() => navigate("WalkInSale")} />
            <CategoryCard title="Create Order" icon="package-variant" onPress={() => navigate("CreateOrder")} />
            <CategoryCard title="Take Payment" icon="cash-register" onPress={() => navigate("TakePayment")} />
            <CategoryCard title="Verify Payments" icon="check-decagram-outline" onPress={() => navigate("PaymentVerification")} />
            <CategoryCard title="Customers" icon="account-group-outline" onPress={() => navigate("CustomerList")} />
          </View>
        );
      case 'inventory':
        return (
          <View style={styles.gridContainer}>
            <CategoryCard title="Products Catalog" icon="warehouse" onPress={() => navigate("ItemList")} />
            <CategoryCard title="Stock Entry" icon="plus-box-outline" onPress={() => navigate("StockEntry")} />
            <CategoryCard title="Orders to Pack" icon="package-variant-closed" onPress={() => navigate("OrdersToPack")} />
          </View>
        );
      case 'reports':
        return (
          <View style={styles.gridContainer}>
            <CategoryCard title="Sales History" icon="receipt" onPress={() => navigate("SalesList")} />
            <CategoryCard title="Daily Summary" icon="file-chart-outline" onPress={() => navigate("DailySummary")} />
            <CategoryCard title="Staff Members" icon="account-tie-outline" onPress={() => navigate("StaffManagement")} />
            <CategoryCard title="Manage Shops" icon="storefront-outline" onPress={() => navigate("Updates")} />
          </View>
        );
    }
  };

  return (
    <View style={styles.dashboardContainer}>
      {/* Greeting Header */}
      <View style={styles.greetingHeader}>
        <Text style={styles.greetingTitle}>Hello, {user?.name.split(/\s+/)[0] || 'Owner'}</Text>
        <View style={styles.greetingSubtitleRow}>
          <Text style={styles.greetingSubtitle}>You have pending operational tasks today</Text>
        </View>
      </View>

      {/* Actionable Pending Tasks Section */}
      <View style={styles.categoryHeader}>
        <Text style={styles.sectionTitleText}>PENDING WORK & ALERTS</Text>
      </View>

      <View style={styles.gridContainer}>
        {/* Payment Verification Card */}
        <Pressable 
          onPress={() => navigate("PaymentVerification")} 
          style={({ pressed }) => [
            styles.taskCard,
            (dashboard?.paymentVerificationPending ?? 0) > 0 && styles.taskCardWarning,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.taskHeader}>
            <Icon 
              source="check-decagram-outline" 
              size={24} 
              color={(dashboard?.paymentVerificationPending ?? 0) > 0 ? colors.warning : colors.textMuted} 
            />
            <Text style={[
              styles.taskBadge, 
              (dashboard?.paymentVerificationPending ?? 0) > 0 ? styles.taskBadgeWarning : styles.taskBadgeClean
            ]}>
              {dashboard?.paymentVerificationPending ?? 0}
            </Text>
          </View>
          <Text style={styles.taskLabel}>VERIFY PAYMENTS</Text>
          <Text style={styles.taskDesc}>UPI / cheque collections</Text>
        </Pressable>

        {/* Rate Change Requests Card */}
        <Pressable 
          onPress={() => navigate("RateChangeRequests")} 
          style={({ pressed }) => [
            styles.taskCard,
            (dashboard?.rateChangeRequests ?? 0) > 0 && styles.taskCardAlert,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.taskHeader}>
            <Icon 
              source="tag-outline" 
              size={24} 
              color={(dashboard?.rateChangeRequests ?? 0) > 0 ? colors.primary : colors.textMuted} 
            />
            <Text style={[
              styles.taskBadge, 
              (dashboard?.rateChangeRequests ?? 0) > 0 ? styles.taskBadgeAlert : styles.taskBadgeClean
            ]}>
              {dashboard?.rateChangeRequests ?? 0}
            </Text>
          </View>
          <Text style={styles.taskLabel}>RATE APPROVALS</Text>
          <Text style={styles.taskDesc}>Discount rate clearances</Text>
        </Pressable>

        {/* Correction Requests Card */}
        <Pressable 
          onPress={() => navigate("CorrectionRequests")} 
          style={({ pressed }) => [
            styles.taskCard,
            (dashboard?.correctionRequests ?? 0) > 0 && styles.taskCardAlert,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.taskHeader}>
            <Icon 
              source="file-document-edit-outline" 
              size={24} 
              color={(dashboard?.correctionRequests ?? 0) > 0 ? colors.primary : colors.textMuted} 
            />
            <Text style={[
              styles.taskBadge, 
              (dashboard?.correctionRequests ?? 0) > 0 ? styles.taskBadgeAlert : styles.taskBadgeClean
            ]}>
              {dashboard?.correctionRequests ?? 0}
            </Text>
          </View>
          <Text style={styles.taskLabel}>CORRECTIONS</Text>
          <Text style={styles.taskDesc}>Invoice edit requests</Text>
        </Pressable>

        {/* Low Stock Alerts Card */}
        <Pressable 
          onPress={() => navigate("StockDashboard")} 
          style={({ pressed }) => [
            styles.taskCard,
            (dashboard?.lowStockAlerts ?? 0) > 0 && styles.taskCardDanger,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.taskHeader}>
            <Icon 
              source="alert-circle-outline" 
              size={24} 
              color={(dashboard?.lowStockAlerts ?? 0) > 0 ? colors.danger : colors.textMuted} 
            />
            <Text style={[
              styles.taskBadge, 
              (dashboard?.lowStockAlerts ?? 0) > 0 ? styles.taskBadgeDanger : styles.taskBadgeClean
            ]}>
              {dashboard?.lowStockAlerts ?? 0}
            </Text>
          </View>
          <Text style={styles.taskLabel}>LOW STOCK</Text>
          <Text style={styles.taskDesc}>Products below limit</Text>
        </Pressable>
      </View>

      {/* Category Wise Tab Selector */}
      <View style={styles.categoryHeader}>
        <View style={styles.tabBarContainer}>
          <Pressable 
            onPress={() => setActiveCategory('sales')}
            style={[styles.tabButton, activeCategory === 'sales' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabButtonText, activeCategory === 'sales' && styles.tabButtonTextActive]}>SALES</Text>
          </Pressable>
          <Pressable 
            onPress={() => setActiveCategory('inventory')}
            style={[styles.tabButton, activeCategory === 'inventory' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabButtonText, activeCategory === 'inventory' && styles.tabButtonTextActive]}>INVENTORY</Text>
          </Pressable>
          <Pressable 
            onPress={() => setActiveCategory('reports')}
            style={[styles.tabButton, activeCategory === 'reports' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabButtonText, activeCategory === 'reports' && styles.tabButtonTextActive]}>REPORTS</Text>
          </Pressable>
        </View>
      </View>

      {/* Render selected category's grid items */}
      {renderCategoryCards()}
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
          backgroundColor: isOpen ? 'rgba(22, 163, 74, 0.03)' : 'rgba(217, 119, 6, 0.03)',
          borderColor: isOpen ? 'rgba(22, 163, 74, 0.15)' : 'rgba(217, 119, 6, 0.15)'
        }
      ]}>
        <View style={styles.staffBannerHeader}>
          <View style={[
            styles.staffBannerIconBg, 
            { backgroundColor: isOpen ? 'rgba(22, 163, 74, 0.08)' : 'rgba(217, 119, 6, 0.08)' }
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
                ? `Counter cash tracking active. Open: ₹${Number(session?.openingCash ?? 0).toLocaleString("en-IN")}` 
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

      <View style={styles.categoryHeader}>
        <Text style={styles.staffSectionTitle}>TASKS & OPERATIONS</Text>
      </View>

      <View style={styles.gridContainer}>
        <CategoryCard title="Orders" icon="package-variant-closed" onPress={() => navigate("OrdersToPack")} />
        <CategoryCard title="Create DM" icon="file-document-outline" onPress={() => {}} />
        <CategoryCard title="Payment" icon="cash-register" onPress={() => navigate("TakePayment")} />
        <CategoryCard title="Stock Entry" icon="warehouse" onPress={() => navigate("StockEntry")} />
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
  selectShopContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  dashboardContainer: {
    gap: spacing.lg,
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
  statusPillWrapper: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  statusPillLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
  },
  // Redesigned Owner Metrics Layout
  greetingHeader: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    gap: 2,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  greetingSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  greetingSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  // Actionable Pending Tasks Cards
  taskCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
    ...shadow.sm,
  },
  taskCardWarning: {
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  taskCardAlert: {
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  taskCardDanger: {
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskBadge: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  taskBadgeClean: {
    backgroundColor: colors.surfaceOffset,
    color: colors.textSecondary,
  },
  taskBadgeWarning: {
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    color: colors.warning,
  },
  taskBadgeAlert: {
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    color: colors.success,
  },
  taskBadgeDanger: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    color: colors.danger,
  },
  taskLabel: {
    fontSize: 11,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  taskDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  // Category UI
  categoryHeader: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  tabBarContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.lg,
  },
  tabButton: {
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  tabButtonTextActive: {
    color: colors.primary,
  },
  sectionTitleText: {
    fontSize: 11,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  catCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  catCardIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.1)',
    backgroundColor: 'rgba(22, 163, 74, 0.02)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  catCardText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 2,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  flex1: {
    flex: 1,
  },
  // Staff layout styles
  staffBanner: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: 28,
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
  staffSectionTitle: {
    fontSize: 11,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
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
