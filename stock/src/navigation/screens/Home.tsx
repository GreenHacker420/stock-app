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
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
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
      return `Welcome back, ${user.name.split(/\s+/)[0]}!`;
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
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data as any;
  const money = (value: any) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

  const [activeCategory, setActiveCategory] = useState<'sales' | 'inventory' | 'reports'>('sales');

  const paymentData = useMemo(() => {
    return [
      { label: "Cash", value: dashboard?.cashCollected ?? 0, color: '#16a34a' },
      { label: "UPI", value: dashboard?.upiCollected ?? 0, color: '#22c55e' },
      { label: "Card", value: dashboard?.cardCollected ?? 0, color: '#4ade80' },
      { label: "Bank", value: dashboard?.bankCollected ?? 0, color: '#86efac' },
      { label: "Cheque", value: dashboard?.chequeReceived ?? 0, color: '#dcfce7' },
    ];
  }, [dashboard]);

  const totalPayments = useMemo(() => {
    return paymentData.reduce((acc, curr) => acc + curr.value, 0);
  }, [paymentData]);

  const hasData = useMemo(() => {
    return paymentData.some(d => d.value > 0);
  }, [paymentData]);

  const maxVal = useMemo(() => {
    return hasData ? Math.max(...paymentData.map(d => d.value)) : 1;
  }, [paymentData, hasData]);

  if (dashboardQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Fetching dashboard data...</Text>
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
          <Text style={styles.greetingSubtitle}>Start Analyzing Your Sales Journey</Text>
          <Icon source="trending-up" size={16} color={colors.primary} />
        </View>
      </View>

      {/* Hero Card: Today's Revenue */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroLabel}>Balance</Text>
          <View style={styles.heroTrendBadge}>
            <Icon source="arrow-top-right" size={14} color="white" />
            <Text style={styles.heroTrendText}>+4.3%</Text>
          </View>
        </View>
        <View style={styles.heroValueContainer}>
          <Text style={styles.heroValue}>{money(dashboard?.todaySales)}</Text>
        </View>
        <Text style={styles.heroDesc}>It increased by 16% from last month</Text>
      </View>

      {/* Payment Breakdown / Revenue Overview Chart Card */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartTitle}>Revenue Overview</Text>
            <View style={styles.chartSubtitleRow}>
              <Text style={styles.chartMainValue}>{money(totalPayments)}</Text>
              <View style={styles.chartTrendBadge}>
                <Icon source="arrow-top-right" size={12} color={colors.success} />
                <Text style={styles.chartTrendText}>1.2%</Text>
              </View>
            </View>
          </View>
          <View style={styles.chartFilterPill}>
            <Text style={styles.chartFilterText}>This Month</Text>
            <Icon source="chevron-down" size={14} color={colors.textSecondary} />
          </View>
        </View>

        <View style={styles.chartContainer}>
          {paymentData.map((item, index) => {
            const valPercent = hasData ? Math.min(100, Math.max(12, (item.value / maxVal) * 100)) : 15;
            return (
              <View key={index} style={styles.chartColumn}>
                <View style={styles.chartBarSlot}>
                  <View 
                    style={[
                      styles.chartBarFill, 
                      { 
                        height: `${valPercent}%`, 
                        backgroundColor: item.color 
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.chartBarLabel}>{item.label}</Text>
                <Text style={styles.chartBarValue} numberOfLines={1}>
                  {item.value > 0 ? money(item.value) : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Row of supporting metrics with soft-pastel themed colors */}
      <View style={styles.subMetricsRow}>
        <View style={[styles.subMetricCard, { backgroundColor: 'rgba(22, 163, 74, 0.04)' }]}>
          <View style={styles.subMetricHeader}>
            <View style={[styles.subMetricIconBg, { backgroundColor: 'rgba(22, 163, 74, 0.08)' }]}>
              <Icon source="cash-multiple" size={16} color={colors.success} />
            </View>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.subMetricValue}>{money(dashboard?.cashCollected)}</Text>
            <Text style={styles.subMetricLabel}>Cash Coll.</Text>
          </View>
        </View>

        <View style={[styles.subMetricCard, { backgroundColor: 'rgba(217, 119, 6, 0.04)' }]}>
          <View style={styles.subMetricHeader}>
            <View style={[styles.subMetricIconBg, { backgroundColor: 'rgba(217, 119, 6, 0.08)' }]}>
              <Icon source="clock-outline" size={16} color={colors.warning} />
            </View>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.subMetricValue}>{money(dashboard?.pendingDmAmount)}</Text>
            <Text style={styles.subMetricLabel}>Pending DM</Text>
          </View>
        </View>

        <View style={[styles.subMetricCard, { backgroundColor: 'rgba(30, 64, 175, 0.04)' }]}>
          <View style={styles.subMetricHeader}>
            <View style={[styles.subMetricIconBg, { backgroundColor: 'rgba(30, 64, 175, 0.08)' }]}>
              <Icon source="package-variant" size={16} color={colors.primary} />
            </View>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.subMetricValue}>{String(dashboard?.ordersToPack ?? 0)}</Text>
            <Text style={styles.subMetricLabel}>To Pack</Text>
          </View>
        </View>
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
  dashboardContainer: {
    gap: spacing.xl,
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
  heroCard: {
    backgroundColor: '#385a3c', // Premium Deep Forest Olive Green
    borderRadius: 28,
    padding: spacing.xl,
    marginHorizontal: spacing.lg,
    ...shadow.md,
    position: 'relative',
    overflow: 'hidden',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: 4,
  },
  heroValue: {
    fontSize: 32,
    fontWeight: fontWeight.black,
    color: 'white',
    letterSpacing: -1,
  },
  heroTrendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
    gap: 4,
  },
  heroTrendText: {
    color: 'white',
    fontSize: 11,
    fontWeight: fontWeight.bold,
  },
  heroDesc: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: spacing.md,
    fontWeight: fontWeight.medium,
  },
  // Revenue Overview Chart styles
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: spacing.xl,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  chartTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  chartSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  chartMainValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  chartTrendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  chartTrendText: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: fontWeight.bold,
  },
  chartFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.lg,
    gap: 4,
  },
  chartFilterText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  chartBarSlot: {
    width: 24,
    height: 90,
    backgroundColor: 'rgba(0,0,0,0.015)',
    borderRadius: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 12,
  },
  chartBarLabel: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  chartBarValue: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  subMetricsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  subMetricCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.03)',
    gap: spacing.lg,
    ...shadow.sm,
  },
  subMetricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subMetricIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subMetricLabel: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  subMetricValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    letterSpacing: -0.3,
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
