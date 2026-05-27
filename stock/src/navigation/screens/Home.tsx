import { useQuery } from "@tanstack/react-query";
import { ScrollView, View, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Text, Icon, Button } from "react-native-paper";
import { fetchShops, fetchCurrentCashSession, fetchOwnerDashboard } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function Home() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const { activeShopId, setActiveShopId } = useShopStore();

  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  const sessionQuery = useQuery({
    queryKey: ["cash-session", activeShopId],
    queryFn: () => fetchCurrentCashSession(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const navigation = useNavigation();
  const navigate = (screen: string) => {
    (navigation as any).navigate(screen);
  };

  const selectedShop = shopsQuery.data?.find(s => s.id === activeShopId);
  const shopCount = shopsQuery.data?.length ?? 0;
  const initials = user?.name
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Screen hasTab={true}>
      <AppHeader
        title={user?.role === "OWNER" ? "Owner Dashboard" : (selectedShop?.name ?? "Shop Hub")}
        subtitle={user?.role === "OWNER" ? "Live operations overview" : "Ready for today's tasks"}
        role={user?.role}
        initials={initials}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {!activeShopId ? (
          <Section title="Select Shop">
            <View className="gap-3">
              {shopsQuery.data?.map(shop => (
                <ActionTile
                  key={shop.id}
                  title={shop.name}
                  subtitle={`${shop.city} • Code: ${shop.code}`}
                  icon="storefront-outline"
                  tone="blue"
                  onPress={() => setActiveShopId(shop.id)}
                />
              ))}
            </View>
          </Section>
        ) : (
          <>
            <View className="mb-4 flex-row justify-between items-center bg-blue-50 px-4 py-2 rounded-lg">
              <Text style={{ fontWeight: "700", color: "#1e40af" }}>{selectedShop?.name}</Text>
              <Button compact mode="text" onPress={() => setActiveShopId(null)}>Change</Button>
            </View>

            {user?.role === "OWNER" ? (
              <OwnerHome shopCount={shopCount} navigate={navigate} />
            ) : (
              <StaffHome navigate={navigate} session={sessionQuery.data} />
            )}
          </>
        )}

        <Section title="System status">
          <View className="flex-row flex-wrap gap-2">
            <StatusPill label={token ? "API connected" : "Offline"} tone={token ? "green" : "red"} />
            <StatusPill label={activeShopId ? "Shop active" : "No shop picked"} tone={activeShopId ? "blue" : "amber"} />
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function OwnerHome({ shopCount, navigate }: { shopCount: number; navigate: (s: string) => void }) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const dashboardQuery = useQuery({
    queryKey: ["owner-dashboard", activeShopId],
    queryFn: () => fetchOwnerDashboard(token ?? "", { shopId: activeShopId ?? undefined }),
    enabled: !!token,
  });
  const dashboard = dashboardQuery.data as any;
  const money = (value: any) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

  return (
    <View className="gap-6">
      <View className="gap-3">
        <View className="flex-row gap-3">
          <MetricCard label="Today Sales" value={money(dashboard?.todaySales)} icon="trending-up" tone="blue" />
          <MetricCard label="Cash Collected" value={money(dashboard?.cashCollected)} icon="cash-multiple" tone="green" />
        </View>
        <View className="flex-row gap-3">
          <MetricCard label="Pending DM" value={money(dashboard?.pendingDmAmount)} icon="clock-outline" tone="amber" />
          <MetricCard label="Orders to Pack" value={String(dashboard?.ordersToPack ?? 0)} icon="package-variant" tone="blue" />
        </View>
      </View>

      <Section title="Quick actions">
        <View className="gap-3">
          <ActionTile title="Inventory Management" subtitle="Items, stock, price history, low stock." icon="warehouse" tone="green" onPress={() => navigate("ItemList")} />
          <ActionTile title="Sales Management" subtitle="All sales and detailed sale records." icon="receipt" tone="blue" onPress={() => navigate("SalesList")} />
          <ActionTile title="Customer Management" subtitle="Customers, outstanding, price history." icon="account-group-outline" tone="blue" onPress={() => navigate("CustomerList")} />
          <ActionTile title="Staff Management" subtitle="Add and update staff accounts." icon="account-tie-outline" tone="amber" onPress={() => navigate("StaffManagement")} />
          <ActionTile
            title="Take Payment"
            subtitle="Record a collection from a customer."
            icon="cash-register"
            tone="blue"
            onPress={() => navigate("TakePayment")}
          />
          <ActionTile
            title="Verify Payments"
            subtitle="Review pending UPI and cheque entries."
            icon="check-decagram-outline"
            tone="blue"
            onPress={() => navigate("PaymentVerification")}
          />
          <ActionTile
            title="Daily Summary"
            subtitle="Review, lock, and export today's operations."
            icon="file-chart-outline"
            tone="green"
            onPress={() => navigate("DailySummary")}
          />
          <ActionTile
            title="Manage Shops"
            subtitle={`${shopCount} active shops in your account.`}
            icon="storefront-outline"
            tone="amber"
            onPress={() => navigate("Updates")}
          />
        </View>
      </Section>
    </View>
  );
}

function StaffHome({ navigate, session }: { navigate: (s: string) => void; session?: any }) {
  const isOpen = session?.status === "OPEN";

  return (
    <View className="gap-6">
      {!isOpen ? (
        <Button
          mode="contained"
          onPress={() => navigate("OpenCashSession")}
          style={{ height: 64, justifyContent: "center", borderRadius: 8, backgroundColor: "#1e40af" }}
          contentStyle={{ height: 64 }}
          labelStyle={{ fontSize: 18, fontWeight: "700" }}
          icon="play-circle-outline"
        >
          Open Cash Session
        </Button>
      ) : (
        <Button
          mode="contained"
          onPress={() => navigate("WalkInSale")}
          style={{ height: 64, justifyContent: "center", borderRadius: 8 }}
          contentStyle={{ height: 64 }}
          labelStyle={{ fontSize: 18, fontWeight: "700" }}
          icon="cart-plus"
        >
          New Sale
        </Button>
      )}

      <View className="gap-3">
        <View className="flex-row gap-3">
          <Pressable onPress={() => navigate("OrdersToPack")} className="flex-1">
            <View className="bg-white p-4 rounded-lg border border-[#e5e7eb] items-center gap-2">
              <View className="h-12 w-12 bg-blue-50 rounded-full items-center justify-center">
                <Icon source="package-variant" size={24} color="#1e40af" />
              </View>
              <Text variant="titleSmall" style={{ fontWeight: "700" }}>Orders</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => {}} className="flex-1">
            <View className="bg-white p-4 rounded-lg border border-[#e5e7eb] items-center gap-2">
              <View className="h-12 w-12 bg-green-50 rounded-full items-center justify-center">
                <Icon source="file-document-outline" size={24} color="#065f46" />
              </View>
              <Text variant="titleSmall" style={{ fontWeight: "700" }}>Create DM</Text>
            </View>
          </Pressable>
        </View>

        <View className="flex-row gap-3">
          <Pressable onPress={() => navigate("TakePayment")} className="flex-1">
            <View className="bg-white p-4 rounded-lg border border-[#e5e7eb] items-center gap-2">
              <View className="h-12 w-12 bg-amber-50 rounded-full items-center justify-center">
                <Icon source="cash-register" size={24} color="#92400e" />
              </View>
              <Text variant="titleSmall" style={{ fontWeight: "700" }}>Payment</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => navigate("StockEntry")} className="flex-1">
            <View className="bg-white p-4 rounded-lg border border-[#e5e7eb] items-center gap-2">
              <View className="h-12 w-12 bg-slate-50 rounded-full items-center justify-center">
                <Icon source="inventory" size={24} color="#475569" />
              </View>
              <Text variant="titleSmall" style={{ fontWeight: "700" }}>Stock Entry</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 pt-6 border-t border-[#e5e7eb] gap-3">
        <Button
          mode="outlined"
          onPress={() => navigate("DailySummary")}
          style={{ borderRadius: 8, borderColor: "#e5e7eb" }}
          textColor="#111827"
        >
          Today's Summary
        </Button>
        {isOpen && (
          <Button
            mode="outlined"
            onPress={() => navigate("CloseDay")}
            style={{ borderRadius: 8, borderColor: "#ef4444" }}
            textColor="#ef4444"
          >
            Close Day
          </Button>
        )}
      </View>
    </View>
  );
}
