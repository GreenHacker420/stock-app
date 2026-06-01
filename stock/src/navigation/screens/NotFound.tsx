import { View, StyleSheet } from "react-native";
import { Button, Text } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { colors, spacing } from "../../theme";

export function NotFound() {
  return (
    <Screen>
      <View style={styles.container}>
        <Text variant="headlineMedium">404</Text>
        <Text>Screen not found.</Text>
        <Button mode="contained" icon="home" contentStyle={styles.buttonContent}>
          Go home
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.md,
  },
  buttonContent: {
    height: 44,
  },
});
