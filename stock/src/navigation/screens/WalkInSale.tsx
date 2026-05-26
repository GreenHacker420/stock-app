import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, TextInput } from "react-native-paper";
import { createWalkInSale, fetchItems, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { ShopPicker } from "../../components/ui/ShopPicker";

const paymentModes = [
  { label: "Cash", value: "CASH" },
  { label: "UPI", value: "UPI" },
  { label: "Card", value: "CARD" },
  { label: "Bank", value: "BANK_TRANSFER" },
] as const;

export function WalkInSale() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const [shopId, setShopId] = useState<string | undefined>();
  const [itemId, setItemId] = useState<string | undefined>();
  const [quantity, setQuantity] = useState("1");
  const [rate, setRate] = useState("");
  const [paymentMode, setPaymentMode] = useState<(typeof paymentModes)[number]["value"]>("CASH");

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const itemsQuery = useQuery({
    queryKey: ["items", shopId],
    queryFn: () => fetchItems(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  useEffect(() => {
    const firstItem = itemsQuery.data?.[0];
    if (!itemId && firstItem) {
      setItemId(firstItem.id);
      setRate(firstItem.defaultSellingPrice);
    }
  }, [itemId, itemsQuery.data]);

  const selectedItem = itemsQuery.data?.find((item) => item.id === itemId);
  const total = useMemo(() => Number(quantity || 0) * Number(rate || 0), [quantity, rate]);

  const saleMutation = useMutation({
    mutationFn: () =>
      createWalkInSale(token ?? "", {
        shopId: shopId ?? "",
        itemId: itemId ?? "",
        quantity: Number(quantity),
        rate: Number(rate),
        paymentMode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", shopId] });
      setQuantity("1");
    },
  });

  return (
    <Screen>
      <AppHeader title="Walk-in sale" subtitle="Create a quick counter bill and collect payment." />
      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

      <Section title="Item">
        <View className="gap-3 rounded-lg border border-[#d9dfd2] bg-white p-4">
          <View className="flex-row flex-wrap gap-2">
            {(itemsQuery.data ?? []).slice(0, 8).map((item) => (
              <Button
                key={item.id}
                mode={itemId === item.id ? "contained" : "outlined"}
                compact
                onPress={() => {
                  setItemId(item.id);
                  setRate(item.defaultSellingPrice);
                }}
              >
                {item.name}
              </Button>
            ))}
          </View>
          {!itemsQuery.data?.length ? (
            <Text variant="bodySmall" style={{ color: "#667064" }}>
              Add items before creating a sale.
            </Text>
          ) : null}
          <TextInput mode="outlined" label="Selected item" value={selectedItem?.name ?? ""} editable={false} />
          <View className="flex-row gap-3">
            <TextInput
              mode="outlined"
              label="Qty"
              keyboardType="numeric"
              value={quantity}
              onChangeText={setQuantity}
              style={{ flex: 1 }}
            />
            <TextInput
              mode="outlined"
              label="Rate"
              keyboardType="numeric"
              value={rate}
              onChangeText={setRate}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </Section>

      <Section title="Payment">
        <View className="gap-3 rounded-lg border border-[#d9dfd2] bg-white p-4">
          <View className="flex-row flex-wrap gap-2">
            {paymentModes.map((mode) => (
              <Button
                key={mode.value}
                mode={paymentMode === mode.value ? "contained" : "outlined"}
                compact
                onPress={() => setPaymentMode(mode.value)}
              >
                {mode.label}
              </Button>
            ))}
          </View>
          <View className="flex-row items-center justify-between rounded-lg bg-[#eef2ea] px-4 py-3">
            <Text variant="titleSmall" style={{ color: "#4d584f" }}>
              Bill total
            </Text>
            <Text variant="titleLarge" style={{ color: "#17211b", fontWeight: "900" }}>
              ₹{Number.isFinite(total) ? total.toFixed(2) : "0.00"}
            </Text>
          </View>
          {saleMutation.error ? (
            <Text variant="bodySmall" style={{ color: "#b42318" }}>
              {(saleMutation.error as Error).message}
            </Text>
          ) : null}
          <Button
            mode="contained"
            icon="cart-check"
            disabled={!shopId || !itemId || Number(quantity) <= 0 || Number(rate) < 0}
            loading={saleMutation.isPending}
            contentStyle={{ height: 52 }}
            onPress={() => saleMutation.mutate()}
          >
            Save sale
          </Button>
        </View>
      </Section>
    </Screen>
  );
}
