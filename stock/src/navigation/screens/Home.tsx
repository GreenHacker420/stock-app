import React, { useMemo, useState } from "react";
import { ScrollView, View, Pressable, StyleSheet, ActivityIndicator, Dimensions, useWindowDimensions } from "react-native";
import { Text, Icon, Button } from "react-native-paper";

import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useShopsQuery } from "../../hooks/useShops";
import { useCurrentCashSessionQuery } from "../../hooks/useCashSessions";
import { useOwnerDashboardQuery } from "../../hooks/useDashboard";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";

type CategoryCardProps = {
  title: string;
  icon: string;
  onPress: () => void;
};

function CategoryCard({ title, icon, onPress }: CategoryCardProps) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = (windowWidth - spacing.lg * 2 - spacing.md) / 2;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.catCard,
        { width: cardWidth, margin: spacing.md / 2 }
      ]}
    >
      {({ pressed }) => (
        <View style={StyleSheet.flatten([styles.catCardInner, pressed && styles.pressed])}>
          <View style={styles.catCardIconWrapper}>
            <Icon source={icon} size={26} color={colors.primary} />
          </View>
          <Text style={styles.catCardText} numberOfLines={2}>{title.toUpperCase()}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Home() {
  const user = useAuthStore((state) => state.user);
  const { activeShopId, setActiveShopId } = useShopStore();
  const shopsQuery = useShopsQuery();
  const sessionQuery = useCurrentCashSessionQuery();

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
        showBack={false}
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


      </ScrollView>
    </Screen>
  );
}

function OwnerHome({ navigate }: { navigate: (s: any, params?: any) => void }) {
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data as any;

  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = (windowWidth - spacing.lg * 2 - spacing.md) / 2;

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
        {/* Verification Queue Card */}
        <Pressable 
          onPress={() => navigate("VerificationQueue")} 
          style={[
            styles.taskCard,
            { width: cardWidth, margin: spacing.md / 2 },
            (dashboard?.pendingVerifications ?? 0) > 0 ? styles.taskCardAlert : undefined,
          ]}
        >
          {({ pressed }) => (
            <View style={StyleSheet.flatten([styles.taskCardInner, pressed && styles.pressed])}>
              <View style={styles.taskHeader}>
                <Icon 
                  source="shield-check-outline" 
                  size={24} 
                  color={(dashboard?.pendingVerifications ?? 0) > 0 ? colors.primary : colors.textMuted} 
                />
                <Text style={[
                  styles.taskBadge, 
                  (dashboard?.pendingVerifications ?? 0) > 0 ? styles.taskBadgeAlert : styles.taskBadgeClean
                ]}>
                  {dashboard?.pendingVerifications ?? 0}
                </Text>
              </View>
              <Text style={styles.taskLabel}>VERIFICATIONS</Text>
              <Text style={styles.taskDesc}>Expenses & adjustments</Text>
            </View>
          )}
        </Pressable>

        {/* GST Pending Card */}
        <Pressable 
          onPress={() => navigate("SalesList", { filter: 'gst_pending' })} 
          style={[
            styles.taskCard,
            { width: cardWidth, margin: spacing.md / 2 },
            (dashboard?.gstInvoicesPendingCount ?? 0) > 0 ? styles.taskCardWarning : undefined,
          ]}
        >
          {({ pressed }) => (
            <View style={StyleSheet.flatten([styles.taskCardInner, pressed && styles.pressed])}>
              <View style={styles.taskHeader}>
                <Icon 
                  source="file-percent-outline" 
                  size={24} 
                  color={(dashboard?.gstInvoicesPendingCount ?? 0) > 0 ? colors.warning : colors.textMuted} 
                />
                <Text style={[
                  styles.taskBadge, 
                  (dashboard?.gstInvoicesPendingCount ?? 0) > 0 ? styles.taskBadgeWarning : styles.taskBadgeClean
                ]}>
                  {dashboard?.gstInvoicesPendingCount ?? 0}
                </Text>
              </View>
              <Text style={styles.taskLabel}>PENDING GST</Text>
              <Text style={styles.taskDesc}>Bills to enter in Tally</Text>
            </View>
          )}
        </Pressable>

        {/* Low Stock Alerts Card */}
        <Pressable 
          onPress={() => navigate("StockDashboard")} 
          style={[
            styles.taskCard,
            { width: cardWidth, margin: spacing.md / 2 },
            (dashboard?.lowStockAlerts ?? 0) > 0 ? styles.taskCardDanger : undefined,
          ]}
        >
          {({ pressed }) => (
            <View style={StyleSheet.flatten([styles.taskCardInner, pressed && styles.pressed])}>
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
            </View>
          )}
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

function StaffHome({ navigate, session, sessionLoading }: { navigate: (s: any, params?: any) => void; session?: any; sessionLoading: boolean }) {
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
          backgroundColor: isOpen ? colors.primaryLight : colors.warningLight,
          borderColor: isOpen ? 'rgba(22, 163, 74, 0.3)' : 'rgba(217, 119, 6, 0.3)'
        }
      ]}>
        <View style={styles.staffBannerHeader}>
          <View style={[
            styles.staffBannerIconBg, 
            { backgroundColor: colors.surface }
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
        <CategoryCard title="New Sale" icon="cart-plus" onPress={() => navigate("NewSaleType")} />
        <CategoryCard title="Create DM" icon="file-document-outline" onPress={() => navigate("OrdersToPack", { initialTab: "packed" })} />
        <CategoryCard title="Expenses" icon="cash-minus" onPress={() => navigate("Expenses")} />
        <CategoryCard title="Payment" icon="cash-register" onPress={() => navigate("TakePayment")} />
        <CategoryCard title="Stock Entry" icon="warehouse" onPress={() => navigate("StockEntry")} />
        <CategoryCard title="Customers" icon="account-group-outline" onPress={() => navigate("CustomerList")} />
        <CategoryCard title="Products" icon="warehouse" onPress={() => navigate("ItemList")} />
      </View>

      <View style={styles.staffFooterActions}>
        <Pressable 
          onPress={() => navigate("DailySummary")}
          style={({ pressed }) => [
            styles.secondaryActionButton, 
            pressed ? styles.pressed : undefined
          ].filter(Boolean) as any}
        >
          <Text style={styles.secondaryActionLabel}>Today's Summary</Text>
        </Pressable>
        
        {isOpen && (
          <Pressable 
            onPress={() => navigate("CloseDay")}
            style={({ pressed }) => [
              styles.secondaryActionButton, 
              { borderColor: colors.danger },
              pressed ? styles.pressed : undefined
            ].filter(Boolean) as any}
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
    paddingBottom: 120,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    ...shadow.sm,
  },
  taskCardInner: {
    flex: 1,
    width: '100%',
    padding: spacing.lg,
    gap: spacing.xs,
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
    paddingHorizontal: spacing.lg - (spacing.md / 2),
    paddingTop: spacing.md,
  },
  catCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    minHeight: 110,
    ...shadow.sm,
  },
  catCardInner: {
    flex: 1,
    width: '100%',
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catCardIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  catCardText: {
    fontSize: 10.5,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 13,
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
