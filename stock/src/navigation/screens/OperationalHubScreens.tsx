import { useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useOwnerDashboardQuery } from "../../hooks/useDashboard";
import { LinearGradient } from "expo-linear-gradient";

import { ScreenScaffold } from "../../components/layout/ScreenScaffold";
import { ScrollScreen } from "../../components/layout/ScrollScreen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/feedback/LoadingState";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";
import { triggerLightHaptic, triggerMediumHaptic } from "../../utils/haptics";
import { Notifications } from "./Notifications";

const smartTitle = (routeName: string) => {
  return routeName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const configs: Record<string, { title: string; subtitle: string; primary: string }> = {
  SplitPayment: {
    title: "Split Payment",
    subtitle: "Divide a single bill across multiple payment methods.",
    primary: "Proceed to split",
  },
  StockMovementHistory: {
    title: "Stock Ledger",
    subtitle: "Complete audit log of physical item movements.",
    primary: "Download CSV",
  },
  CorrectionRequests: {
    title: "Correction Queue",
    subtitle: "Approval requests for editing or deleting records.",
    primary: "Bulk approve",
  },
  RateChangeRequests: {
    title: "Price Approvals",
    subtitle: "Requests to sell items below minimum set price.",
    primary: "Review all",
  },
  ChequeList: {
    title: "Cheque Tracking",
    subtitle: "Monitor received, cleared, and bounced cheques.",
    primary: "Record deposit",
  },
  DeliveryMemoList: {
    title: "Delivery Memos",
    subtitle: "Manage kachha bills and pending conversions.",
    primary: "Create new DM",
  },
};

function ConfiguredScreen({ config }: { config: typeof configs[string] }) {
  return (
    <ScreenScaffold title={config.title} subtitle={config.subtitle} showBack>
      <EmptyState
        icon="progress-wrench"
        title={`${config.title} is coming soon`}
        subtitle={`We are currently refining the ${config.title.toLowerCase()} workflow to ensure it meets operational standards.`}
        action={<Button label={config.primary} variant="primary" style={{ width: 220 }} />}
      />
    </ScreenScaffold>
  );
}

export function OwnerRecords() {
  return (
    <ScrollScreen title="Operations History" subtitle="Consolidated business records.">
      <ScreenSection title="Direct reports">
        <View style={styles.gridContainer}>
          <Pressable onPress={() => navigate("SalesList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="receipt" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>SALES LOG</Text>
            <Text style={styles.statValue}>Invoices</Text>
          </Pressable>
          <Pressable onPress={() => navigate("Expenses")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="cash-minus" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>EXPENSES</Text>
            <Text style={styles.statValue}>Outgoings</Text>
          </Pressable>
          <Pressable onPress={() => navigate("CustomerList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="account-group" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>CUSTOMERS</Text>
            <Text style={styles.statValue}>Profiles</Text>
          </Pressable>
          <Pressable onPress={() => navigate("DailySummaryList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="file-chart-outline" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>SUMMARIES</Text>
            <Text style={styles.statValue}>Day End</Text>
          </Pressable>
        </View>
      </ScreenSection>

      <ScreenSection title="Banking & Finance">
        <View style={styles.gridContainer}>
          <Pressable onPress={() => navigate("ChequeList")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="card-bulleted-outline" size={24} color={colors.textSecondary} />
            <Text style={styles.statLabel}>CHEQUES</Text>
            <Text style={styles.statValue}>Collection</Text>
          </Pressable>
          <Pressable onPress={() => navigate("AuditLog")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="history" size={24} color={colors.textSecondary} />
            <Text style={styles.statLabel}>AUDIT LOG</Text>
            <Text style={styles.statValue}>Tracking</Text>
          </Pressable>
        </View>
      </ScreenSection>
    </ScrollScreen>
  );
}

export function OwnerStock() {
  const handleCatalogPress = () => {
    triggerMediumHaptic();
    navigate("ItemList");
  };

  return (
    <ScrollScreen title="Inventory Ops" subtitle="Monitor and adjust stock levels.">
      <ScreenSection title="Primary Catalog Browser">
        <Pressable
          onPress={handleCatalogPress}
          style={({ pressed }) => [styles.heroActionCard, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[colors.primary, "#16a34a"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroActionCardGradient}
          >
            <View style={styles.heroActionCardInner}>
              <View style={styles.heroActionCardLeft}>
                <View style={styles.heroActionIconBg}>
                  <Icon source="barcode-scan" size={26} color={colors.primary} />
                </View>
                <View style={styles.heroActionCardContent}>
                  <Text style={styles.heroActionCardTitle}>Products Catalog</Text>
                  <Text style={styles.heroActionCardDesc}>Browse items, search stock levels & view stats</Text>
                </View>
              </View>
              <Icon source="chevron-right" size={24} color="#ffffff" />
            </View>
          </LinearGradient>
        </Pressable>
      </ScreenSection>

      <ScreenSection title="Inventory Controls">
        <View style={styles.gridContainer}>
          <Pressable onPress={() => navigate("StockEntry")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="plus-box" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>ADD STOCK</Text>
            <Text style={styles.statValue}>Restock Entry</Text>
          </Pressable>
          <Pressable onPress={() => navigate("AddEditItem")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="package-variant-plus" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>ADD PRODUCT</Text>
            <Text style={styles.statValue}>New Item</Text>
          </Pressable>
          <Pressable onPress={() => navigate("ManageCategories")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="tag-multiple-outline" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>CATEGORIES</Text>
            <Text style={styles.statValue}>Manage Cats</Text>
          </Pressable>
          <Pressable onPress={() => navigate("ManageBrands")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="certificate-outline" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>BRANDS</Text>
            <Text style={styles.statValue}>Manage Brands</Text>
          </Pressable>
          <Pressable onPress={() => navigate("StockMovementHistory")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="swap-horizontal" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>STOCK LEDGER</Text>
            <Text style={styles.statValue}>History</Text>
          </Pressable>
          <Pressable onPress={() => navigate("StockDashboard")} style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}>
            <Icon source="warehouse" size={24} color={colors.primary} />
            <Text style={styles.statLabel}>DASHBOARD</Text>
            <Text style={styles.statValue}>Stock Alerts</Text>
          </Pressable>
        </View>
      </ScreenSection>
    </ScrollScreen>
  );
}

export function OwnerAlerts() {
  return <Notifications />;
}

export function GenericPlannedScreen() {
  const route = useRoute();
  return <ConfiguredScreen config={configs[route.name] ?? { title: smartTitle(route.name), subtitle: "ShopControl screen.", primary: "Save" }} />;
}

const styles = StyleSheet.create({
  heroActionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    ...shadow.md,
  },
  heroActionCardGradient: {
    padding: spacing.lg,
  },
  heroActionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroActionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  heroActionIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionCardContent: {
    flex: 1,
    gap: 2,
  },
  heroActionCardTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: '#ffffff',
  },
  heroActionCardDesc: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs - 2,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  statValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
});
