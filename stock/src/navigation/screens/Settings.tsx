import { View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Text } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { colors, spacing } from "../../theme";

export function Settings() {
  const navigation = useNavigation();
  const navigate = (screen: string) => {
    (navigation as { navigate: (screenName: string) => void }).navigate(screen);
  };

  return (
    <Screen>
      <AppHeader title="Workflows" subtitle="Operational shortcuts for daily shop activity." />
      <Section title="Counter">
        <View style={styles.listGap}>
          <ActionTile title="New sale" subtitle="Walk-in or regular customer sale." icon="cart-plus" onPress={() => navigate("WalkInSale")} />
          <ActionTile title="Open cash" subtitle="Start the counter session before cash sales." icon="cash-register" tone="blue" onPress={() => navigate("OpenCashSession")} />
          <ActionTile title="Take payment" subtitle="Cash, UPI, card, bank, cheque, or pending." icon="wallet-plus-outline" tone="amber" />
        </View>
      </Section>
      <Section title="Back office">
        <View style={styles.listGap}>
          <ActionTile title="Orders to pack" subtitle="Pick, pack, shortage, and dispatch flow." icon="package-variant" tone="blue" onPress={() => navigate("OrdersToPack")} />
          <ActionTile title="Stock entry" subtitle="Stock in, stock out, damage, and adjustment." icon="warehouse" onPress={() => navigate("StockEntry")} />
          <ActionTile title="Close day" subtitle="Expected cash, actual cash, mismatch reason." icon="cash-check" tone="amber" onPress={() => navigate("CloseDay")} />
        </View>
      </Section>
      <Text variant="bodySmall" style={styles.mutedText}>
        Staff can run the counter flow here; owner-only review screens will sit on top of the same records.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listGap: {
    gap: spacing.md,
  },
  mutedText: {
    color: colors.textSecondary,
    marginVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
});
