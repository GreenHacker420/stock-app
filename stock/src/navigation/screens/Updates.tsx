import { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { FAB, Text, Portal, Dialog, List, Icon, ActivityIndicator, Button, Card } from "react-native-paper";
import { Avatar } from "@rneui/themed";
import { fetchShops, Shop, fetchOwnerDashboard, fetchCurrentCashSession } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
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

  const dashboardQuery = useQuery({
    queryKey: ["ownerDashboard", "portfolio"],
    queryFn: () => fetchOwnerDashboard(token ?? ""),
    enabled: !!token && isOwner,
  });

  const uniqueStaffIds = new Set<string>();
  shopsQuery.data?.forEach((shop) => {
    (shop as any).staffAccesses?.forEach((access: any) => {
      if (access.staff?.id) {
        uniqueStaffIds.add(access.staff.id);
      }
    });
  });
  const activeStaffCount = uniqueStaffIds.size;

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
        title="My Shops"
        subtitle={isOwner ? "Managing your retail portfolio" : "Your assigned workspace"}
      />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Global Stats Bar - High End */}
        {isOwner && (
          <View className="mx-4 mb-6 bg-gray-900 rounded-xl p-4 flex-row justify-between items-center shadow-lg">
             <View>
                <Text style={{ color: "#9ca3af", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>TOTAL PORTFOLIO REVENUE</Text>
                <Text variant="headlineSmall" style={{ color: "white", fontWeight: "900" }}>
                  ₹{Number(dashboardQuery.data?.todaySales ?? 0).toLocaleString("en-IN")}
                </Text>
             </View>
             <View className="items-end">
                <Text style={{ color: "#9ca3af", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>ACTIVE STAFF</Text>
                <Text variant="headlineSmall" style={{ color: "white", fontWeight: "900" }}>{activeStaffCount}</Text>
             </View>
          </View>
        )}

        <View className="px-4 gap-6">
          {shopsQuery.isLoading && <ActivityIndicator style={{ marginTop: 20 }} />}

          {shopsQuery.data?.map((shop) => (
            <ShopPortfolioCard 
              key={shop.id} 
              shop={shop} 
              onManage={() => handleShopPress(shop)} 
              isOwner={isOwner}
              token={token ?? ""}
            />
          ))}

          {!shopsQuery.isLoading && !shopsQuery.data?.length && (
             <View className="p-12 items-center opacity-30">
                <Icon source="store-plus-outline" size={64} color="#4b5563" />
                <Text variant="titleMedium" className="mt-4">No shops in portfolio</Text>
             </View>
          )}
        </View>

        {/* Global Management Shortcut */}
        {isOwner && (
           <View className="mt-8 px-4 py-6 border-t border-gray-100 flex-row justify-between bg-white/50">
              <Pressable className="flex-row items-center gap-2">
                 <Icon source="cog-outline" size={20} color="#6b7280" />
                 <Text style={{ color: "#4b5563", fontWeight: "700" }}>Global Settings</Text>
              </Pressable>
              <Pressable className="flex-row items-center gap-2">
                 <Icon source="shield-key-outline" size={20} color="#6b7280" />
                 <Text style={{ color: "#4b5563", fontWeight: "700" }}>Permissions</Text>
              </Pressable>
           </View>
        )}
      </ScrollView>

      {isOwner && (
        <FAB
          icon="plus"
          label="Add New Shop"
          color="#ffffff"
          style={{
            position: "absolute",
            margin: 16,
            right: 0,
            bottom: 0,
            backgroundColor: "#1e40af",
            borderRadius: 12,
          }}
          onPress={() => navigate("CreateEditShop")}
        />
      )}

      <Portal>
        <Dialog
          visible={isActionsOpen}
          onDismiss={() => setIsActionsOpen(false)}
          style={{ backgroundColor: "white", borderRadius: 16 }}
        >
          <Dialog.Title style={{ fontWeight: "800", color: "#111827" }}>
            {selectedShop?.name} Administration
          </Dialog.Title>
          <Dialog.Content style={{ paddingHorizontal: 0 }}>
            <List.Item
              title="Edit Shop Profile"
              description="Legal details, address, and config."
              left={(props) => <List.Icon {...props} icon="store-edit-outline" color="#1e40af" />}
              onPress={() => navigate("CreateEditShop", { shop: selectedShop })}
              titleStyle={{ fontWeight: "700", color: "#111827" }}
            />
            <List.Item
              title="Operator Management"
              description="Manage staff access levels."
              left={(props) => <List.Icon {...props} icon="account-group-outline" color="#1e40af" />}
              onPress={() => navigate("AssignStaff", { shop: selectedShop })}
              titleStyle={{ fontWeight: "700", color: "#111827" }}
            />
            <List.Item
              title="QR Management"
              description="Configure UPI ID for dynamic QR codes."
              left={(props) => <List.Icon {...props} icon="qrcode-scan" color="#1e40af" />}
              onPress={() => navigate("UpiConfig", { shop: selectedShop })}
              titleStyle={{ fontWeight: "700", color: "#111827" }}
            />
            <List.Item
              title="Inventory Initialization"
              description="Configure opening stock levels."
              left={(props) => <List.Icon {...props} icon="warehouse" color="#1e40af" />}
              onPress={() => navigate("SetOpeningStock", { shop: selectedShop })}
              titleStyle={{ fontWeight: "700", color: "#111827" }}
              disabled={selectedShop?.openingStockLocked}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsActionsOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

function ShopPortfolioCard({ shop, onManage, isOwner, token }: { shop: Shop, onManage: () => void, isOwner: boolean, token: string }) {
  const shopDashboardQuery = useQuery({
    queryKey: ["ownerDashboard", shop.id],
    queryFn: () => fetchOwnerDashboard(token, { shopId: shop.id }),
    enabled: !!token && isOwner,
  });

  const currentSessionQuery = useQuery({
    queryKey: ["currentCashSession", shop.id],
    queryFn: () => fetchCurrentCashSession(token, shop.id),
    enabled: !!token,
  });

  const todaySales = shopDashboardQuery.data?.todaySales ?? 0;
  const cashOnHand = currentSessionQuery.data ? currentSessionQuery.data.expectedCash : shop.openingCash;

  const staffList = (shop as any).staffAccesses?.map((access: any) => access.staff).filter(Boolean) || [];
  const staffAvatars = staffList.map((s: any) => {
    return s.name.split(/\s+/).map((w: any) => w[0]).join("").toUpperCase().slice(0, 2);
  }).slice(0, 4);

  return (
    <Card 
      style={{ backgroundColor: "white", borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 }}
    >
      <View className="p-5">
        <View className="flex-row justify-between items-start mb-6">
          <View className="flex-row gap-4 items-center">
            <View className="h-14 w-14 rounded-2xl bg-blue-600 items-center justify-center shadow-lg shadow-blue-200">
               <Text style={{ color: "white", fontSize: 24, fontWeight: "900" }}>{shop.name[0]}</Text>
            </View>
            <View>
              <View className="flex-row items-center gap-2">
                <Text variant="titleLarge" style={{ fontWeight: "800", color: "#111827" }}>{shop.name}</Text>
                <View className="h-2 w-2 rounded-full bg-emerald-500" />
              </View>
              <Text variant="bodySmall" style={{ color: "#6b7280", fontWeight: "600" }}>{shop.code} • {shop.city}</Text>
            </View>
          </View>
          <StatusPill 
            label={shop.openingStockLocked ? "LIVE" : "SETUP"} 
            tone={shop.openingStockLocked ? "green" : "amber"} 
          />
        </View>

        <View className="flex-row justify-between bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
           <View>
             <Text variant="labelSmall" style={{ color: "#9ca3af", fontWeight: "700" }}>TODAY'S SALES</Text>
             <Text variant="titleLarge" style={{ fontWeight: "800", color: "#111827" }}>₹{Number(todaySales).toLocaleString("en-IN")}</Text>
           </View>
           <View className="items-end">
             <Text variant="labelSmall" style={{ color: "#9ca3af", fontWeight: "700" }}>CASH ON HAND</Text>
             <Text variant="titleLarge" style={{ fontWeight: "800", color: "#111827" }}>₹{Number(cashOnHand).toLocaleString("en-IN")}</Text>
           </View>
        </View>

        <View className="flex-row justify-between items-center">
           <View className="flex-row">
             {staffAvatars.map((init: string, i: number) => (
               <Avatar
                 key={i}
                 rounded
                 title={init}
                 size={32}
                 containerStyle={{ 
                   backgroundColor: "#1e40af", 
                   borderWidth: 2, 
                   borderColor: "white",
                   marginLeft: i === 0 ? 0 : -10
                 }}
                 titleStyle={{ fontSize: 10, fontWeight: "800" }}
               />
             ))}
           </View>
           
           {isOwner && (
             <Button 
                mode="text" 
                onPress={onManage}
                textColor="#1e40af"
                labelStyle={{ fontWeight: "800", fontSize: 14 }}
                icon="arrow-right"
                contentStyle={{ flexDirection: 'row-reverse' }}
             >
                Manage
             </Button>
           )}
        </View>
      </View>
    </Card>
  );
}
