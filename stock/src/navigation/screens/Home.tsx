import { useMemo, useState } from "react";
import { ScrollView, View, Pressable, StyleSheet, ActivityIndicator, Dimensions, useWindowDimensions } from "react-native";
import { Text, Icon, Button } from "react-native-paper";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

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

type AlertCardProps = {
  title: string;
  desc: string;
  count: number;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  onPress: () => void;
  width: number;
};

function AlertCard({ title, desc, count, icon, color, bgColor, borderColor, onPress, width }: AlertCardProps) {
  const isPending = count > 0;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.alertCard,
        {
          width,
          backgroundColor: isPending ? bgColor : colors.surface,
          borderColor: isPending ? borderColor : colors.border,
        }
      ]}
    >
      {({ pressed }) => (
        <View style={StyleSheet.flatten([styles.alertCardInner, pressed && styles.pressed])}>
          <View style={styles.alertCardHeader}>
            <View style={[
              styles.alertIconBg,
              { backgroundColor: isPending ? 'rgba(255,255,255,0.7)' : colors.surfaceOffset }
            ]}>
              <Icon source={icon} size={20} color={isPending ? color : colors.textMuted} />
            </View>
            <View style={[
              styles.alertBadge,
              { backgroundColor: isPending ? color : colors.surfaceOffset }
            ]}>
              <Text style={[
                styles.alertBadgeText,
                { color: isPending ? '#ffffff' : colors.textSecondary }
              ]}>
                {count}
              </Text>
            </View>
          </View>
          <Text style={styles.alertCardLabel}>{title.toUpperCase()}</Text>
          <Text style={styles.alertCardDesc} numberOfLines={1}>
            {isPending ? desc : "All caught up"}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

type QuickActionCardProps = {
  title: string;
  desc: string;
  icon: string;
  onPress: () => void;
  width: number;
};

function QuickActionCard({ title, desc, icon, onPress, width }: QuickActionCardProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.actionCard,
        { width, margin: spacing.md / 2 }
      ]}
    >
      {({ pressed }) => (
        <View style={StyleSheet.flatten([styles.actionCardInner, pressed && styles.pressed])}>
          <View style={styles.actionCardIconBg}>
            <Icon source={icon} size={24} color={colors.primary} />
          </View>
          <View style={styles.actionCardContent}>
            <Text style={styles.actionCardTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.actionCardDesc} numberOfLines={2}>{desc}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function OwnerHome({ navigate }: { navigate: (s: any, params?: any) => void }) {
  const user = useAuthStore((state) => state.user);
  const { activeShopId } = useShopStore();
  const shopsQuery = useShopsQuery();
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data as any;

  const { width: windowWidth } = useWindowDimensions();
  const alertCardWidth = (windowWidth - spacing.lg * 2 - spacing.md) / 2;
  const actionCardWidth = (windowWidth - spacing.lg * 2 - spacing.md) / 2;

  const [activeCategory, setActiveCategory] = useState<'sales' | 'inventory' | 'reports'>('sales');

  const selectedShop = useMemo(() => 
    shopsQuery.data?.find(s => s.id === activeShopId), 
    [shopsQuery.data, activeShopId]
  );

  const alertCards = useMemo(() => [
    {
      id: "verifications",
      title: "Verifications",
      desc: "Verify adjustments & costs",
      count: dashboard?.pendingVerifications ?? 0,
      icon: "shield-check-outline",
      route: "VerificationQueue",
      params: undefined,
      color: colors.success,
      bgColor: "rgba(22, 163, 74, 0.08)",
      borderColor: "rgba(22, 163, 74, 0.25)",
    },
    {
      id: "gst",
      title: "Pending GST",
      desc: "Bills to enter in Tally",
      count: dashboard?.gstInvoicesPendingCount ?? 0,
      icon: "file-percent-outline",
      route: "SalesList",
      params: { filter: 'gst_pending' },
      color: colors.warning,
      bgColor: "rgba(217, 119, 6, 0.08)",
      borderColor: "rgba(217, 119, 6, 0.25)",
    },
    {
      id: "stock",
      title: "Low Stock",
      desc: "Products below limit",
      count: dashboard?.lowStockAlerts ?? 0,
      icon: "alert-circle-outline",
      route: "StockDashboard",
      params: undefined,
      color: colors.danger,
      bgColor: "rgba(220, 38, 38, 0.08)",
      borderColor: "rgba(220, 38, 38, 0.25)",
    },
    {
      id: "payments",
      title: "Payment Approvals",
      desc: "Verify collections queue",
      count: dashboard?.paymentVerificationPending ?? 0,
      icon: "check-decagram-outline",
      color: colors.info,
      bgColor: "rgba(2, 132, 199, 0.08)",
      borderColor: "rgba(2, 132, 199, 0.25)",
      route: "PaymentVerification",
      params: undefined,
    },
    {
      id: "reconciliations",
      title: "Cash Mismatch",
      desc: "Session differences",
      count: dashboard?.cashMismatch ?? 0,
      icon: "cash-register",
      color: "#8b5cf6",
      bgColor: "rgba(139, 92, 246, 0.08)",
      borderColor: "rgba(139, 92, 246, 0.25)",
      route: "CashClosingReview",
      params: undefined,
    }
  ], [dashboard]);

  const activeAlerts = useMemo(() => alertCards.filter(card => card.count > 0), [alertCards]);

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
            <QuickActionCard 
              title="Walk-In Sale" 
              desc="Fast counter billing" 
              icon="basket-plus" 
              onPress={() => navigate("WalkInSale")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Create Order" 
              desc="Book customer order" 
              icon="package-variant" 
              onPress={() => navigate("CreateOrder")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Take Payment" 
              desc="Collect cash/UPI/cheque" 
              icon="cash-register" 
              onPress={() => navigate("TakePayment")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Verify Payments" 
              desc="Verify collections queue" 
              icon="check-decagram-outline" 
              onPress={() => navigate("PaymentVerification")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Customers" 
              desc="View profiles & dues" 
              icon="account-group-outline" 
              onPress={() => navigate("CustomerList")} 
              width={actionCardWidth}
            />
          </View>
        );
      case 'inventory':
        return (
          <View style={styles.gridContainer}>
            <QuickActionCard 
              title="Products Catalog" 
              desc="Browse item list" 
              icon="format-list-bulleted" 
              onPress={() => navigate("ItemList")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Stock Entry" 
              desc="Add incoming stock" 
              icon="plus-box-outline" 
              onPress={() => navigate("StockEntry")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Orders to Pack" 
              desc="Process & pack orders" 
              icon="package-variant-closed" 
              onPress={() => navigate("OrdersToPack")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Stock History" 
              desc="Audit stock movements" 
              icon="history" 
              onPress={() => navigate("StockMovementHistory")} 
              width={actionCardWidth}
            />
          </View>
        );
      case 'reports':
        return (
          <View style={styles.gridContainer}>
            <QuickActionCard 
              title="Sales History" 
              desc="Invoices & GST status" 
              icon="receipt" 
              onPress={() => navigate("SalesList")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Daily Summary" 
              desc="Day sales & collections" 
              icon="file-chart-outline" 
              onPress={() => navigate("DailySummaryList")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Staff Members" 
              desc="Attendance & activity" 
              icon="account-tie-outline" 
              onPress={() => navigate("StaffManagement")} 
              width={actionCardWidth}
            />
            <QuickActionCard 
              title="Manage Shops" 
              desc="Switch or add profiles" 
              icon="storefront-outline" 
              onPress={() => navigate("Updates")} 
              width={actionCardWidth}
            />
          </View>
        );
    }
  };

  return (
    <View style={styles.dashboardContainer}>
      {/* Greeting Header */}
      <View style={styles.greetingHeader}>
        <Text style={styles.greetingTitle}>Hello, {user?.name.split(/\s+/)[0] || 'Owner'}</Text>
        <Text style={styles.greetingSubtitle}>Here's the summary of your shop operations today</Text>
      </View>

      {/* Hero Performance Banner */}
      <View style={styles.heroCardContainer}>
        <LinearGradient
          colors={['#14532d', '#22c55e']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroGradient}
        >
          <View style={styles.heroHeader}>
            <View style={styles.heroHeaderLeft}>
              <Icon source="storefront" size={18} color="#ffffff" />
              <Text style={styles.heroShopName}>{selectedShop?.name || 'Active Shop'}</Text>
            </View>
            <View style={styles.heroHeaderRight}>
              <Text style={styles.heroDateText}>
                {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          </View>

          <View style={styles.heroMetricsGrid}>
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricLabel}>TODAY'S SALES</Text>
              <Text style={styles.heroMetricValue}>
                ₹{Number(dashboard?.todaySales ?? 0).toLocaleString("en-IN")}
              </Text>
              <Text style={styles.heroMetricSub}>
                {dashboard?.salesCount ?? 0} invoices
              </Text>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricLabel}>EXPENSES</Text>
              <Text style={styles.heroMetricValue}>
                ₹{Number(dashboard?.todayExpenses ?? 0).toLocaleString("en-IN")}
              </Text>
              <Text style={styles.heroMetricSub}>
                operational costs
              </Text>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricLabel}>PENDING DMs</Text>
              <Text style={styles.heroMetricValue}>
                ₹{Number(dashboard?.pendingDmAmount ?? 0).toLocaleString("en-IN")}
              </Text>
              <Text style={styles.heroMetricSub}>
                delivery memos
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Actionable Alerts Section */}
      <View style={styles.categoryHeader}>
        <Text style={styles.sectionTitleText}>PENDING WORK & ALERTS</Text>
      </View>

      {activeAlerts.length === 0 ? (
        <View style={styles.allClearCard}>
          <Icon source="check-circle-outline" size={24} color={colors.success} />
          <View style={styles.allClearContent}>
            <Text style={styles.allClearTitle}>All caught up!</Text>
            <Text style={styles.allClearDesc}>No pending verifications, GST bills, or stock alerts.</Text>
          </View>
        </View>
      ) : (
        <View style={styles.alertsGrid}>
          {activeAlerts.map((card, index) => {
            const isLastOdd = index === activeAlerts.length - 1 && activeAlerts.length % 2 !== 0;
            const cardWidth = isLastOdd ? (windowWidth - spacing.lg * 2) : alertCardWidth;
            return (
              <AlertCard 
                key={card.id}
                title={card.title}
                desc={card.desc}
                count={card.count}
                icon={card.icon}
                color={card.color}
                bgColor={card.bgColor}
                borderColor={card.borderColor}
                onPress={() => navigate(card.route, card.params)}
                width={cardWidth}
              />
            );
          })}
        </View>
      )}

      {/* Segmented Category Switcher */}
      <View style={styles.tabContainer}>
        <View style={styles.segmentedControl}>
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveCategory('sales');
            }}
            style={[styles.segmentButton, activeCategory === 'sales' && styles.segmentButtonActive]}
          >
            <Icon source="basket-outline" size={18} color={activeCategory === 'sales' ? colors.primary : colors.textMuted} />
            <Text style={[styles.segmentButtonText, activeCategory === 'sales' && styles.segmentButtonTextActive]}>Sales</Text>
          </Pressable>
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveCategory('inventory');
            }}
            style={[styles.segmentButton, activeCategory === 'inventory' && styles.segmentButtonActive]}
          >
            <Icon source="warehouse" size={18} color={activeCategory === 'inventory' ? colors.primary : colors.textMuted} />
            <Text style={[styles.segmentButtonText, activeCategory === 'inventory' && styles.segmentButtonTextActive]}>Inventory</Text>
          </Pressable>
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveCategory('reports');
            }}
            style={[styles.segmentButton, activeCategory === 'reports' && styles.segmentButtonActive]}
          >
            <Icon source="file-chart-outline" size={18} color={activeCategory === 'reports' ? colors.primary : colors.textMuted} />
            <Text style={[styles.segmentButtonText, activeCategory === 'reports' && styles.segmentButtonTextActive]}>Reports</Text>
          </Pressable>
        </View>
      </View>

      {/* Render selected category's grid items */}
      {renderCategoryCards()}
    </View>
  );
}

