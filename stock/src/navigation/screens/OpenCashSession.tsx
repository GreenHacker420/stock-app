import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, Icon, Portal, Modal, Divider, List } from "react-native-paper";
import { fetchCurrentCashSession, fetchShops, openCashSession } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { MetricGrid } from "../../components/ui/MetricGrid";
import { ShopCard } from "../../components/domain/shops/ShopCard";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";
import { newIdempotencyKey } from "../../utils/idempotency";
import { requireActiveShopId, useSwitchActiveShop } from "../../hooks/useActiveShop";

export function OpenCashSession() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const switchActiveShop = useSwitchActiveShop();
  const queryClient = useQueryClient();

  const [shopModalVisible, setShopModalVisible] = useState(false);

  // Queries
  const shopsQuery = useQuery({ 
    queryKey: ["shops"], 
    queryFn: () => fetchShops(token ?? ""), 
    enabled: !!token 
  });

  const currentQuery = useQuery({
    queryKey: ["current-cash-session", activeShopId],
    queryFn: () => fetchCurrentCashSession(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const openMutation = useMutation({
    mutationFn: () =>
      openCashSession(token ?? "", requireActiveShopId(activeShopId), { idempotencyKey: newIdempotencyKey("CASH_SESSION_OPEN") }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-cash-session", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["cash-sessions", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
    },
  });

  const selectedShop = useMemo(() => 
    shopsQuery.data?.find((shop) => shop.id === activeShopId),
    [shopsQuery.data, activeShopId]
  );

  const isSessionOpen = !!currentQuery.data;
  const openingCashValue = Number(currentQuery.data?.openingCash ?? 0);

  const handleOpenSession = () => {
    if (!activeShopId) return;
    openMutation.mutate();
  };

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Open cash session" showBack />

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Shop Picker Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Shop</Text>
          <Pressable 
            style={styles.shopSelector}
            onPress={() => setShopModalVisible(true)}
          >
            <Icon source="storefront-outline" size={20} color="#ffffff" />
            <Text style={styles.shopSelectorText}>
              {selectedShop ? selectedShop.name : "Select Shop"}
            </Text>
            <Icon source="chevron-down" size={20} color="#ffffff" />
          </Pressable>
        </View>

        {/* Status Metrics Grid */}
        <MetricGrid
          items={[
            { label: "OPENING CASH", value: `₹${openingCashValue.toLocaleString("en-IN")}`, icon: "cash-multiple", tone: "amber" },
            { label: "SESSION", value: isSessionOpen ? "OPEN" : "NONE", icon: "cash-register", tone: isSessionOpen ? "green" : "blue" },
          ]}
        />

        {/* Action / Information Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Action</Text>

          {isSessionOpen ? (
            <View style={styles.successCard}>
              <View style={styles.successHeader}>
                <Icon source="check-circle" size={26} color={colors.success} />
                <Text style={styles.successTitle}>Session is active</Text>
              </View>
              <Text style={styles.successDescription}>
                Counter cash tracking has been initialized for {selectedShop?.name}. All sales and payments will be recorded against this active session.
              </Text>
              
              <Divider style={styles.divider} />

              <View style={styles.shortcutsContainer}>
                <Text style={styles.shortcutsTitle}>Quick Shortcuts</Text>
                
                <Pressable 
                  style={styles.shortcutRow}
                  onPress={() => navigate("TakePayment")}
                >
                  <View style={styles.shortcutLeft}>
                    <View style={styles.shortcutIconBg}>
                      <Icon source="cash-register" size={18} color={colors.primary} />
                    </View>
                    <Text style={styles.shortcutText}>Record POS Payment</Text>
                  </View>
                  <Icon source="chevron-right" size={18} color={colors.textMuted} />
                </Pressable>

                <Pressable 
                  style={styles.shortcutRow}
                  onPress={() => navigate("WalkInSale")}
                >
                  <View style={styles.shortcutLeft}>
                    <View style={styles.shortcutIconBg}>
                      <Icon source="cart-plus" size={18} color={colors.primary} />
                    </View>
                    <Text style={styles.shortcutText}>New Walk-in Sale</Text>
                  </View>
                  <Icon source="chevron-right" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          ) : (
            <Button
              mode="contained"
              icon="cash-register"
              disabled={!activeShopId || openMutation.isPending}
              loading={openMutation.isPending}
              style={styles.openButton}
              contentStyle={styles.openButtonContent}
              labelStyle={styles.openButtonLabel}
              onPress={handleOpenSession}
            >
              Open session
            </Button>
          )}
        </View>
      </ScrollView>

      {/* Shop Switching Modal */}
      <Portal>
        <Modal
          visible={shopModalVisible}
          onDismiss={() => setShopModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Active Shop</Text>
            <Pressable onPress={() => setShopModalVisible(false)}>
              <Icon source="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {shopsQuery.data?.map((shop) => {
              const isSelected = shop.id === activeShopId;
              return (
                <View key={shop.id} style={styles.modalShopRow}>
                  <ShopCard
                    name={shop.name}
                    subtitle={shop.city || "No City"}
                    selected={isSelected}
                    onPress={() => {
                      switchActiveShop(shop.id);
                      setShopModalVisible(false);
                    }}
                  />
                </View>
              );
            })}
          </ScrollView>
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingLeft: spacing.xs,
  },
  shopSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: 24,
    ...shadow.sm,
  },
  shopSelectorText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: "#ffffff",
    flex: 1,
    marginHorizontal: spacing.md,
  },
  gridContainer: {
    flexDirection: "row",
    gap: spacing.md,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.xs,
    ...shadow.sm,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  cardValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  statusOpenText: {
    color: colors.success,
  },
  statusClosedText: {
    color: colors.textMuted,
  },
  openButton: {
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  openButtonContent: {
    height: 56,
  },
  openButtonLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  successHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  successTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  successDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  divider: {
    backgroundColor: colors.surfaceOffset,
    marginBottom: spacing.lg,
  },
  shortcutsContainer: {
    gap: spacing.md,
  },
  shortcutsTitle: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  shortcutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  shortcutLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  shortcutIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalContent: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    margin: spacing.xl,
    borderRadius: 28,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  modalScroll: {
    paddingBottom: spacing.md,
  },
  modalShopRow: {
    marginBottom: spacing.sm,
  },
  shopItemTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  shopItemTitleActive: {
    color: colors.primary,
  },
  shopItemDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  modalDivider: {
    backgroundColor: colors.surfaceOffset,
  },
});
