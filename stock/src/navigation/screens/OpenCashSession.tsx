import { useEffect, useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text } from "react-native-paper";
import { fetchCurrentCashSession, fetchShops, openCashSession } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { Section } from "../../components/ui/Section";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { StatusPill } from "../../components/ui/StatusPill";

export function OpenCashSession() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const [shopId, setShopId] = useState<string | undefined>();

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const currentQuery = useQuery({
    queryKey: ["cash-session", shopId],
    queryFn: () => fetchCurrentCashSession(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const openMutation = useMutation({
    mutationFn: () => openCashSession(token ?? "", shopId ?? ""),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cash-session", shopId] }),
  });

  const selectedShop = shopsQuery.data?.find((shop) => shop.id === shopId);

  return (
    <Screen>
      <AppHeader title="Open cash session" subtitle="Start counter cash tracking for the selected shop." />
      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />
      <View className="flex-row gap-3">
        <MetricCard label="Opening cash" value={`₹${selectedShop?.openingCash ?? "0"}`} icon="cash" tone="amber" />
        <MetricCard
          label="Session"
          value={currentQuery.data?.status ?? "NONE"}
          icon="cash-register"
          tone={currentQuery.data ? "green" : "blue"}
        />
      </View>
      <Section title="Action">
        {currentQuery.data ? (
          <View className="rounded-lg border border-[#d9dfd2] bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text variant="titleMedium" style={{ fontWeight: "800", color: "#17211b" }}>
                Session already open
              </Text>
              <StatusPill label="OPEN" tone="green" />
            </View>
            <Text variant="bodySmall" style={{ color: "#667064", marginTop: 6 }}>
              Cash payments will be linked to this session automatically.
            </Text>
          </View>
        ) : (
          <Button
            mode="contained"
            icon="cash-register"
            disabled={!shopId}
            loading={openMutation.isPending}
            contentStyle={{ height: 52 }}
            onPress={() => openMutation.mutate()}
          >
            Open session
          </Button>
        )}
      </Section>
    </Screen>
  );
}