function StaffHome({ navigate, session, sessionLoading }: { navigate: (s: any, params?: any) => void; session?: any; sessionLoading: boolean }) {
  const [isSessionCollapsed, setIsSessionCollapsed] = useState(false);

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
          borderColor: isOpen ? 'rgba(22, 163, 74, 0.3)' : 'rgba(217, 119, 6, 0.3)',
          padding: isSessionCollapsed ? spacing.md : spacing.xl,
          gap: isSessionCollapsed ? 0 : spacing.md,
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[
                styles.staffBannerTitle, 
                { color: isOpen ? colors.success : colors.warning }
              ]}>
                {isOpen ? "Cash Session Active" : "Cash Session Closed"}
              </Text>
              <Pressable onPress={() => setIsSessionCollapsed(!isSessionCollapsed)} style={{ padding: 4 }}>
                <Icon source={isSessionCollapsed ? "chevron-down" : "chevron-up"} size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            {!isSessionCollapsed && (
              <Text style={[styles.staffBannerDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                {isOpen 
                  ? `Counter cash tracking active. Open: ₹${Number(session?.openingCash ?? 0).toLocaleString("en-IN")}` 
                  : "You must open a cash session to start registering sales."
                }
              </Text>
            )}
          </View>
        </View>
        {!isSessionCollapsed && (
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
        )}
      </View>

      <View style={styles.categoryHeader}>
        <Text style={styles.staffSectionTitle}>TASKS & OPERATIONS</Text>
      </View>

      <View style={styles.gridContainer}>
        <CategoryCard title="Orders" icon="package-variant-closed" onPress={() => navigate("OrdersToPack")} />
        <CategoryCard title="New Sale" icon="cart-plus" onPress={() => navigate("NewSaleType")} />
        <CategoryCard title="Create DM" icon="file-document-outline" onPress={() => navigate("DeliveryMemoList")} />
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
  // Redesigned Owner Dashboard Styles
  heroCardContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  heroGradient: {
    borderRadius: 24,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.md,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
    paddingBottom: spacing.md,
  },
  heroHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroShopName: {
    color: '#ffffff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 0.5,
  },
  heroHeaderRight: {
    alignItems: 'flex-end',
  },
  heroDateText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  heroMetricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroMetricLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 9,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  heroMetricValue: {
    color: '#ffffff',
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    marginVertical: 2,
  },
  heroMetricSub: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 9,
    fontWeight: fontWeight.medium,
  },
  heroDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  alertsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg - (spacing.md / 2),
  },
  alertCard: {
    borderWidth: 1.5,
    borderRadius: 20,
    minHeight: 110,
    margin: spacing.md / 2,
    ...shadow.sm,
  },
  alertCardInner: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  alertCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  alertBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  alertCardLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  alertCardDesc: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tabContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 24,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 20,
  },
  segmentButtonActive: {
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  segmentButtonText: {
    fontSize: 12.5,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  segmentButtonTextActive: {
    color: colors.primary,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    minHeight: 120,
    ...shadow.sm,
  },
  actionCardInner: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  actionCardIconBg: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardContent: {
    width: '100%',
  },
  actionCardTitle: {
    fontSize: 13.5,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  actionCardDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
    marginTop: 2,
  },
  allClearCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
    borderRadius: 20,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    gap: spacing.md,
  },
  allClearContent: {
    flex: 1,
  },
  allClearTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  allClearDesc: {
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    opacity: 0.8,
    marginTop: 2,
  },
});
