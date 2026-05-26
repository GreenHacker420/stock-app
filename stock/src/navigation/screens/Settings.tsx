import { View } from "react-native";
import { Card, List, Text } from "react-native-paper";
import { Screen } from "@/components/Screen";

export function Settings() {
  return (
    <Screen>
      <View className="gap-1">
        <Text variant="headlineMedium">Operations</Text>
        <Text variant="bodyMedium" className="text-neutral-600">
          Staff workflows to build next.
        </Text>
      </View>
      <Card mode="contained">
        <List.Item title="Orders to pack" left={(props) => <List.Icon {...props} icon="package-variant" />} />
        <List.Item title="New sale" left={(props) => <List.Icon {...props} icon="cart-plus" />} />
        <List.Item title="Create DM" left={(props) => <List.Icon {...props} icon="truck-delivery-outline" />} />
        <List.Item title="Stock entry" left={(props) => <List.Icon {...props} icon="warehouse" />} />
        <List.Item title="Close day" left={(props) => <List.Icon {...props} icon="cash-check" />} />
      </Card>
    </Screen>
  );
}
