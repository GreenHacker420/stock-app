import { View, StyleSheet } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { useShopStore } from "../../auth/shop-store";
import { useShopsQuery } from "../../hooks/useShops";
import { useAuthStore } from "../../auth/auth-store";
import { useSwitchActiveShop } from "../../hooks/useActiveShop";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { ShopCard } from "../../components/domain/shops/ShopCard";
import { colors, spacing } from "../../theme";

export function SelectShop() {
  const user = useAuthStore((state) => state.user);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const getLastUsedShopIdForUser = useShopStore((state) => state.getLastUsedShopIdForUser);
  const shopsQuery = useShopsQuery();
  const switchActiveShop = useSwitchActiveShop();
  const lastUsedShopId = getLastUsedShopIdForUser(user?.id);

  return (
    <Screen>
      <AppHeader title="Select your shop" subtitle="Choose the shop you want to work in." />

      {shopsQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
          <Text style={styles.secondaryText}>Loading shops...</Text>
        </View>
      ) : null}

      {shopsQuery.isError ? (
        <Section title="Unable to load shops">
          <Text style={styles.errorText}>Check your connection and try again.</Text>
        </Section>
      ) : null}

      {shopsQuery.data?.length === 0 ? (
        <Section title="No shops assigned">
          <Text style={styles.mutedText}>Ask the owner to assign a shop to this account.</Text>
        </Section>
      ) : null}

      {shopsQuery.data && shopsQuery.data.length > 0 ? (
        <Section title="Available shops">
          <View style={styles.listGap}>
            {shopsQuery.data.map((shop) => (
              <View key={shop.id} style={styles.itemGap}>
                <ShopCard
                  name={shop.name}
                  subtitle={`${shop.city} • Code: ${shop.code}`}
                  selected={shop.id === activeShopId}
                  onPress={() => switchActiveShop(shop.id)}
                />
	                <View style={styles.pillRow}>
	                  <StatusPill label="Active" tone="green" />
	                  {shop.id === activeShopId ? <StatusPill label="Selected" tone="blue" /> : null}
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: 80,
  },
  secondaryText: {
    color: colors.textSecondary,
  },
  errorText: {
    color: "#991b1b",
  },
  mutedText: {
    color: colors.textSecondary,
  },
  listGap: {
    gap: spacing.md,
  },
  itemGap: {
    gap: spacing.sm,
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
});
