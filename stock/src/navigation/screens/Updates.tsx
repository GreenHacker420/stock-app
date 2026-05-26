import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { ListItem, Skeleton } from "@rneui/themed";
import { Text } from "react-native-paper";
import { fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function Updates() {
  const token = useAuthStore((state) => state.token);
  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  return (
    <Screen>
      <AppHeader title="Shops" subtitle="Shop-level access, setup, and opening stock status." />

      {shopsQuery.isLoading ? (
        <View className="gap-3">
          <Skeleton height={86} style={{ borderRadius: 8 }} />
          <Skeleton height={86} style={{ borderRadius: 8 }} />
        </View>
      ) : null}

      <Section title="Available shops">
        <View className="overflow-hidden rounded-lg border border-[#d9dfd2] bg-white">
          {shopsQuery.data?.map((shop, index) => (
            <ListItem
              key={shop.id}
              bottomDivider={index !== (shopsQuery.data?.length ?? 0) - 1}
              containerStyle={{ backgroundColor: "#ffffff", paddingVertical: 14 }}
            >
              <ListItem.Content>
                <ListItem.Title style={{ color: "#17211b", fontWeight: "800" }}>
                  {shop.name}
                </ListItem.Title>
                <ListItem.Subtitle style={{ color: "#667064", marginTop: 3 }}>
                  {shop.code} • {shop.city} • Opening cash ₹{shop.openingCash}
                </ListItem.Subtitle>
              </ListItem.Content>
              <StatusPill
                label={shop.openingStockLocked ? "Stock locked" : "Setup pending"}
                tone={shop.openingStockLocked ? "green" : "amber"}
              />
            </ListItem>
          ))}
        </View>
      </Section>

      {!shopsQuery.isLoading && !shopsQuery.data?.length ? (
        <View className="rounded-lg border border-dashed border-[#b9c3b5] bg-white p-5">
          <Text variant="titleMedium" style={{ color: "#17211b", fontWeight: "700" }}>
            No shops yet
          </Text>
          <Text variant="bodyMedium" style={{ color: "#667064", marginTop: 4 }}>
            Create a shop from the backend or owner setup screen.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
