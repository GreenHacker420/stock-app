import React, { useMemo } from "react";
import { ScrollView, View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Text, Icon, Button } from "react-native-paper";

import { fetchShops, fetchCurrentCashSession, fetchOwnerDashboard } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

export function Home() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const { activeShopId, setActiveShopId } = useShopStore();

  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  const sessionQuery = useQuery({
    queryKey: ["cash-session", activeShopId],
    queryFn: () => fetchCurrentCashSession(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const navigation = useNavigation();
  const navigate = (screen: string) => {
    (navigation as any).navigate(screen);
  };

  const selectedShop = useMemo(() => shopsQuery.data?.find(s => s.id === activeShopId), [shopsQuery.data, activeShopId]);
  const shopCount = shopsQuery.data?.length ?? 0;
  const initials = user?.name
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={user?.role === "OWNER" ? "Owner Dashboard" : (selectedShop?.name ?? "Shop Hub")}
        subtitle={user?.role === "OWNER" ? "Live operations overview" : "Ready for today's tasks"}
        role={user?.role}
        initials={initials}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {!activeShopId ? (
          <Section title="Select Shop">
            <View style={styles.sectionGap}>
              {shopsQuery.isLoading ? (
                <ActivityIndicator color={colors.primary} />
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
            <View style={styles.shopBranding}>
              <View>
                <Text style={styles.shopNameLabel}>Active Shop</Text>
                <Text style={styles.shopNameValue}>{selectedShop?.name}</Text>
              </View>
              <Button 
                mode="text" 
                onPress={() => setActiveShopId(null)}
                textColor={colors.primaryMid}
                labelStyle={styles.changeShopLabel}
              >
                Switch Shop
              </Button>
            </View>

            {user?.role === "OWNER" ? (
              <OwnerHome shopCount={shopCount} navigate={navigate} />
            ) : (
              <StaffHome navigate={navigate} session={sessionQuery.data} />
            )}
          </>
        )}

        <View style={styles.statusSection}>
          <Text style={styles.statusTitle}>SYSTEM STATUS</Text>
          <View style={styles.statusPills}>
            <StatusPill 
              label={token ? "API connected" : "Offline"} 
              tone={token ? "green" : "red"} 
            />
            <StatusPill 
              label={activeShopId ? "Shop active" : "No shop picked"} 
              tone={activeShopId ? "blue" : "amber"} 
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function OwnerHome({ shopCount, navigate }: { shopCount: number; navigate: (s: string) => void }) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  
  const dashboardQuery = useQuery({
    queryKey: ["owner-dashboard", activeShopId],
    queryFn: () => fetchOwnerDashboard(token ?? "", { shopId: activeShopId ?? undefined }),
    enabled: !!token,
  });

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
          <ActionTile title="New Counter Sale" subtitle="Start a direct customer checkout." icon="cart-plus" tone="green" onPress={() => navigate("WalkInSale")} />
          <ActionTile title="Create Order" subtitle="Book a new order for staff fulfillment." icon="package-variant" tone="blue" onPress={() => navigate("CreateOrder")} />
          <ActionTile title="Inventory Management" subtitle="Items, stock, prices, low stock." icon="warehouse" tone="green" onPress={() => navigate("ItemList")} />
          <ActionTile title="Sales Management" subtitle="All sales and detailed sale records." icon="receipt" tone="blue" onPress={() => navigate("SalesList")} />
          <ActionTile title="Customer Management" subtitle="Customers, outstanding, pricing." icon="account-group-outline" tone="blue" onPress={() => navigate("CustomerList")} />
          <ActionTile title="Staff Management" subtitle="Add and update staff accounts." icon="account-tie-outline" tone="amber" onPress={() => navigate("StaffManagement")} />
          <ActionTile title="Take Payment" subtitle="Record a collection from a customer." icon="cash-register" tone="blue" onPress={() => navigate("TakePayment")} />
          <ActionTile title="Verify Payments" subtitle="Review pending UPI and cheque entries." icon="check-decagram-outline" tone="blue" onPress={() => navigate("PaymentVerification")} />
          <ActionTile title="Daily Summary" subtitle="Review, lock, and export operations." icon="file-chart-outline" tone="green" onPress={() => navigate("DailySummary")} />
          <ActionTile title="Manage Shops" subtitle={`${shopCount} active shops in your account.`} icon="storefront-outline" tone="amber" onPress={() => navigate("Updates")} />
        </View>
      </Section>
    </View>
  );
}

function StaffHome({ navigate, session }: { navigate: (s: string) => void; session?: any }) {
  const isOpen = session?.status === "OPEN";

  return (
    <View style={styles.dashboardContainer}>
      <View style={styles.staffMainAction}>
        {!isOpen ? (
          <Pressable 
            onPress={() => navigate("OpenCashSession")}
            style={({ pressed }) => [
              styles.primaryActionButton,
              pressed && styles.pressed
            ]}
          >
            <Icon source="play-circle-outline" size={28} color={colors.textInverse} />
            <Text style={styles.primaryActionLabel}>OPEN CASH SESSION</Text>
          </Pressable>
        ) : (
          <Pressable 
            onPress={() => navigate("WalkInSale")}
            style={({ pressed }) => [
              styles.primaryActionButton,
              pressed && styles.pressed,
              { backgroundColor: colors.success }
            ]}
          >
            <Icon source="cart-plus" size={28} color={colors.textInverse} />
            <Text style={styles.primaryActionLabel}>NEW COUNTER SALE</Text>
          </Pressable>
        )}
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
  },
  sectionGap: {
    gap: spacing.md,
  },
  shopBranding: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(30, 64, 175, 0.1)',
  },
  shopNameLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  shopNameValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  changeShopLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  dashboardContainer: {
    gap: spacing.xxl,
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
    marginTop: spacing.xxxl,
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
  staffMainAction: {
    paddingHorizontal: spacing.lg,
  },
  primaryActionButton: {
    height: 80,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    ...shadow.md,
  },
  primaryActionLabel: {
    color: colors.textInverse,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
  },
  gridContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  gridItem: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
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
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  staffFooterActions: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  secondaryActionButton: {
    height: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  }
});
