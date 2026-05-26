import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { ActivityIndicator, Card, Text } from "react-native-paper";
import { fetchShops } from "@/api/client";
import { useAuthStore } from "@/auth/auth-store";
import { Screen } from "@/components/Screen";

export function Updates() {
  const token = useAuthStore((state) => state.token);
  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  return (
    <Screen>
      <View className="gap-1">
        <Text variant="headlineMedium">Shops</Text>
        <Text variant="bodyMedium" className="text-neutral-600">
          Shop-level access and setup.
        </Text>
      </View>

      {shopsQuery.isLoading ? <ActivityIndicator /> : null}

      <View className="gap-3">
        {shopsQuery.data?.map((shop) => (
          <Card key={shop.id} mode="contained">
            <Card.Title title={shop.name} subtitle={`${shop.code} • ${shop.city}`} />
            <Card.Content>
              <Text>Opening cash: ₹{shop.openingCash}</Text>
              <Text>Opening stock: {shop.openingStockLocked ? "Locked" : "Pending"}</Text>
            </Card.Content>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
