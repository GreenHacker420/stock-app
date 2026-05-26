import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, SegmentedButtons, Icon, Checkbox, Divider } from "react-native-paper";
import { fetchOrders, fetchShops, markOrderItemPacked, type Order } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
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
  const [tab, setTab] = useState("pending");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const ordersQuery = useQuery({
    queryKey: ["orders", shopId],
    queryFn: () => fetchOrders(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const filteredOrders = useMemo(() => {
    const all = ordersQuery.data ?? [];
    if (tab === "pending") return all.filter(o => remainingQuantity(o) > 0);
    if (tab === "packed") return all.filter(o => remainingQuantity(o) === 0 && o.status !== "DISPATCHED");
    return all.filter(o => o.status === "DISPATCHED");
  }, [ordersQuery.data, tab]);

  const packMutation = useMutation({
    mutationFn: (data: { orderId: string, orderItemId: string, quantity: number }) => {
      return markOrderItemPacked(token ?? "", data.orderId, {
        orderItemId: data.orderItemId,
        quantityPacked: data.quantity,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders", shopId] }),
  });

  return (
    <Screen>
      <AppHeader title="Orders to Pack" subtitle="Manage fulfillment queue" />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

        <View className="px-4 mb-6">
          <SegmentedButtons
            value={tab}
            onValueChange={setTab}
            buttons={[
              { value: "pending", label: "Pending" },
              { value: "packed", label: "Packed" },
              { value: "dispatched", label: "Dispatched" },
            ]}
            style={{ borderRadius: 8 }}
          />
        </View>

        <View className="gap-3 px-4">
          {filteredOrders.length ? (
            filteredOrders.map((order) => (
              <OrderCard 
                key={order.id} 
                order={order} 
                isExpanded={expandedOrderId === order.id}
                onToggle={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                onPack={(itemId, qty) => packMutation.mutate({ orderId: order.id, orderItemId: itemId, quantity: qty })}
                isPacking={packMutation.isPending}
              />
            ))
          ) : (
            <View className="bg-white p-8 rounded-lg border border-gray-100 items-center">
              <Icon source="package-variant" size={48} color="#9ca3af" />
              <Text variant="titleMedium" className="mt-4" style={{ fontWeight: "700" }}>No orders found</Text>
              <Text style={{ color: "#6b7280", textAlign: "center", marginTop: 4 }}>
                Orders in the "{tab}" state will appear here.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function OrderCard({ order, isExpanded, onToggle, onPack, isPacking }: { 
  order: Order; 
  isExpanded: boolean; 
  onToggle: () => void;
  onPack: (itemId: string, qty: number) => void;
  isPacking: boolean;
}) {
  const pendingCount = order.items.filter(i => Number(i.quantityOrdered) > Number(i.quantityPacked)).length;

  return (
    <View className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
      <Pressable onPress={onToggle} className="p-4 flex-row justify-between items-center">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text style={{ fontWeight: "800", color: "#111827" }}>#{order.orderNumber}</Text>
            {pendingCount > 0 && (
              <View className="bg-blue-50 px-2 py-0.5 rounded-full">
                <Text style={{ fontSize: 10, color: "#1e40af", fontWeight: "700" }}>{pendingCount} left</Text>
              </View>
            )}
          </View>
          <Text variant="bodyMedium" style={{ color: "#4b5563" }}>{order.customer?.name ?? "Regular Customer"}</Text>
        </View>
        <Icon source={isExpanded ? "chevron-up" : "chevron-down"} size={24} color="#9ca3af" />
      </Pressable>

      {isExpanded && (
        <View className="border-t border-gray-100 p-4 pt-0">
          <View className="mb-4">
            {order.items.map((item, idx) => {
              const isPacked = Number(item.quantityPacked) >= Number(item.quantityOrdered);
              return (
                <View key={item.id}>
                  {idx > 0 && <Divider className="my-2" />}
                  <View className="flex-row items-center py-2">
                    <Checkbox.Android 
                      status={isPacked ? 'checked' : 'unchecked'} 
                      onPress={() => {
                        if (!isPacked) onPack(item.id, Number(item.quantityOrdered) - Number(item.quantityPacked));
                      }}
                      disabled={isPacked || isPacking}
                    />
                    <View className="flex-1 ml-2">
                      <Text style={{ fontWeight: "700", color: isPacked ? "#9ca3af" : "#111827" }}>
                        {item.item.name}
                      </Text>
                      <Text variant="bodySmall" style={{ color: "#6b7280" }}>
                        {item.quantityPacked} / {item.quantityOrdered} {item.item.unit}
                      </Text>
                    </View>
                    {!isPacked && (
                      <Button mode="text" compact textColor="#ef4444" labelStyle={{ fontSize: 11 }}>
                        Shortage
                      </Button>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          
          <Button 
            mode="contained" 
            onPress={onToggle}
            style={{ borderRadius: 6 }}
          >
            {pendingCount === 0 ? "Done" : "Mark as Packed"}
          </Button>
        </View>
      )}
    </View>
  );
}
