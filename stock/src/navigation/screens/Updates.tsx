import React, { useState } from "react";
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

  const uniqueStaffIds = new Set<string>();
  shopsQuery.data?.forEach((shop) => {
    (shop as any).staffAccesses?.forEach((access: any) => {
      if (access.staff?.id) {
        uniqueStaffIds.add(access.staff.id);
      }
    });
  });
  const activeStaffCount = uniqueStaffIds.size;

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
                <Text style={styles.statsLabel}>TOTAL PORTFOLIO REVENUE</Text>
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
          {shopsQuery.isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />}

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
  const cashOnHand = currentSessionQuery.data ? currentSessionQuery.data.expectedCash : shop.openingCash;

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
               <Text style={styles.shopAvatarText}>{shop.name[0]}</Text>
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
  },
  scrollContent: {
    paddingBottom: 100,
  },
  statsBar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    backgroundColor: colors.textPrimary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadow.md,
  },
  statsLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  statsValue: {
    color: colors.textInverse,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  emptyContainer: {
    padding: spacing.huge,
    alignItems: 'center',
    opacity: 0.4,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  footerManagement: {
    marginTop: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  managementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  managementBtnText: {
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
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
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardPadding: {
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  shopInfo: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  shopAvatar: {
    height: 56,
    width: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMid,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  shopAvatarText: {
    color: colors.textInverse,
    fontSize: 24,
    fontWeight: fontWeight.black,
  },
  shopNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  shopName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  liveIndicator: {
    height: 8,
    width: 8,
    borderRadius: radius.full,
    backgroundColor: colors.success,
  },
  shopSubtext: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  cardMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
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
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatarsRow: {
    flexDirection: 'row',
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
  manageBtn: {
    minHeight: 32,
  },
  pressed: {
    opacity: 0.7,
  }
});
