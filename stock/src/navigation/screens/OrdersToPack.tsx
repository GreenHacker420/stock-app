import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { ListItem } from "@rneui/themed";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text } from "react-native-paper";
import { fetchOrders, fetchShops, markOrderItemPacked, type Order } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { StatusPill } from "../../components/ui/StatusPill";

function remainingQuantity(order: Order) {
  return order.items.reduce((total, orderItem) => {
    return total + Math.max(0, Number(orderItem.quantityOrdered) - Number(orderItem.quantityPacked));
  }, 0);
}

export function OrdersToPack() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const [shopId, setShopId] = useState<string | undefined>();

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const ordersQuery = useQuery({
    queryKey: ["orders", shopId],
    queryFn: () => fetchOrders(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const packableOrders = useMemo(() => {
    return (ordersQuery.data ?? []).filter((order) => remainingQuantity(order) > 0);
  }, [ordersQuery.data]);

  const packMutation = useMutation({
    mutationFn: (order: Order) => {
      const nextItem = order.items.find((item) => Number(item.quantityOrdered) > Number(item.quantityPacked));
      if (!nextItem) throw new Error("No pending item found");
      return markOrderItemPacked(token ?? "", order.id, {
        orderItemId: nextItem.id,
        quantityPacked: Number(nextItem.quantityOrdered) - Number(nextItem.quantityPacked),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders", shopId] }),
  });

  return (
    <Screen>
      <AppHeader title="Orders to pack" subtitle="Pick the next order and mark packed quantities." />
      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />
      <Section title="Queue">
        <View className="overflow-hidden rounded-lg border border-[#d9dfd2] bg-white">
          {packableOrders.length ? (
            packableOrders.map((order, index) => {
              const pending = remainingQuantity(order);
              const firstItem = order.items.find((item) => Number(item.quantityOrdered) > Number(item.quantityPacked));
              return (
                <ListItem key={order.id} bottomDivider={index !== packableOrders.length - 1} containerStyle={{ paddingHorizontal: 14 }}>
                  <ListItem.Content>
                    <View className="mb-2 flex-row items-center justify-between">
                      <ListItem.Title style={{ color: "#17211b", fontWeight: "800" }}>
                        #{order.orderNumber}
                      </ListItem.Title>
                      <StatusPill label={order.status} tone="blue" />
                    </View>
                    <ListItem.Subtitle style={{ color: "#667064" }}>
                      {order.customer?.name ?? "Customer"} • Pending {pending.toFixed(3)}
                    </ListItem.Subtitle>
                    <Text variant="bodySmall" style={{ color: "#4d584f", marginTop: 6 }}>
                      Next: {firstItem?.item.name ?? "No pending item"}
                    </Text>
                  </ListItem.Content>
                  <Button
                    mode="contained-tonal"
                    compact
                    loading={packMutation.isPending}
                    onPress={() => packMutation.mutate(order)}
                  >
                    Pack
                  </Button>
                </ListItem>
              );
            })
          ) : (
            <View className="p-4">
              <Text variant="titleSmall" style={{ color: "#17211b", fontWeight: "800" }}>
                No packing work
              </Text>
              <Text variant="bodySmall" style={{ color: "#667064", marginTop: 4 }}>
                Confirmed orders with pending quantities will appear here.
              </Text>
            </View>
          )}
        </View>
        {packMutation.error ? (
          <Text variant="bodySmall" style={{ color: "#b42318", marginTop: 8 }}>
            {(packMutation.error as Error).message}
          </Text>
        ) : null}
      </Section>
    </Screen>
  );
}
