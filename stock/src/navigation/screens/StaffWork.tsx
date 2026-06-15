import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Text, Icon } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";

type WorkflowItemProps = {
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  onPress: () => void;
};

function WorkflowItem({ title, subtitle, icon, iconBg, iconColor, onPress }: WorkflowItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.itemCard,
        pressed && styles.pressed
      ]}
    >
      <View style={styles.itemLeft}>
        <View style={[styles.iconWrapper, { backgroundColor: iconBg }]}>
          <Icon source={icon} size={22} color={iconColor} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.itemTitle}>{title}</Text>
          <Text style={styles.itemSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.arrowWrapper}>
        <Icon source="chevron-right" size={20} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

export function StaffWork() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Workflows" role="STAFF" />

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Counter Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Counter</Text>
          <View style={styles.cardContainer}>
            <WorkflowItem
              title="New sale"
              subtitle="Walk-in or regular customer sale."
              icon="cart-plus"
              iconBg="rgba(22, 163, 74, 0.06)"
              iconColor={colors.success}
              onPress={() => navigate("NewSaleType")}
            />
            
            <WorkflowItem
              title="Open cash"
              subtitle="Start the counter session before cash sales."
              icon="cash-register"
              iconBg="rgba(20, 184, 166, 0.06)"
              iconColor="#0d9488"
              onPress={() => navigate("OpenCashSession")}
            />

            <WorkflowItem
              title="Take payment"
              subtitle="Cash, UPI, card, bank, cheque, or pending."
              icon="credit-card-outline"
              iconBg="rgba(217, 119, 6, 0.06)"
              iconColor="#d97706"
              onPress={() => navigate("TakePayment")}
            />
          </View>
        </View>

        {/* Back Office Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Back office</Text>
          <View style={styles.cardContainer}>
            <WorkflowItem
              title="Orders to pack"
              subtitle="Pick, pack, shortage, and dispatch flow."
              icon="package-variant-closed"
              iconBg="rgba(22, 163, 74, 0.06)"
              iconColor={colors.success}
              onPress={() => navigate("OrdersToPack")}
            />

            <WorkflowItem
              title="Stock entry"
              subtitle="Stock in, stock out, damage, and adjustment."
              icon="warehouse"
              iconBg="rgba(20, 184, 166, 0.06)"
              iconColor="#0d9488"
              onPress={() => navigate("StockEntry")}
            />

            <WorkflowItem
              title="Log expense"
              subtitle="Log daily outgoings (tea, freight, porter, misc)."
              icon="cash-minus"
              iconBg="rgba(239, 68, 68, 0.06)"
              iconColor="#ef4444"
              onPress={() => navigate("Expenses")}
            />

            <WorkflowItem
              title="Close day"
              subtitle="Expected cash, actual cash, mismatch reason."
              icon="cash-check"
              iconBg="rgba(217, 119, 6, 0.06)"
              iconColor="#d97706"
              onPress={() => navigate("CloseDay")}
            />
          </View>
        </View>

        {/* Informational Footer Caption */}
        <Text style={styles.footerText}>
          Staff can run the counter flow here; owner-only review screens will sit on top of the same records.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 120, // prevents tab bar overlay blocking the content
  },
  section: {
    marginTop: spacing.md,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    letterSpacing: -0.3,
  },
  cardContainer: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    ...shadow.sm,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.lg,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    gap: 3,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    lineHeight: 16,
  },
  arrowWrapper: {
    paddingLeft: spacing.sm,
  },
  footerText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: "left",
    paddingHorizontal: 2,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});
