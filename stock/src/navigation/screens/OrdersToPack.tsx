import React, { useEffect, useMemo, useState, memo } from "react";
import { 
  View, 
  StyleSheet, 
  Pressable, 
  ScrollView, 
  ActivityIndicator 
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Text, Icon, Checkbox, Divider, Portal, Modal, TextInput } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { 
  fetchOrders, 
  markOrderItemPacked, 
  createDmFromOrder, 
  convertOrderToSale, 
  reportOrderShortage, 
  type Order 
} from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SuccessModal } from "../../components/ui/SuccessModal";

function remainingQuantity(order: Order) {
  return order.items.reduce((total, orderItem) => {
    return total + Math.max(0, Number(orderItem.quantityOrdered) - Number(orderItem.quantityPacked));
  }, 0);
}

const OrderCard = memo(({ 
  order, 
  isExpanded, 
  onToggle, 
  onPack, 
  onShortage, 
  onDisburse, 
  isPacking 
}: {
  order: Order;
  isExpanded: boolean;
  onToggle: () => void;
  onPack: (itemId: string, qty: number) => void;
  onShortage: (item: any) => void;
  onDisburse: () => void;
  isPacking: boolean;
}) => {
  const navigation = useNavigation();
  const pendingCount = order.items.filter(i => Number(i.quantityOrdered) > Number(i.quantityPacked)).length;
  const balance = Number(order.totalAmount) - Number(order.paidAmount);
  const isFulfilled = remainingQuantity(order) === 0;

  return (
    <View style={styles.orderCard}>
      <Pressable 
        onPress={onToggle} 
        style={({ pressed }) => [
          styles.orderCardHeader,
          pressed && styles.pressed
        ]}
      >
        <View style={styles.orderMainInfo}>
          <View style={styles.orderNumberRow}>
            <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
            {pendingCount > 0 ? (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pendingCount} left</Text>
              </View>
            ) : (
              <View style={styles.packedBadge}>
                <Text style={styles.packedBadgeText}>Packed</Text>
              </View>
            )}
          </View>
          <Text style={styles.customerName}>{order.customer?.name ?? "Regular Customer"}</Text>
        </View>
        
        <View style={styles.orderPriceInfo}>
          <Text style={styles.orderTotal}>₹{Number(order.totalAmount).toLocaleString()}</Text>
          {balance > 0 && <Text style={styles.balanceDue}>₹{balance.toLocaleString()} due</Text>}
        </View>
        
        <Icon source={isExpanded ? "chevron-up" : "chevron-down"} size={24} color={colors.textMuted} />
      </Pressable>

      {isExpanded && (
        <View style={styles.orderExpanded}>
          <View style={styles.itemList}>
            {order.items.map((item, idx) => {
              const isPacked = Number(item.quantityPacked) >= Number(item.quantityOrdered);
              return (
                <View key={item.id} style={styles.itemRow}>
                  <Checkbox.Android
                    status={isPacked ? 'checked' : 'unchecked'}
                    onPress={() => {
                      if (!isPacked) onPack(item.id, Number(item.quantityOrdered) - Number(item.quantityPacked));
                    }}
                    disabled={isPacked || isPacking}
                    theme={{ colors: { primary: colors.primary } }}
                  />
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, isPacked && styles.itemPackedText]}>
                      {item.item.name}
                    </Text>
                    <Text style={styles.itemQty}>
                      {item.quantityPacked} / {item.quantityOrdered} {item.item.unit}
                    </Text>
                  </View>
                  {!isPacked && (
                    <Button 
                      variant="ghost" 
                      label="Shortage" 
                      size="sm"
                      onPress={() => onShortage(item)}
                      style={styles.shortageButton}
                    />
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.cardActions}>
             <Button
                variant="secondary"
                label="Collect"
                icon={<Icon source="cash-plus" size={18} color={colors.primary} />}
                onPress={() => (navigation as any).navigate("TakePayment", { customerId: order.customer?.id, orderId: order.id, amount: balance })}
                style={{ flex: 1 }}
             />
             
             {isFulfilled && (order.status !== "DISPATCHED" && order.status !== "DM_CREATED" && order.status !== "CONVERTED_TO_SALE") ? (
               <Button
                  variant="success"
                  label="Disburse"
                  icon={<Icon source="truck-delivery" size={18} color={colors.textInverse} />}
                  onPress={onDisburse}
                  style={{ flex: 1.5 }}
               />
             ) : (
               <Button
                  label="Close Card"
                  onPress={onToggle}
                  style={{ flex: 1.5 }}
               />
             )}
          </View>
        </View>
      )}
    </View>
  );
});

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
  const [payments, setPayments] = useState<Array<{ mode: string, amount: string }>>([{ mode: "CASH", amount: "" }]);
  
  // Success Modal states
  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Shortage modal states
  const [shortageItem, setShortageItem] = useState<any | null>(null);
  const [shortageAvailable, setShortageAvailable] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["orders", activeShopId],
    queryFn: () => fetchOrders(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const filteredOrders = useMemo(() => {
    const all = ordersQuery.data ?? [];
    if (tab === "pending") return all.filter(o => remainingQuantity(o) > 0 && !["CANCELLED", "DISPATCHED", "DM_CREATED", "CONVERTED_TO_SALE"].includes(o.status));
    if (tab === "packed") return all.filter(o => remainingQuantity(o) === 0 && !["DISPATCHED", "DM_CREATED", "CONVERTED_TO_SALE", "CANCELLED"].includes(o.status));
    return all.filter(o => ["DISPATCHED", "DM_CREATED", "CONVERTED_TO_SALE"].includes(o.status));
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
      setDisburseOrder(null);
      setSuccessTitle(variables.type === "DM" ? "Disbursed via Memo" : "Converted to Sale");
      setSuccessMessage(variables.type === "DM" ? "Order dispatched with delivery memo." : "Order successfully converted to invoice sale.");
      setSuccessVisible(true);
    },
  });

  const handleOpenDisburse = (order: Order) => {
    setDisburseOrder(order);
    setDisburseType("DM");
  };

  const handleConfirmDisburse = () => {
    if (!disburseOrder) return;
    const offset = 3;
    const dispatchDate = new Date(Date.now() + offset * 86400000);

    if (disburseType === "DM") {
      disburseMutation.mutate({
        type: "DM",
        orderId: disburseOrder.id,
        data: { expectedPaymentDate: dispatchDate.toISOString() }
      });
    } else {
      disburseMutation.mutate({
        type: "SALE",
        orderId: disburseOrder.id,
        data: { dueDate: dispatchDate.toISOString(), payments: payments.filter(p => Number(p.amount) > 0).map(p => ({ paymentMode: p.mode, amount: Number(p.amount) })) }
      });
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Fulfillment Queue" subtitle="Pack and dispatch orders" />

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {["pending", "packed", "dispatched"].map((t) => (
            <Pressable 
              key={t} 
              onPress={() => setTab(t)}
              style={[styles.tabButton, tab === t && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.listWrapper}>
        <FlashList
          data={filteredOrders}
          keyExtractor={(item: Order) => item.id}
          renderItem={({ item }: { item: Order }) => (
            <OrderCard
              order={item}
              isExpanded={expandedOrderId === item.id}
              onToggle={() => setExpandedOrderId(expandedOrderId === item.id ? null : item.id)}
              onPack={(itemId, qty) => packMutation.mutate({ orderId: item.id, orderItemId: itemId, quantity: qty })}
              onShortage={(orderItem) => setShortageItem({ ...orderItem, orderId: item.id })}
              onDisburse={() => handleOpenDisburse(item)}
              isPacking={packMutation.isPending}
            />
          )}
          ListEmptyComponent={
            ordersQuery.isLoading ? (
              <SkeletonList count={5} itemHeight={130} />
            ) : (
              <EmptyState 
                icon="📋" 
                title="No orders found" 
                subtitle={`New orders in "${tab}" will appear here.`} 
              />
            )
          }
          contentContainerStyle={styles.listContent}
        />
      </View>

      <Portal>
        <Modal
          visible={!!disburseOrder}
          onDismiss={() => setDisburseOrder(null)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Disburse Order</Text>
          <Text style={styles.modalSubtitle}>Select disbursement type</Text>
          <View style={styles.modalActions}>
            <Button 
              variant={disburseType === 'DM' ? 'primary' : 'secondary'} 
              label="Delivery Memo" 
              onPress={() => setDisburseType('DM')} 
              style={{ flex: 1 }}
            />
            <Button 
              variant={disburseType === 'SALE' ? 'primary' : 'secondary'} 
              label="Invoice Sale" 
              onPress={() => setDisburseType('SALE')} 
              style={{ flex: 1 }}
            />
          </View>
          <View style={styles.modalFooter}>
            <Button variant="ghost" label="Cancel" onPress={() => setDisburseOrder(null)} style={{ flex: 1 }} />
            <Button 
              label="Confirm" 
              onPress={handleConfirmDisburse} 
              loading={disburseMutation.isPending} 
              style={{ flex: 2 }} 
            />
          </View>
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

const styles = StyleSheet.create({
  tabContainer: {
    height: 50,
    marginVertical: spacing.md,
  },
  tabScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  tabButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textInverse,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadow.sm,
    minHeight: 120,
  },
  orderCardHeader: {
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderMainInfo: {
    flex: 1,
  },
  orderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  orderNumber: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  pendingBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  pendingBadgeText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  packedBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  packedBadgeText: {
    fontSize: 10,
    color: colors.success,
    fontWeight: fontWeight.bold,
  },
  customerName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  orderPriceInfo: {
    alignItems: 'flex-end',
    marginRight: spacing.md,
  },
  orderTotal: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  balanceDue: {
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  orderExpanded: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceOffset,
    backgroundColor: colors.bg,
  },
  itemList: {
    marginBottom: spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  itemInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemPackedText: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  itemQty: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  shortageButton: {
    minHeight: 32,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.surface,
    margin: spacing.xl,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.md,
  }
});
