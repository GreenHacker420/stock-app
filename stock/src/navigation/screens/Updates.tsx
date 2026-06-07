import React, { useState, useMemo } from "react";
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { FAB, Text, Portal, Dialog, List, Icon } from "react-native-paper";
import { Avatar } from "@rneui/themed";

import { fetchShops, Shop, fetchOwnerDashboard, fetchCurrentCashSession } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

export function Updates() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const navigation = useNavigation();

  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  const isOwner = user?.role === "OWNER";

  const dashboardQuery = useQuery({
    queryKey: ["ownerDashboard", "portfolio"],
    queryFn: () => fetchOwnerDashboard(token ?? ""),
    enabled: !!token && isOwner,
  });

  const activeStaffCount = useMemo(() => {
    const uniqueStaffIds = new Set<string>();
    shopsQuery.data?.forEach((shop) => {
      (shop as any).staffAccesses?.forEach((access: any) => {
        if (access.staff?.id) {
          uniqueStaffIds.add(access.staff.id);
        }
      });
    });
    return uniqueStaffIds.size;
  }, [shopsQuery.data]);

  const handleShopPress = (shop: Shop) => {
    if (isOwner) {
      setSelectedShop(shop);
      setIsActionsOpen(true);
    }
  };

  const navigate = (screen: string, params?: any) => {
    setIsActionsOpen(false);
    (navigation as any).navigate(screen, params);
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title="My Shops"
        subtitle={isOwner ? "Managing your retail portfolio" : "Your assigned workspace"}
      />

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Global Stats Bar */}
        {isOwner && (
          <View style={styles.statsBar}>
            <View>
              <Text style={styles.statsLabel}>PORTFOLIO REVENUE</Text>
              <Text style={styles.statsValue}>
                ₹{Number(dashboardQuery.data?.todaySales ?? 0).toLocaleString("en-IN")}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.statsLabel}>ACTIVE STAFF</Text>
              <Text style={styles.statsValue}>{activeStaffCount}</Text>
            </View>
          </View>
        )}

        <View style={styles.listContainer}>
          {shopsQuery.isLoading && (
            <View style={styles.loadingWrapper}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.loadingText}>Loading portfolio shops...</Text>
            </View>
          )}

          {shopsQuery.data?.map((shop) => (
            <ShopPortfolioCard 
              key={shop.id} 
              shop={shop} 
              onManage={() => handleShopPress(shop)} 
              isOwner={isOwner}
              token={token ?? ""}
            />
          ))}

          {!shopsQuery.isLoading && !shopsQuery.data?.length && (
            <View style={styles.emptyContainer}>
              <Icon source="store-plus-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyText}>No shops in portfolio</Text>
            </View>
          )}
        </View>

        {/* Global Management Shortcut */}
        {isOwner && (
          <View style={styles.footerManagement}>
            <Pressable 
              style={({ pressed }) => [styles.managementBtn, pressed && styles.pressed]}
            >
              <Icon source="cog-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.managementBtnText}>Global Settings</Text>
            </Pressable>
            <Pressable 
              style={({ pressed }) => [styles.managementBtn, pressed && styles.pressed]}
            >
              <Icon source="shield-key-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.managementBtnText}>Permissions</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {isOwner && (
        <FAB
          icon="plus"
          label="Add New Shop"
          color={colors.textInverse}
          style={styles.fab}
          onPress={() => navigate("CreateEditShop")}
        />
      )}

      <Portal>
        <Dialog
          visible={isActionsOpen}
          onDismiss={() => setIsActionsOpen(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>
            {selectedShop?.name} Administration
          </Dialog.Title>
          <Dialog.Content style={{ paddingHorizontal: 0 }}>
            <List.Item
              title="Edit Shop Profile"
              description="Legal details, address, and config."
              left={(props) => <List.Icon {...props} icon="store-edit-outline" color={colors.primary} />}
              onPress={() => navigate("CreateEditShop", { shop: selectedShop })}
              titleStyle={styles.listItemTitle}
            />
            <List.Item
              title="Operator Management"
              description="Manage staff access levels."
              left={(props) => <List.Icon {...props} icon="account-group-outline" color={colors.primary} />}
              onPress={() => navigate("AssignStaff", { shop: selectedShop })}
              titleStyle={styles.listItemTitle}
            />
            <List.Item
              title="QR Management"
              description="Configure UPI ID for dynamic QR codes."
              left={(props) => <List.Icon {...props} icon="qrcode-scan" color={colors.primary} />}
              onPress={() => navigate("UpiConfig", { shop: selectedShop })}
              titleStyle={styles.listItemTitle}
            />
            <List.Item
              title="Inventory Initialization"
              description="Configure opening stock levels."
              left={(props) => <List.Icon {...props} icon="warehouse" color={colors.primary} />}
              onPress={() => navigate("SetOpeningStock", { shop: selectedShop })}
              titleStyle={styles.listItemTitle}
              disabled={selectedShop?.openingStockLocked}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button variant="ghost" label="Close" onPress={() => setIsActionsOpen(false)} />
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

function ShopPortfolioCard({ shop, onManage, isOwner, token }: { shop: Shop, onManage: () => void, isOwner: boolean, token: string }) {
  const shopDashboardQuery = useQuery({
    queryKey: ["ownerDashboard", shop.id],
    queryFn: () => fetchOwnerDashboard(token, { shopId: shop.id }),
    enabled: !!token && isOwner,
  });

  const currentSessionQuery = useQuery({
    queryKey: ["currentCashSession", shop.id],
    queryFn: () => fetchCurrentCashSession(token, shop.id),
    enabled: !!token,
  });

  const todaySales = shopDashboardQuery.data?.todaySales ?? 0;
  // Fix the NaN expected cash on hand issue: fall back to 0 if undefined/not a number
  const cashOnHand = currentSessionQuery.data?.expectedCash 
    ? Number(currentSessionQuery.data.expectedCash) 
    : 0;

  const staffList = (shop as any).staffAccesses?.map((access: any) => access.staff).filter(Boolean) || [];
  const staffAvatars = staffList.map((s: any) => {
    return s.name.split(/\s+/).map((w: any) => w[0]).join("").toUpperCase().slice(0, 2);
  }).slice(0, 4);

  return (
    <View style={styles.card}>
      <View style={styles.cardPadding}>
        <View style={styles.cardHeader}>
          <View style={styles.shopInfo}>
            <View style={styles.shopAvatar}>
              <Text style={styles.shopAvatarText}>{shop.name[0]?.toUpperCase()}</Text>
            </View>
            <View>
              <View style={styles.shopNameRow}>
                <Text style={styles.shopName}>{shop.name}</Text>
                <View style={styles.liveIndicator} />
              </View>
              <Text style={styles.shopSubtext}>{shop.code} • {shop.city}</Text>
            </View>
          </View>
          <StatusPill 
            label={shop.openingStockLocked ? "LIVE" : "SETUP"} 
            tone={shop.openingStockLocked ? "green" : "amber"} 
          />
        </View>

        <View style={styles.cardMetrics}>
          <View>
            <Text style={styles.metricLabel}>TODAY'S SALES</Text>
            <Text style={styles.metricValue}>₹{Number(todaySales).toLocaleString("en-IN")}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.metricLabel}>CASH ON HAND</Text>
            <Text style={styles.metricValue}>₹{Number(cashOnHand).toLocaleString("en-IN")}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.avatarsRow}>
            {staffAvatars.map((init: string, i: number) => (
              <Avatar
                key={i}
                rounded
                title={init}
                size={32}
                containerStyle={[
                  styles.staffAvatar,
                  { marginLeft: i === 0 ? 0 : -10 }
                ]}
                titleStyle={styles.staffAvatarText}
              />
            ))}
            {staffList.length > 4 && (
              <View style={styles.avatarMore}>
                <Text style={styles.avatarMoreText}>+{staffList.length - 4}</Text>
              </View>
            )}
          </View>
          
          {isOwner && (
            <Button 
              variant="ghost"
              label="Manage"
              size="sm"
              onPress={onManage}
              icon={<Icon source="arrow-right" size={16} color={colors.primary} />}
              style={styles.manageBtn}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingBottom: 120,
    paddingTop: spacing.md,
  },
  loadingWrapper: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  statsBar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    backgroundColor: colors.textPrimary,
    borderRadius: 24,
    padding: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadow.md,
  },
  statsLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: fontWeight.black,
    letterSpacing: 1,
    opacity: 0.8,
  },
  statsValue: {
    color: colors.textInverse,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    marginTop: 4,
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  emptyContainer: {
    padding: spacing.huge,
    alignItems: 'center',
    opacity: 0.5,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  footerManagement: {
    marginTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceOffset,
  },
  managementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  managementBtnText: {
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  fab: {
    position: "absolute",
    margin: spacing.lg,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  dialogTitle: {
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  listItemTitle: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.06)',
    ...shadow.sm,
  },
  cardPadding: {
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  shopInfo: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  shopAvatar: {
    height: 52,
    width: 52,
    borderRadius: 16,
    backgroundColor: colors.primaryMid,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  shopAvatarText: {
    color: colors.textInverse,
    fontSize: 22,
    fontWeight: fontWeight.black,
  },
  shopNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  shopName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  liveIndicator: {
    height: 6,
    width: 6,
    borderRadius: radius.full,
    backgroundColor: colors.success,
  },
  shopSubtext: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  cardMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceOffset,
    borderRadius: 18,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  staffAvatar: {
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  staffAvatarText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  avatarMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
    marginLeft: -10,
  },
  avatarMoreText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  manageBtn: {
    minHeight: 32,
  },
  pressed: {
    opacity: 0.7,
  }
});
