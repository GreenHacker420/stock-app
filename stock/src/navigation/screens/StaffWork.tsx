import { StyleSheet, ScrollView, View } from "react-native";
import { Text } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { colors, spacing, fontWeight } from "../../theme";
import { navigate } from "../navigation-ref";

export function StaffWork() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerSpacer}>
          <Text style={styles.pageTitle}>Workflows</Text>
          <Text style={styles.pageSubtitle}>Day-to-day shop operations</Text>
        </View>

        {/* Counter Section */}
        <ScreenSection title="Counter" style={styles.section}>
          <View style={styles.cardContainer}>
            <ActionTile
              title="New sale"
              subtitle="Walk-in or regular customer sale."
              icon="cart-plus"
              tone="green"
              onPress={() => navigate("NewSaleType")}
            />
            
            <ActionTile
              title="Open cash"
              subtitle="Start the counter session before cash sales."
              icon="cash-register"
              tone="blue"
              onPress={() => navigate("OpenCashSession")}
            />

            <ActionTile
              title="Take payment"
              subtitle="Cash, UPI, card, bank, cheque, or pending."
              icon="credit-card-outline"
              tone="amber"
              onPress={() => navigate("TakePayment")}
            />
          </View>
        </ScreenSection>

        {/* Back Office Section */}
        <ScreenSection title="Back office" style={styles.section}>
          <View style={styles.cardContainer}>
            <ActionTile
              title="Orders to pack"
              subtitle="Pick, pack, shortage, and dispatch flow."
              icon="package-variant-closed"
              tone="green"
              onPress={() => navigate("OrdersToPack")}
            />

            <ActionTile
              title="Stock entry"
              subtitle="Stock in, stock out, damage, and adjustment."
              icon="warehouse"
              tone="blue"
              onPress={() => navigate("StockEntry")}
            />

            <ActionTile
              title="Log expense"
              subtitle="Log daily outgoings (tea, freight, porter, misc)."
              icon="cash-minus"
              tone="red"
              onPress={() => navigate("Expenses")}
            />

            <ActionTile
              title="Close day"
              subtitle="Expected cash, actual cash, mismatch reason."
              icon="cash-check"
              tone="amber"
              onPress={() => navigate("CloseDay")}
            />
          </View>
        </ScreenSection>

        {/* Informational Footer Caption */}
        <Text style={styles.footerText}>
          Staff can run the counter flow here; owner-only review screens will sit on top of the same records.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerSpacer: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 120, // prevents tab bar overlay blocking the content
  },
  section: {
    marginTop: spacing.md,
  },
  cardContainer: {
    gap: spacing.md,
    marginBottom: spacing.lg,
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
});
