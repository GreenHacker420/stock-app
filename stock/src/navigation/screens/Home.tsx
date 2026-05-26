import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Text } from "react-native-paper";
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
        title={user?.role === "OWNER" ? "Owner Dashboard" : "Staff Today"}
        subtitle={`${user?.name}, live shop controls are ready.`}
        role={user?.role}
        initials={initials}
      />

      <View className="flex-row gap-3">
        <MetricCard label="Shops" value={String(shopCount)} icon="storefront-outline" helper="Active access" />
        <MetricCard label="Cash" value="₹0" icon="cash-register" tone="amber" helper="Today" />
      </View>

      <View className="flex-row gap-3">
        <MetricCard label="Sales" value="0" icon="cart-outline" tone="blue" helper="Bills today" />
        <MetricCard label="Alerts" value="0" icon="bell-outline" tone="red" helper="Needs action" />
      </View>

      <Section title={user?.role === "OWNER" ? "Owner controls" : "Staff actions"}>
        {user?.role === "OWNER" ? (
          <View className="gap-3">
            <ActionTile
              title="Payment verification"
              subtitle="UPI, card, bank, and cheque entries pending owner check."
              icon="check-decagram-outline"
              tone="green"
            />
            <ActionTile
              title="Daily summary"
              subtitle="Review today, lock entries, and export reports."
              icon="file-chart-outline"
              tone="blue"
            />
            <ActionTile
              title="Cash closing review"
              subtitle="See counter mismatch and staff closing notes."
              icon="cash-check"
              tone="amber"
            />
          </View>
        ) : (
          <View className="gap-3">
            <ActionTile
              title="Walk-in sale"
              subtitle="Fast counter sale with full payment."
              icon="cart-plus"
              tone="green"
            />
            <ActionTile
              title="Orders to pack"
              subtitle="Pack assigned orders and report shortages."
              icon="package-variant"
              tone="blue"
            />
            <ActionTile
              title="Close day"
              subtitle="Enter actual cash and handover amount."
              icon="cash-check"
              tone="amber"
            />
          </View>
        )}
      </Section>

      <Section title="System status">
        <View className="flex-row flex-wrap gap-2">
          <StatusPill label="API connected" tone="green" />
          <StatusPill label="Seed owner" tone="blue" />
          <StatusPill label="Cash session pending" tone="amber" />
        </View>
        <Text variant="bodySmall" style={{ color: "#667064" }}>
          Metrics will populate as the owner and staff workflows are connected screen by screen.
        </Text>
      </Section>
    </Screen>
  );
}
