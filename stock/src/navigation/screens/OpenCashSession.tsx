import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, Icon, Portal, Modal, Divider, List } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { fetchCurrentCashSession, fetchShops, openCashSession } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

export function OpenCashSession() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId, setActiveShopId } = useShopStore();
  const queryClient = useQueryClient();
  const navigation = useNavigation();

  const [shopModalVisible, setShopModalVisible] = useState(false);

  // Queries
  const shopsQuery = useQuery({ 
    queryKey: ["shops"], 
    queryFn: () => fetchShops(token ?? ""), 
    enabled: !!token 
  });

  const currentQuery = useQuery({
    queryKey: ["cash-session", activeShopId],
    queryFn: () => fetchCurrentCashSession(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const openMutation = useMutation({
    mutationFn: () => openCashSession(token ?? "", activeShopId ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-session", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["staff-today-summary", activeShopId] });
    },
  });

  const selectedShop = useMemo(() => 
    shopsQuery.data?.find((shop) => shop.id === activeShopId),
    [shopsQuery.data, activeShopId]
  );

  const isSessionOpen = !!currentQuery.data;

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
        <View style={styles.gridContainer}>
          {/* Card 1: Opening Cash */}
          <View style={styles.card}>
            <View style={[styles.iconWrapper, { backgroundColor: "rgba(217, 119, 6, 0.06)" }]}>
              <Icon source="cash-multiple" size={24} color={colors.warning} />
            </View>
            <Text style={styles.cardValue}>
              ₹{Number(selectedShop?.openingCash ?? 0).toLocaleString("en-IN")}
            </Text>
            <Text style={styles.cardLabel}>OPENING CASH</Text>
          </View>

          {/* Card 2: Session Status */}
          <View style={styles.card}>
            <View style={[
              styles.iconWrapper, 
              { backgroundColor: isSessionOpen ? "rgba(22, 163, 74, 0.06)" : "rgba(2, 132, 199, 0.06)" }
            ]}>
              <Icon 
                source="cash-register" 
                size={24} 
                color={isSessionOpen ? colors.success : colors.info} 
              />
            </View>
            <Text style={[
              styles.cardValue,
              isSessionOpen ? styles.statusOpenText : styles.statusClosedText
            ]}>
              {isSessionOpen ? "OPEN" : "NONE"}
            </Text>
            <Text style={styles.cardLabel}>SESSION</Text>
          </View>
        </View>

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
                  onPress={() => (navigation as any).navigate("TakePayment")}
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
                  onPress={() => (navigation as any).navigate("WalkInSale")}
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
                <View key={shop.id}>
                  <List.Item
                    title={shop.name}
                    titleStyle={[
                      styles.shopItemTitle,
                      isSelected && styles.shopItemTitleActive
                    ]}
                    description={`${shop.city || "No City"} • Opening Cash: ₹${shop.openingCash}`}
                    onPress={() => {
                      setActiveShopId(shop.id);
                      setShopModalVisible(false);
                    }}
                    right={(props) => isSelected ? (
                      <List.Icon {...props} icon="check-circle" color={colors.primary} />
                    ) : null}
                  />
                  <Divider style={styles.modalDivider} />
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
    paddingTop: spacing.xs,
    paddingBottom: 120,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  shopSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.md,
  },
  shopSelectorText: {
    flex: 1,
    color: "#ffffff",
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.md,
    marginLeft: spacing.sm,
  },
  gridContainer: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: spacing.lg,
    ...shadow.sm,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  cardValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  statusOpenText: {
    color: colors.success,
  },
  statusClosedText: {
    color: colors.info,
  },
  cardLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  openButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    ...shadow.md,
  },
  openButtonContent: {
    height: 52,
  },
  openButtonLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: "#ffffff",
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: spacing.xl,
    ...shadow.sm,
  },
  successHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  successTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.success,
  },
  successDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 20,
  },
  divider: {
    marginVertical: spacing.lg,
    backgroundColor: "#e2e8f0",
  },
  shortcutsContainer: {
    gap: spacing.sm,
  },
  shortcutsTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  shortcutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  shortcutLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  shortcutIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalContent: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.xl,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  modalScroll: {
    paddingBottom: spacing.md,
  },
  shopItemTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  shopItemTitleActive: {
    color: colors.primary,
    fontWeight: fontWeight.extrabold,
  },
  modalDivider: {
    backgroundColor: colors.surfaceOffset,
  },
});
