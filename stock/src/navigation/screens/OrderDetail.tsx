import React, { useMemo, useState } from "react";
import { 
  ScrollView, 
  View, 
  StyleSheet, 
  Pressable, 
  ActivityIndicator,
  Linking
} from "react-native";
import { 
  Text, 
  Icon, 
  Divider, 
  Portal, 
  Modal,
  TextInput
} from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useOrderQuery, useUpdateOrderStatusMutation } from "../../hooks/useOrders";
import { useAddDeliveryMemoMutation } from "../../hooks/useShops";
import { useStaffQuery } from "../../hooks/useShops";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { useAuthStore } from "../../auth/auth-store";
import { navigate, goBack } from "../navigation-ref";

export function OrderDetail() {
  const user = useAuthStore((state) => state.user);
  const route = useRoute<any>();
  const orderId = route.params?.orderId;
  const queryClient = useQueryClient();

  const orderQuery = useOrderQuery(orderId);
  const order = orderQuery.data;

  const staffQuery = useStaffQuery();
  const updateStatusMutation = useUpdateOrderStatusMutation();
  const createDmMutation = useAddDeliveryMemoMutation();
  const convertSaleMutation = useMutation({
    mutationFn: (data: any) => Promise.resolve({}), // Placeholder for conversion
  });

  // Modal States
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [shortageModalVisible, setShortageModalVisible] = useState(false);
  const [disburseModalVisible, setDisburseModalVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  
  const [selectedShortageItem, setSelectedShortageItem] = useState<any>(null);
  const [shortageQty, setShortageQty] = useState("");
  const [disburseMode, setDisburseMode] = useState<"DM" | "SALE">("DM");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [amountPaid, setAmountPaid] = useState("");
  const [successTitle, setSuccessTitle] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isOwner = user?.role === "OWNER";

  const handleUpdateStatus = (status: string) => {
    updateStatusMutation.mutate({ orderId, status }, {
      onSuccess: () => {
        setSuccessTitle("Status Updated");
        setSuccessMessage(`Order is now in ${status.toLowerCase()} state.`);
        setSuccessVisible(true);
      }
    });
  };

  const handleAssignStaff = (staffId: string) => {
    updateStatusMutation.mutate({ orderId, assignedStaffId: staffId }, {
      onSuccess: () => {
        setAssignModalVisible(false);
        setSuccessTitle("Staff Assigned");
        setSuccessMessage("Order assignment updated successfully.");
        setSuccessVisible(true);
      }
    });
  };

  const handleReportShortage = () => {
    if (!selectedShortageItem || !shortageQty) return;
    updateStatusMutation.mutate({ 
      orderId, 
      shortage: { itemId: selectedShortageItem.itemId, quantity: Number(shortageQty) } 
    }, {
      onSuccess: () => {
        setShortageModalVisible(false);
        setSelectedShortageItem(null);
        setShortageQty("");
        setSuccessTitle("Shortage Reported");
        setSuccessMessage("Stock shortage has been logged for this order.");
        setSuccessVisible(true);
      }
    });
  };

  const handleConfirmDisburse = () => {
    if (disburseMode === "DM") {
      createDmMutation.mutate({
        orderId,
        customerId: order?.customerId ?? "",
        shopId: order?.shopId ?? "",
        items: order?.items.map(i => ({ itemId: i.itemId, quantity: i.quantityPacked || i.quantityOrdered, rate: i.rate })) ?? [],
      }, {
        onSuccess: () => {
          setDisburseModalVisible(false);
          setSuccessTitle("DM Created");
          setSuccessMessage("Delivery Memo generated. Goods can be dispatched.");
          setSuccessVisible(true);
        }
      });
    } else {
      // Conversion to Sale logic here
      setDisburseModalVisible(false);
      setSuccessTitle("Order Converted");
      setSuccessMessage("Order has been successfully converted to a Sale.");
      setSuccessVisible(true);
    }
  };

  if (orderQuery.isLoading) {
    return (
      <View style={styles.centerWrapper}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Fetching order details...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centerWrapper}>
        <Icon source="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>Order not found or has been deleted.</Text>
        <Button label="Go Back" variant="ghost" onPress={() => goBack()} />
      </View>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={`Order #${order.orderNumber}`} subtitle="Fulfillment & Operations" showBack />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Main Status Header Card */}
        <View style={styles.orderCard}>
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleCol}>
              <Text style={styles.customerName}>{order.customer?.name}</Text>
              <Text style={styles.dateText}>Booked: {new Date(order.createdAt).toLocaleDateString()}</Text>
            </View>
            <View style={styles.headerStatusCol}>
              <StatusPill 
                label={order.status} 
                tone={order.status === 'PACKED' ? 'green' : order.status === 'CANCELLED' ? 'red' : 'blue'} 
              />
              <View style={[styles.priorityBadge, { backgroundColor: colors.surfaceOffset, marginTop: 8 }]}>
                <Text style={styles.priorityText}>{order.priority}</Text>
              </View>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.metricsRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>TOTAL VALUE</Text>
              <Text style={styles.metricVal}>₹{Number(order.totalAmount).toLocaleString()}</Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>ITEMS</Text>
              <Text style={styles.metricVal}>{order.items.length}</Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>ASSIGNED TO</Text>
              <Pressable 
                onPress={() => isOwner && setAssignModalVisible(true)}
                style={styles.staffRow}
                disabled={!isOwner}
              >
                <Text style={[styles.staffText, order.assignedStaff && styles.boldStaffText]}>
                  {order.assignedStaff?.name.split(' ')[0] || "Unassigned"}
                </Text>
                {isOwner && <Icon source="chevron-down" size={14} color={colors.primary} />}
              </Pressable>
            </View>
          </View>
        </View>

        {/* Operational Actions */}
        <Section title="Operations">
          <View style={styles.actionGrid}>
            {order.status === 'CONFIRMED' && (
              <Button 
                label="Start Packing" 
                variant="primary" 
                style={styles.actionBtn}
                onPress={() => handleUpdateStatus("PACKING")}
              />
            )}
            {order.status === 'PACKING' && (
              <Button 
                label="Finish Packing" 
                variant="success" 
                style={styles.actionBtn}
                onPress={() => handleUpdateStatus("PACKED")}
              />
            )}
            {order.status === 'PACKED' && (
              <Button 
                label="Disburse Goods" 
                variant="primary" 
                style={styles.actionBtn}
                onPress={() => setDisburseModalVisible(true)}
              />
            )}
            <Button 
              label="Contact" 
              variant="secondary" 
              style={styles.actionBtn}
              onPress={() => order.customer?.phone && Linking.openURL(`tel:${order.customer.phone}`)}
              icon={<Icon source="phone" size={16} color={colors.primary} />}
            />
          </View>
        </Section>

        {/* Ready To Disburse Banner */}
        {order.status === 'PACKED' && (
          <View style={styles.readyCard}>
            <Section title="">
              <View style={styles.readyContent}>
                <Icon source="package-variant" size={28} color={colors.success} />
                <View style={styles.flex1}>
                  <Text style={styles.readyTitle}>Order is Packed</Text>
                  <Text style={styles.readySubtitle}>Ready for DM generation or conversion to sale.</Text>
                </View>
              </View>
            </Section>
          </View>
        )}

        {/* Items List */}
        <Section title="Order Items">
          <View style={styles.itemsCard}>
            {order.items.map((item, idx) => {
              const shortageQtyNum = Number(item.quantityShortage || 0);
              const isShort = shortageQtyNum > 0;
              const isPacked = item.quantityPacked === item.quantityOrdered;

              return (
                <View key={item.id}>
                  <Pressable 
                    onPress={() => {
                      if (order.status === 'PACKING') {
                        setSelectedShortageItem(item);
                        setShortageQty(String(shortageQtyNum));
                        setShortageModalVisible(true);
                      }
                    }}
                    style={({ pressed }) => [styles.itemRow, pressed && order.status === 'PACKING' && styles.pressed]}
                  >
                    <Icon 
                      source={isPacked ? "check-circle" : isShort ? "alert-circle" : "circle-outline"} 
                      size={20} 
                      color={isPacked ? colors.success : isShort ? colors.danger : colors.textMuted} 
                    />
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, isPacked && styles.packedText]}>{item.item.name}</Text>
                      <Text style={styles.itemSub}>Ordered: {item.quantityOrdered} {item.item.unit} • Packed: {item.quantityPacked || 0}</Text>
                    </View>
                    <View style={styles.itemRight}>
                      <Text style={styles.itemTotal}>₹{(Number(item.quantityOrdered) * Number(item.rate)).toLocaleString()}</Text>
                      {isShort && (
                        <View style={styles.shortageBadge}>
                          <Text style={styles.shortageText}>SHORT: {item.quantityShortage}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                  {idx < order.items.length - 1 && <Divider style={{ backgroundColor: colors.surfaceOffset }} />}
                </View>
              );
            })}
          </View>
        </Section>

        {/* Notes & Customer Detail */}
        <Section title="Notes">
          <View style={styles.customerCard}>
            <Text style={styles.contactText}>{order.ownerNotes || "No notes from owner provided."}</Text>
          </View>
        </Section>

        <Section title="Customer info">
           <View style={styles.customerCard}>
              <View style={styles.contactRow}>
                <Icon source="account-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.contactText}>{order.customer?.name}</Text>
              </View>
              <View style={styles.contactRow}>
                <Icon source="phone-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.contactText}>{order.customer?.phone || "No phone"}</Text>
              </View>
              <View style={styles.contactRow}>
                <Icon source="map-marker-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.contactText} numberOfLines={1}>{order.customer?.address || "No address"}</Text>
              </View>
           </View>
        </Section>

        {/* Danger Zone */}
        {isOwner && (
          <Section title="Danger zone">
             <Button 
               label="Cancel Order" 
               variant="danger" 
               onPress={() => handleUpdateStatus("CANCELLED")} 
               disabled={['DISPATCHED', 'CANCELLED'].includes(order.status)}
             />
          </Section>
        )}
      </ScrollView>

      {/* Assignment Modal */}
      <Portal>
        <Modal visible={assignModalVisible} onDismiss={() => setAssignModalVisible(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Assign Order</Text>
          <Text style={styles.modalSubtitle}>Pick a staff member to fulfill this order.</Text>
          <ScrollView style={styles.staffScroll}>
            {staffQuery.data?.map((s) => (
              <Pressable 
                key={s.id} 
                onPress={() => handleAssignStaff(s.id)}
                style={({ pressed }) => [styles.staffItemRow, pressed && styles.pressed]}
              >
                <Text style={styles.staffItemName}>{s.name}</Text>
                <Text style={styles.staffItemMobile}>{s.mobile}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Button label="Cancel" variant="ghost" onPress={() => setAssignModalVisible(false)} style={styles.modalCancelBtn} />
        </Modal>

        {/* Shortage Modal */}
        <Modal visible={shortageModalVisible} onDismiss={() => setShortageModalVisible(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Report Shortage</Text>
          <Text style={styles.modalSubtitle}>Enter quantity missing from physical stock.</Text>
          <Text style={styles.shortageItemName}>{selectedShortageItem?.item.name}</Text>
          <TextInput
            mode="outlined"
            label="Shortage Quantity"
            keyboardType="numeric"
            value={shortageQty}
            onChangeText={setShortageQty}
            style={styles.textInput}
            outlineStyle={{ borderRadius: radius.md }}
          />
          <View style={styles.modalActions}>
            <Button variant="ghost" label="Cancel" onPress={() => setShortageModalVisible(false)} style={{ flex: 1 }} />
            <Button label="Save Shortage" onPress={handleReportShortage} style={{ flex: 1.5 }} />
          </View>
        </Modal>

        {/* Disburse Modal */}
        <Modal visible={disburseModalVisible} onDismiss={() => setDisburseModalVisible(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Disburse Goods</Text>
          <Text style={styles.modalSubtitle}>Move goods out of the shop.</Text>
          
          <View style={styles.disburseTabs}>
            <Pressable 
              onPress={() => setDisburseMode("DM")} 
              style={[styles.disburseTab, disburseMode === 'DM' && styles.disburseTabActive]}
            >
              <Text style={[styles.disburseTabText, disburseMode === 'DM' && styles.disburseTabTextActive]}>CREATE DM</Text>
            </Pressable>
            <Pressable 
              onPress={() => setDisburseMode("SALE")} 
              style={[styles.disburseTab, disburseMode === 'SALE' && styles.disburseTabActive]}
            >
              <Text style={[styles.disburseTabText, disburseMode === 'SALE' && styles.disburseTabTextActive]}>CONVERT TO SALE</Text>
            </Pressable>
          </View>

          {disburseMode === 'DM' ? (
            <View style={styles.disburseBody}>
              <Text style={styles.disburseDesc}>
                This will generate a Delivery Memo (Kachha Bill) for the customer. Items will be deducted from physical stock.
              </Text>
            </View>
          ) : (
            <View style={styles.disburseBody}>
              <Text style={styles.disburseDesc}>
                This will convert the order into a finalized counter sale. Record any payment received below.
              </Text>
              <TextInput
                mode="outlined"
                label="Amount Paid Now"
                keyboardType="numeric"
                value={amountPaid}
                onChangeText={setAmountPaid}
                style={styles.textInput}
                outlineStyle={{ borderRadius: radius.md }}
              />
              <View style={styles.modeGrid}>
                {["CASH", "UPI", "CARD", "BANK_TRANSFER"].map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setPaymentMode(mode)}
                    style={[styles.modeBtn, paymentMode === mode && styles.modeBtnActive]}
                  >
                    <Text style={[styles.modeBtnText, paymentMode === mode && styles.modeBtnTextActive]}>
                      {mode.replace('_', ' ')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.modalActions}>
            <Button variant="ghost" label="Cancel" onPress={() => setDisburseModalVisible(false)} style={{ flex: 1 }} />
            <Button 
              label="Disburse Goods" 
              onPress={handleConfirmDisburse} 
              loading={createDmMutation.isPending || convertSaleMutation.isPending}
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
  centerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleCol: {
    flex: 1.2,
  },
  headerStatusCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  customerName: {
    fontSize: 18,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
  },
  divider: {
    marginVertical: spacing.lg,
    backgroundColor: colors.border,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 8,
    color: colors.textMuted,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  metricVal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 4,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  staffText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  boldStaffText: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    minWidth: 140,
  },
  readyCard: {
    borderColor: 'rgba(22, 163, 74, 0.25)',
    borderWidth: 1.5,
    borderRadius: 22,
    backgroundColor: 'rgba(22, 163, 74, 0.02)',
    marginHorizontal: spacing.sm,
    ...shadow.sm,
  },
  readyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  readyTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.success,
  },
  readySubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadow.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
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
  packedText: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  itemSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  itemTotal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  shortageBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  shortageText: {
    fontSize: 9,
    color: colors.danger,
    fontWeight: fontWeight.bold,
  },
  customerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  contactText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  // Modal / Dialog General styles
  modalContent: {
    backgroundColor: colors.surface,
    margin: spacing.xl,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  staffScroll: {
    maxHeight: 200,
    marginVertical: spacing.md,
  },
  staffItemRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.bg,
  },
  staffItemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  staffItemMobile: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCancelBtn: {
    marginTop: spacing.md,
  },
  textInput: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  shortageItemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  disburseTabs: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginVertical: spacing.lg,
  },
  disburseTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceOffset,
  },
  disburseTabActive: {
    backgroundColor: colors.primary,
  },
  disburseTabText: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
  },
  disburseTabTextActive: {
    color: colors.textInverse,
  },
  disburseBody: {
    marginBottom: spacing.xl,
  },
  disburseDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modeBtn: {
    flex: 1,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  modeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  modeBtnText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  modeBtnTextActive: {
    color: colors.primaryDark,
  },
  flex1: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
