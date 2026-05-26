import { useEffect, useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, TextInput } from "react-native-paper";
import { createStockMovement, fetchItems, fetchShops } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { ShopPicker } from "../../components/ui/ShopPicker";

const movementTypes = [
  { label: "Stock in", value: "STOCK_IN", tone: "green" },
  { label: "Stock out", value: "STOCK_OUT", tone: "amber" },
  { label: "Damage", value: "DAMAGE_LOSS", tone: "red" },
  { label: "Adjust", value: "MANUAL_ADJUSTMENT", tone: "blue" },
] as const;

export function StockEntry() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const [shopId, setShopId] = useState<string | undefined>();
  const [itemId, setItemId] = useState<string | undefined>();
  const [movementType, setMovementType] = useState<(typeof movementTypes)[number]["value"]>("STOCK_IN");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

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
    if (!itemId && itemsQuery.data?.[0]) setItemId(itemsQuery.data[0].id);
  }, [itemId, itemsQuery.data]);

  const stockMutation = useMutation({
    mutationFn: () =>
      createStockMovement(token ?? "", {
        shopId: shopId ?? "",
        itemId: itemId ?? "",
        movementType,
        direction: movementType === "MANUAL_ADJUSTMENT" ? direction : undefined,
        quantity: Number(quantity),
        reason: reason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", shopId] });
      setQuantity("");
      setReason("");
    },
  });

  return (
    <Screen>
      <AppHeader title="Stock entry" subtitle="Record incoming stock, losses, and owner-approved adjustments." />
      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

      <Section title="Movement">
        <View className="gap-3 rounded-lg border border-[#d9dfd2] bg-white p-4">
          <View className="flex-row flex-wrap gap-2">
            {movementTypes.map((type) => (
              <Button
                key={type.value}
                mode={movementType === type.value ? "contained" : "outlined"}
                compact
                onPress={() => setMovementType(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </View>
          {movementType === "MANUAL_ADJUSTMENT" ? (
            <View className="flex-row gap-2">
              <Button mode={direction === "IN" ? "contained" : "outlined"} onPress={() => setDirection("IN")} style={{ flex: 1 }}>
                Add
              </Button>
              <Button mode={direction === "OUT" ? "contained" : "outlined"} onPress={() => setDirection("OUT")} style={{ flex: 1 }}>
                Remove
              </Button>
            </View>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {(itemsQuery.data ?? []).slice(0, 10).map((item) => (
              <Button key={item.id} mode={itemId === item.id ? "contained" : "outlined"} compact onPress={() => setItemId(item.id)}>
                {item.name}
              </Button>
            ))}
          </View>
          {!itemsQuery.data?.length ? (
            <Text variant="bodySmall" style={{ color: "#667064" }}>
              Add items before recording stock.
            </Text>
          ) : null}
          <TextInput mode="outlined" label="Quantity" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
          <TextInput mode="outlined" label="Reason" value={reason} onChangeText={setReason} />
          {stockMutation.error ? (
            <Text variant="bodySmall" style={{ color: "#b42318" }}>
              {(stockMutation.error as Error).message}
            </Text>
          ) : null}
          <Button
            mode="contained"
            icon="warehouse"
            disabled={!shopId || !itemId || Number(quantity) <= 0}
            loading={stockMutation.isPending}
            contentStyle={{ height: 52 }}
            onPress={() => stockMutation.mutate()}
          >
            Save movement
          </Button>
        </View>
      </Section>
    </Screen>
  );
}
