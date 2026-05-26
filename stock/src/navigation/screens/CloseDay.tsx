import { useEffect, useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, TextInput } from "react-native-paper";
import { closeCashSession, fetchCurrentCashSession, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { Section } from "../../components/ui/Section";
import { ShopPicker } from "../../components/ui/ShopPicker";

export function CloseDay() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const [shopId, setShopId] = useState<string | undefined>();
  const [actualCash, setActualCash] = useState("");
  const [cashHandover, setCashHandover] = useState("0");
  const [differenceReason, setDifferenceReason] = useState("");

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const currentQuery = useQuery({
    queryKey: ["cash-session", shopId],
    queryFn: () => fetchCurrentCashSession(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      closeCashSession(token ?? "", currentQuery.data?.id ?? "", {
        actualCash: Number(actualCash),
        cashHandover: Number(cashHandover || 0),
        differenceReason: differenceReason || undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cash-session", shopId] }),
  });

  return (
    <Screen>
      <AppHeader title="Close day" subtitle="Reconcile expected cash with actual counter cash." />
      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />
      <View className="flex-row gap-3">
        <MetricCard label="Expected cash" value={`₹${currentQuery.data?.expectedCash ?? "0"}`} icon="calculator" />
        <MetricCard label="Status" value={currentQuery.data?.status ?? "NONE"} icon="cash-check" tone="amber" />
      </View>
      <Section title="Closing details">
        <View className="gap-3 rounded-lg border border-[#d9dfd2] bg-white p-4">
          <TextInput mode="outlined" label="Actual cash" keyboardType="numeric" value={actualCash} onChangeText={setActualCash} />
          <TextInput mode="outlined" label="Cash handover" keyboardType="numeric" value={cashHandover} onChangeText={setCashHandover} />
          <TextInput mode="outlined" label="Difference reason" value={differenceReason} onChangeText={setDifferenceReason} />
          <Button
            mode="contained"
            icon="cash-check"
            disabled={!currentQuery.data || !actualCash}
            loading={closeMutation.isPending}
            contentStyle={{ height: 50 }}
            onPress={() => closeMutation.mutate()}
          >
            Close session
          </Button>
        </View>
      </Section>
    </Screen>
  );
}
