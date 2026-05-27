import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, SegmentedButtons, Icon, Checkbox, Divider, Portal, Modal, TextInput } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { fetchOrders, fetchShops, markOrderItemPacked, createDmFromOrder, convertOrderToSale, reportOrderShortage, type Order } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { SuccessModal } from "../../components/ui/SuccessModal";

function remainingQuantity(order: Order) {
  return order.items.reduce((total, orderItem) => {
    return total + Math.max(0, Number(orderItem.quantityOrdered) - Number(orderItem.quantityPacked));
  }, 0);
}

export function OrdersToPack() {
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();
  const navigation = useNavigation();

  const [tab, setTab] = useState("pending");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Disbursement states
  const [disburseOrder, setDisburseOrder] = useState<Order | null>(null);
  const [disburseType, setDisburseType] = useState<"DM" | "SALE">("DM");
  const [expectedOffsetDays, setExpectedOffsetDays] = useState<number>(3); // 3 days
  const [payments, setPayments] = useState<Array<{ mode: string, amount: string }>>([{ mode: "CASH", amount: "" }]);
  const [disburseNotes, setDisburseNotes] = useState("");
  const [disburseError, setDisburseError] = useState<string | null>(null);

  // Success Modal states
  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Shortage modal states
  const [shortageItem, setShortageItem] = useState<{ orderId: string, itemId: string, name: string, quantityOrdered: number, quantityPacked: number } | null>(null);
  const [shortageAvailable, setShortageAvailable] = useState("");
  const [shortageReason, setShortageReason] = useState("Inventory Out of Stock");

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const ordersQuery = useQuery({
    queryKey: ["orders", activeShopId],
    queryFn: () => fetchOrders(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const filteredOrders = useMemo(() => {
    const all = ordersQuery.data ?? [];
    if (tab === "pending") return all.filter(o => remainingQuantity(o) > 0 && o.status !== "CANCELLED" && o.status !== "DISPATCHED" && o.status !== "DM_CREATED" && o.status !== "CONVERTED_TO_SALE");
    if (tab === "packed") return all.filter(o => remainingQuantity(o) === 0 && o.status !== "DISPATCHED" && o.status !== "DM_CREATED" && o.status !== "CONVERTED_TO_SALE" && o.status !== "CANCELLED");
    return all.filter(o => o.status === "DISPATCHED" || o.status === "DM_CREATED" || o.status === "CONVERTED_TO_SALE");
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

  const shortageMutation = useMutation({
    mutationFn: (data: { orderId: string, orderItemId: string, availableQuantity: number, reason: string }) => {
      return reportOrderShortage(token ?? "", data.orderId, {
        orderItemId: data.orderItemId,
        availableQuantity: data.availableQuantity,
        reason: data.reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      setShortageItem(null);
      setSuccessTitle("Shortage Reported");
      setSuccessMessage("Shortage logged. Staff will proceed with packing available items.");
      setSuccessVisible(true);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to report shortage");
    }
  });

  const disburseMutation = useMutation({
    mutationFn: (payload: { type: "DM" | "SALE", orderId: string, data: any }) => {
      if (payload.type === "DM") {
        return createDmFromOrder(token ?? "", payload.orderId, payload.data);
      } else {
        return convertOrderToSale(token ?? "", payload.orderId, payload.data);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["orders", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["item-stock"] });
      setDisburseOrder(null);
      setPayments([{ mode: "CASH", amount: "" }]);
      setDisburseNotes("");
      setSuccessTitle(variables.type === "DM" ? "Disbursed via Memo" : "Converted to Sale");
      setSuccessMessage(variables.type === "DM" ? "Order dispatched with delivery memo." : "Order successfully converted to invoice sale.");
      setSuccessVisible(true);
    },
    onError: (err: any) => {
      setDisburseError(err.message || "Failed to disburse order");
    }
  });

  const handleOpenDisburse = (order: Order) => {
    setDisburseOrder(order);
    setDisburseType("DM");
    setDisburseError(null);
    setPayments([{ mode: "CASH", amount: String(order.totalAmount) }]);
  };

  const handleConfirmDisburse = () => {
    if (!disburseOrder) return;
    setDisburseError(null);

    const dispatchDate = new Date(Date.now() + expectedOffsetDays * 86400000);

    if (disburseType === "DM") {
      disburseMutation.mutate({
        type: "DM",
        orderId: disburseOrder.id,
        data: {
          expectedPaymentDate: dispatchDate.toISOString(),
          reason: disburseNotes || undefined,
        }
      });
    } else {
      const activePayments = payments
        .filter(p => Number(p.amount) > 0)
        .map(p => ({
          paymentMode: p.mode,
          amount: Number(p.amount),
        }));

      disburseMutation.mutate({
        type: "SALE",
        orderId: disburseOrder.id,
        data: {
          dueDate: dispatchDate.toISOString(),
          payments: activePayments,
        }
      });
    }
  };

  const handleConfirmShortage = () => {
    if (!shortageItem) return;
    const qty = Number(shortageAvailable);
    if (isNaN(qty) || qty < 0 || qty > shortageItem.quantityOrdered) {
      alert("Invalid quantity specified.");
      return;
    }
    shortageMutation.mutate({
      orderId: shortageItem.orderId,
      orderItemId: shortageItem.itemId,
      availableQuantity: qty,
      reason: shortageReason,
    });
  };

  return (
    <Screen>
      <AppHeader title="Fulfillment Queue" subtitle="Manage order packing and disbursement" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-4 mb-6">
          <SegmentedButtons
            value={tab}
            onValueChange={setTab}
            buttons={[
              { value: "pending", label: "Pending" },
              { value: "packed", label: "Packed" },
              { value: "dispatched", label: "Disbursed" },
            ]}
            style={{ borderRadius: 8 }}
            theme={{ colors: { primary: "#1e40af" } }}
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
                onShortage={(item) => setShortageItem({
                  orderId: order.id,
                  itemId: item.id,
                  name: item.item.name,
                  quantityOrdered: Number(item.quantityOrdered),
                  quantityPacked: Number(item.quantityPacked)
                })}
                onDisburse={() => handleOpenDisburse(order)}
                isPacking={packMutation.isPending}
              />
            ))
          ) : (
            <View className="bg-white p-8 rounded-[24px] border border-slate-100 items-center">
              <Icon source="package-variant" size={48} color="#94a3b8" />
              <Text variant="titleMedium" className="mt-4" style={{ fontWeight: "700", color: "#475569" }}>No orders found</Text>
              <Text style={{ color: "#64748b", textAlign: "center", marginTop: 4, fontSize: 13 }}>
                Orders in the "{tab}" state will appear here.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Disburse Modal */}
      <Portal>
        <Modal
          visible={!!disburseOrder}
          onDismiss={() => setDisburseOrder(null)}
          contentContainerStyle={{
            backgroundColor: 'white',
            margin: 20,
            borderRadius: 24,
            padding: 24,
            maxHeight: '85%'
          }}
        >
          {disburseOrder && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text variant="titleLarge" style={{ fontWeight: "900", color: "#0f172a" }}>Disburse Order #{disburseOrder.orderNumber}</Text>
              <Text variant="bodySmall" style={{ color: "#64748b", marginTop: 2 }}>{disburseOrder.customer?.name}</Text>
              <Divider style={{ marginVertical: 16, backgroundColor: "#f1f5f9" }} />

              <Text variant="labelSmall" style={{ color: "#64748b", fontWeight: "700", marginBottom: 6 }}>DISBURSEMENT MODE</Text>
              <SegmentedButtons
                value={disburseType}
                onValueChange={v => setDisburseType(v as any)}
                buttons={[
                  { value: "DM", label: "Credit Memo", icon: "file-document-outline" },
                  { value: "SALE", label: "Invoice Sale", icon: "receipt" },
                ]}
                theme={{ colors: { primary: "#1e40af" } }}
              />

              <View className="mt-5 gap-4">
                {disburseType === "DM" ? (
                  <>
                    <View>
                      <Text variant="labelSmall" style={{ color: "#64748b", fontWeight: "700", marginBottom: 6 }}>EXPECTED PAYMENT DUE</Text>
                      <SegmentedButtons
                        value={String(expectedOffsetDays)}
                        onValueChange={v => setExpectedOffsetDays(Number(v))}
                        buttons={[
                          { value: "3", label: "3 Days" },
                          { value: "7", label: "1 Week" },
                          { value: "15", label: "15 Days" },
                        ]}
                        theme={{ colors: { primary: "#1e40af" } }}
                      />
                    </View>
                    <TextInput
                      mode="outlined"
                      label="Delivery Memo Notes (Optional)"
                      value={disburseNotes}
                      onChangeText={setDisburseNotes}
                      multiline
                      style={{ backgroundColor: "white" }}
                      outlineStyle={{ borderRadius: 12 }}
                    />
                  </>
                ) : (
                  <>
                    <View className="gap-3">
                      <Text variant="labelSmall" style={{ color: "#64748b", fontWeight: "700" }}>PAYMENTS COLLECTED</Text>
                      {payments.map((p, idx) => (
                        <View key={idx} className="flex-row gap-2 items-center">
                          <TextInput
                            mode="outlined"
                            label={`${p.mode} Amount`}
                            value={p.amount}
                            keyboardType="numeric"
                            onChangeText={val => setPayments(payments.map((pay, i) => i === idx ? { ...pay, amount: val } : pay))}
                            style={{ flex: 1, backgroundColor: "white" }}
                            outlineStyle={{ borderRadius: 12 }}
                          />
                          <Button mode="outlined" compact onPress={() => {
                            const modes = ["CASH", "UPI", "CARD", "BANK_TRANSFER"];
                            const next = modes[(modes.indexOf(p.mode) + 1) % modes.length];
                            setPayments(payments.map((pay, i) => i === idx ? { ...pay, mode: next } : pay));
                          }}>Mode</Button>
                        </View>
                      ))}
                      <Button mode="text" compact icon="plus" onPress={() => setPayments([...payments, { mode: "UPI", amount: "" }])}>
                        Split Payment
                      </Button>
                    </View>
                    <View>
                      <Text variant="labelSmall" style={{ color: "#64748b", fontWeight: "700", marginBottom: 6 }}>BALANCE DUE DATE</Text>
                      <SegmentedButtons
                        value={String(expectedOffsetDays)}
                        onValueChange={v => setExpectedOffsetDays(Number(v))}
                        buttons={[
                          { value: "3", label: "3 Days" },
                          { value: "7", label: "1 Week" },
                          { value: "15", label: "15 Days" },
                        ]}
                        theme={{ colors: { primary: "#1e40af" } }}
                      />
                    </View>
                  </>
                )}
              </View>

              {disburseError && (
                <View className="bg-red-50 p-3 rounded-lg flex-row gap-2 mt-4 items-center">
                  <Icon source="alert-circle" size={16} color="#ef4444" />
                  <Text style={{ color: "#b91c1c", fontSize: 11, fontWeight: "600", flex: 1 }}>{disburseError}</Text>
                </View>
              )}

              <View className="flex-row gap-3 mt-6">
                <Button mode="outlined" style={{ flex: 1, borderRadius: 12 }} onPress={() => setDisburseOrder(null)}>Cancel</Button>
                <Button
                  mode="contained"
                  style={{ flex: 1.5, borderRadius: 12, backgroundColor: "#1e40af" }}
                  loading={disburseMutation.isPending}
                  onPress={handleConfirmDisburse}
                >
                  Disburse
                </Button>
              </View>
            </ScrollView>
          )}
        </Modal>

        {/* Shortage Modal */}
        <Modal
          visible={!!shortageItem}
          onDismiss={() => setShortageItem(null)}
          contentContainerStyle={{
            backgroundColor: 'white',
            margin: 20,
            borderRadius: 24,
            padding: 24,
          }}
        >
          {shortageItem && (
            <View className="gap-4">
              <Text variant="titleMedium" style={{ fontWeight: "900", color: "#0f172a" }}>Report Shortage</Text>
              <Text style={{ color: "#64748b", fontSize: 13 }}>{shortageItem.name}</Text>
              <Text style={{ fontSize: 12 }}>Ordered: {shortageItem.quantityOrdered} | Packed: {shortageItem.quantityPacked}</Text>
              <TextInput
                mode="outlined"
                label="Available Quantity"
                value={shortageAvailable}
                keyboardType="numeric"
                onChangeText={setShortageAvailable}
                placeholder="Enter stock physically present"
                style={{ backgroundColor: "white" }}
                outlineStyle={{ borderRadius: 12 }}
              />
              <TextInput
                mode="outlined"
                label="Reason / Notes"
                value={shortageReason}
                onChangeText={setShortageReason}
                style={{ backgroundColor: "white" }}
                outlineStyle={{ borderRadius: 12 }}
              />
              <View className="flex-row gap-3 mt-2">
                <Button mode="outlined" style={{ flex: 1, borderRadius: 12 }} onPress={() => setShortageItem(null)}>Cancel</Button>
                <Button
                  mode="contained"
                  style={{ flex: 1, borderRadius: 12, backgroundColor: "#ef4444" }}
                  loading={shortageMutation.isPending}
                  onPress={handleConfirmShortage}
                >
                  Submit
                </Button>
              </View>
            </View>
          )}
        </Modal>
      </Portal>

      <SuccessModal
        visible={successVisible}
        title={successTitle}
        message={successMessage}
        onClose={() => setSuccessVisible(false)}
      />
    </Screen>
  );
}

function OrderCard({ order, isExpanded, onToggle, onPack, onShortage, onDisburse, isPacking }: {
  order: Order;
  isExpanded: boolean;
  onToggle: () => void;
  onPack: (itemId: string, qty: number) => void;
  onShortage: (item: any) => void;
  onDisburse: () => void;
  isPacking: boolean;
}) {
  const navigation = useNavigation();
  const pendingCount = order.items.filter(i => Number(i.quantityOrdered) > Number(i.quantityPacked)).length;
  const balance = Number(order.totalAmount) - Number(order.paidAmount);
  const isFulfilled = remainingQuantity(order) === 0;

  return (
    <View className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      <Pressable onPress={onToggle} className="p-4 flex-row justify-between items-center">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text style={{ fontWeight: "900", color: "#0f172a" }}>#{order.orderNumber}</Text>
            {pendingCount > 0 ? (
              <View className="bg-blue-50 px-2 py-0.5 rounded-full">
                <Text style={{ fontSize: 10, color: "#1e40af", fontWeight: "700" }}>{pendingCount} left</Text>
              </View>
            ) : (
              <View className="bg-emerald-50 px-2 py-0.5 rounded-full">
                <Text style={{ fontSize: 10, color: "#059669", fontWeight: "700" }}>Packed</Text>
              </View>
            )}
          </View>
          <Text variant="bodyMedium" style={{ color: "#475569", fontWeight: "600" }}>{order.customer?.name ?? "Regular Customer"}</Text>
        </View>
        <View className="items-end gap-1 mr-2">
           <Text style={{ fontWeight: "900", color: "#0f172a", fontSize: 14 }}>₹{Number(order.totalAmount).toLocaleString()}</Text>
           {balance > 0 && <Text style={{ fontSize: 10, color: "#ef4444", fontWeight: "700" }}>₹{balance.toLocaleString()} due</Text>}
        </View>
        <Icon source={isExpanded ? "chevron-up" : "chevron-down"} size={24} color="#94a3b8" />
      </Pressable>

      {isExpanded && (
        <View className="border-t border-slate-50 p-4">
          <View className="mb-4">
            {order.items.map((item, idx) => {
              const isPacked = Number(item.quantityPacked) >= Number(item.quantityOrdered);
              return (
                <View key={item.id}>
                  {idx > 0 && <Divider style={{ backgroundColor: "#f8fafc", marginVertical: 4 }} />}
                  <View className="flex-row items-center py-2">
                    <Checkbox.Android
                      status={isPacked ? 'checked' : 'unchecked'}
                      onPress={() => {
                        if (!isPacked) onPack(item.id, Number(item.quantityOrdered) - Number(item.quantityPacked));
                      }}
                      disabled={isPacked || isPacking}
                      theme={{ colors: { primary: "#1e40af" } }}
                    />
                    <View className="flex-1 ml-2">
                      <Text style={{ fontWeight: "800", color: isPacked ? "#94a3b8" : "#0f172a" }}>
                        {item.item.name}
                      </Text>
                      <Text variant="bodySmall" style={{ color: "#64748b", marginTop: 2 }}>
                        {item.quantityPacked} / {item.quantityOrdered} {item.item.unit}
                      </Text>
                    </View>
                    {!isPacked && (
                      <Button mode="text" compact textColor="#ef4444" labelStyle={{ fontSize: 11, fontWeight: "700" }} onPress={() => onShortage(item)}>
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
                style={{ flex: 1, borderRadius: 12, borderColor: '#e2e8f0' }}
                textColor="#1e40af"
                contentStyle={{ height: 46 }}
                icon="cash-plus"
             >
                Collect
             </Button>
             
             {isFulfilled && (order.status !== "DISPATCHED" && order.status !== "DM_CREATED" && order.status !== "CONVERTED_TO_SALE") ? (
               <Button
                  mode="contained"
                  onPress={onDisburse}
                  style={{ flex: 1.5, borderRadius: 12, backgroundColor: "#10b981" }}
                  textColor="#ffffff"
                  contentStyle={{ height: 46 }}
                  icon="truck-delivery"
               >
                  Disburse
               </Button>
             ) : (
               <Button
                  mode="contained"
                  onPress={onToggle}
                  style={{ flex: 1.5, borderRadius: 12 }}
                  contentStyle={{ height: 46 }}
               >
                  Close Card
               </Button>
             )}
          </View>
        </View>
      )}
    </View>
  );
}
