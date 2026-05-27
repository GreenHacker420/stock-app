import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, SegmentedButtons, Icon, Checkbox, Divider } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { fetchOrders, fetchShops, markOrderItemPacked, type Order } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";

function remainingQuantity(order: Order) {
  return order.items.reduce((total, orderItem) => {
    return total + Math.max(0, Number(orderItem.quantityOrdered) - Number(orderItem.quantityPacked));
  }, 0);
}

export function OrdersToPack() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const ordersQuery = useQuery({
    queryKey: ["orders", activeShopId],
    queryFn: () => fetchOrders(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] }),
  });

  return (
    <Screen>
      <AppHeader title="Orders to Pack" subtitle="Manage fulfillment queue" />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
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
  const navigation = useNavigation();
  const pendingCount = order.items.filter(i => Number(i.quantityOrdered) > Number(i.quantityPacked)).length;
  const balance = Number(order.totalAmount) - Number(order.paidAmount);

  return (
    <View className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
      <Pressable onPress={onToggle} className="p-4 flex-row justify-between items-center">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text style={{ fontWeight: "800", color: "#111827" }}>#{order.orderNumber}</Text>
            {pendingCount > 0 ? (
              <View className="bg-blue-50 px-2 py-0.5 rounded-full">
                <Text style={{ fontSize: 10, color: "#1e40af", fontWeight: "700" }}>{pendingCount} left</Text>
              </View>
            ) : (
              <View className="bg-green-50 px-2 py-0.5 rounded-full">
                <Text style={{ fontSize: 10, color: "#059669", fontWeight: "700" }}>Packed</Text>
              </View>
            )}
          </View>
          <Text variant="bodyMedium" style={{ color: "#4b5563" }}>{order.customer?.name ?? "Regular Customer"}</Text>
        </View>
        <View className="items-end gap-1 mr-2">
           <Text style={{ fontWeight: "800", color: "#111827", fontSize: 13 }}>₹{order.totalAmount}</Text>
           {balance > 0 && <Text style={{ fontSize: 10, color: "#ef4444", fontWeight: "700" }}>₹{balance} due</Text>}
        </View>
        <Icon source={isExpanded ? "chevron-up" : "chevron-down"} size={24} color="#9ca3af" />
      </Pressable>

      {isExpanded && (
        <View className="border-t border-gray-100 p-4">
          <View className="mb-6">
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
          
          <View className="flex-row gap-3">
             <Button 
                mode="outlined" 
                onPress={() => (navigation as any).navigate("TakePayment", { customerId: order.customer?.id, orderId: order.id, amount: balance })}
                style={{ flex: 1, borderRadius: 8, borderColor: '#e5e7eb' }}
                textColor="#1e40af"
                icon="cash-plus"
             >
                Collect
             </Button>
             <Button 
                mode="contained" 
                onPress={onToggle}
                style={{ flex: 2, borderRadius: 8 }}
             >
                {pendingCount === 0 ? "Done" : "Mark as Packed"}
             </Button>
          </View>
        </View>
      )}
    </View>
  );
}
