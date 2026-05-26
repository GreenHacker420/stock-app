import { useQuery } from "@tanstack/react-query";
import { ScrollView, View, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Text, Icon, Button } from "react-native-paper";
import { fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function Home() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  const navigation = useNavigation();
  const navigate = (screen: string) => {
    (navigation as any).navigate(screen);
  };

  const shopCount = shopsQuery.data?.length ?? 0;
  const initials = user?.name
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Screen>
      <AppHeader
        title={user?.role === "OWNER" ? "Owner Dashboard" : "Nagpur Shop Hub"}
        subtitle={user?.role === "OWNER" ? "Live operations overview" : "Ready for today's tasks"}
        role={user?.role}
        initials={initials}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {user?.role === "OWNER" ? (
          <OwnerHome shopCount={shopCount} navigate={navigate} />
        ) : (
          <StaffHome navigate={navigate} />
        )}

        <Section title="System status">
          <View className="flex-row flex-wrap gap-2">
            <StatusPill label="API connected" tone="green" />
            <StatusPill label="Design system applied" tone="blue" />
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function OwnerHome({ shopCount, navigate }: { shopCount: number; navigate: (s: string) => void }) {
  return (
    <View className="gap-6">
      <View className="gap-3">
        <View className="flex-row gap-3">
          <MetricCard label="Today Sales" value="₹45,000" icon="trending-up" tone="blue" />
          <MetricCard label="Cash Collected" value="₹12,000" icon="cash-multiple" tone="green" />
        </View>
        <View className="flex-row gap-3">
          <MetricCard label="Pending Payments" value="₹8,500" icon="clock-outline" tone="amber" />
          <MetricCard label="Orders to Pack" value="12" icon="package-variant" tone="blue" />
        </View>
      </View>

      <Section title="Quick actions">
        <View className="gap-3">
          <ActionTile
            title="Verify Payments"
            subtitle="Review 12 pending UPI and cheque entries."
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
            onPress={() => navigate("Settings")}
          />
        </View>
      </Section>
    </View>
  );
}

function StaffHome({ navigate }: { navigate: (s: string) => void }) {
  return (
    <View className="gap-6">
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

      <View className="gap-3">
        <View className="flex-row gap-3">
          <Pressable onPress={() => navigate("OrdersToPack")} className="flex-1">
            <View className="bg-white p-4 rounded-lg border border-[#e5e7eb] items-center gap-2">
              <View className="h-12 w-12 bg-blue-50 rounded-full items-center justify-center">
                <Icon source="package-variant" size={24} color="#1e40af" />
              </View>
              <Text variant="titleSmall" style={{ fontWeight: "700" }}>Orders</Text>
              <View className="bg-red-100 px-2 py-0.5 rounded-full">
                <Text style={{ fontSize: 10, color: "#b91c1c", fontWeight: "700" }}>5 pending</Text>
              </View>
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
          <Pressable onPress={() => {}} className="flex-1">
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
        <Button
          mode="outlined"
          onPress={() => navigate("CloseDay")}
          style={{ borderRadius: 8, borderColor: "#ef4444" }}
          textColor="#ef4444"
        >
          Close Day
        </Button>
      </View>
    </View>
  );
}
