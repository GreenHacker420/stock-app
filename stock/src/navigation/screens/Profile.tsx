import { View } from "react-native";
import { Button, Card, Text } from "react-native-paper";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";

export function Profile() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <Screen>
      <View className="gap-1">
        <Text variant="headlineMedium">Profile</Text>
        <Text variant="bodyMedium" className="text-neutral-600">
          Current signed-in user.
        </Text>
      </View>
      <Card mode="contained">
        <Card.Title title={user?.name} subtitle={user?.role} />
        <Card.Content>
          <Text>{user?.mobile}</Text>
          {user?.email ? <Text>{user.email}</Text> : null}
        </Card.Content>
        <Card.Actions>
          <Button icon="logout" onPress={signOut}>
            Sign out
          </Button>
        </Card.Actions>
      </Card>
    </Screen>
  );
}
