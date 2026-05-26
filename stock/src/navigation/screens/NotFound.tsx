import { View } from "react-native";
import { Button, Text } from "react-native-paper";
import { Screen } from "@/components/Screen";

export function NotFound() {
  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text variant="headlineMedium">404</Text>
        <Text>Screen not found.</Text>
        <Button mode="contained" icon="home">
          Go home
        </Button>
      </View>
    </Screen>
  );
}
