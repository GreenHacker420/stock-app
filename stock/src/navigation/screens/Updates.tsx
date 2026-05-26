import { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { FAB, Text, Portal, Dialog, List, Icon, ActivityIndicator, Button } from "react-native-paper";
import { fetchShops, Shop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function Updates() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const navigation = useNavigation();

  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  const isOwner = user?.role === "OWNER";

  const handleShopPress = (shop: Shop) => {
    if (isOwner) {
      setSelectedShop(shop);
      setIsActionsOpen(true);
    }
  };

  const navigate = (screen: string, params?: any) => {
    setIsActionsOpen(false);
    (navigation as any).navigate(screen, params);
  };

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Shops"
        subtitle={isOwner ? "Owner: manage shops, staff, and stocks." : "Staff: view assigned shops."}
      />

      <ScrollView className="flex-1 mt-2">
        <Section title={`Available Shops (${shopsQuery.data?.length ?? 0})`}>
          {shopsQuery.isLoading ? (
            <ActivityIndicator style={{ marginTop: 20 }} />
          ) : null}

          {!shopsQuery.isLoading && !shopsQuery.data?.length ? (
            <View className="rounded-2xl border border-dashed border-[#b9c3b5] bg-white p-8 items-center">
              <Text variant="titleMedium" style={{ color: "#17211b", fontWeight: "700" }}>
                No shops yet
              </Text>
              <Text variant="bodySmall" style={{ color: "#667064", marginTop: 4, textAlign: "center" }}>
                {isOwner ? "Tap the '+' button below to create your first shop." : "Ask the owner to assign you to a shop."}
              </Text>
            </View>
          ) : null}

          <View className="gap-4">
            {shopsQuery.data?.map((shop) => {
              // Find list of assigned staff
              const accesses = (shop as any).staffAccesses || [];
              const staffNames = accesses.map((acc: any) => acc.staff?.name).join(", ");

              return (
                <Pressable
                  key={shop.id}
                  onPress={() => handleShopPress(shop)}
                  style={({ pressed }) => [
                    {
                      opacity: isOwner && pressed ? 0.8 : 1,
                      transform: [{ scale: isOwner && pressed ? 0.98 : 1 }],
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.03,
                      shadowRadius: 10,
                      elevation: 2,
                    },
                  ]}
                  className="rounded-2xl border border-[#e5eadd] bg-white p-4.5"
                >
                  <View className="flex-row justify-between items-start gap-2">
                    <View className="flex-1 gap-1">
                      <Text variant="titleMedium" style={{ color: "#17211b", fontWeight: "800", letterSpacing: -0.2 }}>
                        {shop.name}
                      </Text>
                      <Text variant="bodySmall" style={{ color: "#667064", lineHeight: 16 }}>
                        Code: {shop.code} • {shop.city}
                      </Text>
                      <Text variant="bodySmall" style={{ color: "#667064", lineHeight: 16 }}>
                        Opening cash: <Text style={{ color: "#17211b", fontWeight: "600" }}>₹{shop.openingCash}</Text>
                      </Text>
                      {staffNames ? (
                        <Text variant="bodySmall" style={{ color: "#2f7d5c", fontWeight: "600", marginTop: 4 }}>
                          Staff: {staffNames}
                        </Text>
                      ) : (
                        <Text variant="bodySmall" style={{ color: "#b7791f", fontWeight: "600", marginTop: 4 }}>
                          No staff assigned
                        </Text>
                      )}
                    </View>
                    <StatusPill
                      label={shop.openingStockLocked ? "Stock locked" : "Setup pending"}
                      tone={shop.openingStockLocked ? "green" : "amber"}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Section>
      </ScrollView>

      {isOwner && (
        <FAB
          icon="plus"
          label="Create Shop"
          color="#ffffff"
          style={{
            position: "absolute",
            margin: 16,
            right: 0,
            bottom: 0,
            backgroundColor: "#246b4b",
            borderRadius: 16,
          }}
          onPress={() => navigate("CreateEditShop")}
        />
      )}

      <Portal>
        <Dialog
          visible={isActionsOpen}
          onDismiss={() => setIsActionsOpen(false)}
          style={{ backgroundColor: "white", borderRadius: 20 }}
        >
          <Dialog.Title style={{ fontWeight: "800", color: "#17211b" }}>
            {selectedShop?.name} Setup
          </Dialog.Title>
          <Dialog.Content style={{ paddingHorizontal: 0 }}>
            <List.Item
              title="Edit Shop Details"
              description="Change name, city, or address details."
              left={(props) => <List.Icon {...props} icon="store-edit-outline" color="#246b4b" />}
              onPress={() => navigate("CreateEditShop", { shop: selectedShop })}
              titleStyle={{ fontWeight: "700", color: "#17211b" }}
            />
            <List.Item
              title="Assign Staff Operators"
              description="Grant staff access to manage this counter."
              left={(props) => <List.Icon {...props} icon="account-group-outline" color="#246b4b" />}
              onPress={() => navigate("AssignStaff", { shop: selectedShop })}
              titleStyle={{ fontWeight: "700", color: "#17211b" }}
            />
            {!selectedShop?.openingStockLocked ? (
              <List.Item
                title="Initialize Opening Stock"
                description="Set starting quantities before transactions start."
                left={(props) => <List.Icon {...props} icon="warehouse" color="#246b4b" />}
                onPress={() => navigate("SetOpeningStock", { shop: selectedShop })}
                titleStyle={{ fontWeight: "700", color: "#17211b" }}
              />
            ) : (
              <List.Item
                title="Opening Stock (Locked)"
                description="Locked after setup/transactions initialized."
                left={(props) => <List.Icon {...props} icon="lock-outline" color="#7a8578" />}
                titleStyle={{ fontWeight: "700", color: "#7a8578" }}
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsActionsOpen(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}
