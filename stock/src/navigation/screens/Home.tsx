import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Button, Card, Chip, Text } from "react-native-paper";
import { fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";

export function Home() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  const shopCount = shopsQuery.data?.length ?? 0;

  return (
    <Screen>
      <View className="gap-2">
        <Chip icon={user?.role === "OWNER" ? "shield-account" : "account-hard-hat"}>
          {user?.role}
        </Chip>
        <Text variant="headlineMedium" className="text-ink">
          Today
        </Text>
        <Text variant="bodyMedium" className="text-neutral-600">
          {user?.name}, your shop operations are ready.
        </Text>
      </View>

      <View className="grid gap-3">
        <Card mode="contained">
          <Card.Title title="Shops" subtitle={`${shopCount} active access${shopCount === 1 ? "" : "es"}`} />
          <Card.Content>
            <Text variant="displaySmall">{shopCount}</Text>
          </Card.Content>
        </Card>

        <Card mode="contained">
          <Card.Title title="Cash session" subtitle="Open, close, and reconcile counter cash" />
          <Card.Actions>
            <Button icon="cash-register">Open</Button>
            <Button icon="clipboard-check-outline">Close</Button>
          </Card.Actions>
        </Card>

        <Card mode="contained">
          <Card.Title title="Quick sale" subtitle="Walk-in sale, regular sale, or DM" />
          <Card.Actions>
            <Button icon="cart-plus">Sale</Button>
            <Button icon="truck-delivery-outline">DM</Button>
          </Card.Actions>
        </Card>
      </View>
    </Screen>
  );
}
