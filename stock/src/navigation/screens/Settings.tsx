import { View } from "react-native";
import { Text } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";

export function Settings() {
  return (
    <Screen>
      <AppHeader title="Workflows" subtitle="Operational shortcuts for daily shop activity." />
      <Section title="Counter">
        <View className="gap-3">
          <ActionTile title="New sale" subtitle="Walk-in or regular customer sale." icon="cart-plus" />
          <ActionTile title="Create DM" subtitle="Goods sent before final bill or payment." icon="truck-delivery-outline" tone="blue" />
          <ActionTile title="Take payment" subtitle="Cash, UPI, card, bank, cheque, or pending." icon="wallet-plus-outline" tone="amber" />
        </View>
      </Section>
      <Section title="Back office">
        <View className="gap-3">
          <ActionTile title="Orders to pack" subtitle="Pick, pack, shortage, and dispatch flow." icon="package-variant" tone="blue" />
          <ActionTile title="Stock entry" subtitle="Stock in, stock out, damage, and adjustment." icon="warehouse" />
          <ActionTile title="Close day" subtitle="Expected cash, actual cash, mismatch reason." icon="cash-check" tone="amber" />
        </View>
      </Section>
      <Text variant="bodySmall" style={{ color: "#667064" }}>
        These tiles will become the main staff workflow screens as we connect forms.
      </Text>
    </Screen>
  );
}
