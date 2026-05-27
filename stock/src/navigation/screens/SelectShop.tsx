import { useEffect } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Text } from "react-native-paper";
import { fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function SelectShop() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId, lastUsedShopId, setActiveShopId } = useShopStore();
  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  useEffect(() => {
    if (!shopsQuery.data?.length || activeShopId) return;

    const lastUsed = shopsQuery.data.find((shop) => shop.id === lastUsedShopId);
    if (lastUsed) {
      setActiveShopId(lastUsed.id);
      return;
    }

    if (shopsQuery.data.length === 1) {
      setActiveShopId(shopsQuery.data[0].id);
    }
  }, [activeShopId, lastUsedShopId, setActiveShopId, shopsQuery.data]);

  return (
    <Screen>
      <AppHeader title="Select your shop" subtitle="Choose the shop you want to work in." />

      {shopsQuery.isLoading ? (
        <View className="flex-1 items-center justify-center gap-3 py-20">
          <ActivityIndicator />
          <Text style={{ color: "#64748b" }}>Loading shops...</Text>
        </View>
      ) : null}

      {shopsQuery.isError ? (
        <Section title="Unable to load shops">
          <Text style={{ color: "#991b1b" }}>Check your connection and try again.</Text>
        </Section>
      ) : null}

      {shopsQuery.data?.length === 0 ? (
        <Section title="No shops assigned">
          <Text style={{ color: "#4b5563" }}>Ask the owner to assign a shop to this account.</Text>
        </Section>
      ) : null}

      {shopsQuery.data && shopsQuery.data.length > 1 ? (
        <Section title="Available shops">
          <View className="gap-3">
            {shopsQuery.data.map((shop) => (
              <View key={shop.id} className="gap-2">
                <ActionTile
                  title={shop.name}
                  subtitle={`${shop.city} • Code: ${shop.code}`}
                  icon="storefront-outline"
                  tone={shop.id === lastUsedShopId ? "blue" : "green"}
                  onPress={() => setActiveShopId(shop.id)}
                />
                <View className="flex-row gap-2 pl-1">
                  <StatusPill label="Active" tone="green" />
                  {shop.id === lastUsedShopId ? <StatusPill label="Last used" tone="blue" /> : null}
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
