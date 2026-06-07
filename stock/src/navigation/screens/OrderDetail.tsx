import React, { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Card, Divider, Text, Icon, Portal, Modal, TextInput, Checkbox } from "react-native-paper";

import { useAuthStore } from "../../auth/auth-store";
import { 
  useOrderDetailQuery, 
  useConfirmOrderMutation, 
  useAssignStaffToOrderMutation, 
  useStartOrderPackingMutation, 
  useMarkOrderItemPackedMutation, 
  useReportOrderShortageMutation, 
  useCreateDmFromOrderMutation, 
  useConvertOrderToSaleMutation 
} from "../../hooks/useOrders";
import { useStaffQuery } from "../../hooks/useAuth";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { Button } from "../../components/ui/Button";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function OrderDetail() {
  const navigation = useNavigation();
  const route = useRoute();
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";

  const orderId = (route.params as { orderId?: string } | undefined)?.orderId;
  
  const orderQuery = useOrderDetailQuery(orderId ?? "");
  const staffQuery = useStaffQuery();

  const order = orderQuery.data;

  // Mutations
  const confirmMutation = useConfirmOrderMutation();
  const assignStaffMutation = useAssignStaffToOrderMutation();
  const startPackingMutation = useStartOrderPackingMutation();
  const packItemMutation = useMarkOrderItemPackedMutation();
  const shortageMutation = useReportOrderShortageMutation();
  const createDmMutation = useCreateDmFromOrderMutation();
  const convertSaleMutation = useConvertOrderToSaleMutation();

  // Dialog/Modal states
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  
  const [shortageModalVisible, setShortageModalVisible] = useState(false);
  const [selectedOrderItem, setSelectedOrderItem] = useState<any>(null);
  const [availableQty, setAvailableQty] = useState("");
  const [shortageReason, setShortageReason] = useState("");

  const [disburseModalVisible, setDisburseModalVisible] = useState(false);
  const [disburseType, setDisburseType] = useState<"DM" | "SALE">("DM");
  const [expectedPaymentDate, setExpectedPaymentDate] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [amountPaid, setAmountPaid] = useState("");

  // Success modals
  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const balance = useMemo(() => 
    order ? Number(order.totalAmount) - Number(order.paidAmount) : 0, 
    [order]
  );

  const isFullyPacked = useMemo(() => {
    if (!order) return false;
    return order.items.every(
      item => Number(item.quantityPacked) >= Number(item.quantityOrdered)
    );
  }, [order]);

  const handleConfirmOrder = () => {
    if (!orderId) return;
    confirmMutation.mutate(orderId, {
      onSuccess: () => {
        setSuccessTitle("Order Confirmed");
        setSuccessMessage("Order status has been updated to Confirmed (To Pack).");
        setSuccessVisible(true);
      }
    });
  };

  const handleAssignStaff = (staffId: string) => {
    if (!orderId) return;
    assignStaffMutation.mutate({ orderId, staffId }, {
      onSuccess: () => {
        setAssignModalVisible(false);
        setSuccessTitle("Staff Assigned");
        setSuccessMessage("A staff member has been assigned to compile this order.");
        setSuccessVisible(true);
      }
    });
  };

  const handleStartPacking = () => {
    if (!orderId) return;
    startPackingMutation.mutate(orderId, {
      onSuccess: () => {
        setSuccessTitle("Packing Started");
        setSuccessMessage("The order is now in packing state.");
        setSuccessVisible(true);
      }
    });
  };

  const handlePackItem = (orderItemId: string, ordered: number, packed: number) => {
    if (!orderId) return;
    const qtyToPack = ordered - packed;
    if (qtyToPack <= 0) return;
    
    packItemMutation.mutate({
      orderId,
      data: { orderItemId, quantityPacked: qtyToPack }
    });
  };

  const handleOpenShortage = (item: any) => {
    setSelectedOrderItem(item);
    setAvailableQty(String(item.quantityPacked));
    setShortageReason("");
    setShortageModalVisible(true);
  };

  const handleConfirmShortage = () => {
    if (!orderId || !selectedOrderItem) return;
    shortageMutation.mutate({
      orderId,
      data: {
        orderItemId: selectedOrderItem.id,
        availableQuantity: Number(availableQty),
        reason: shortageReason || "Stock shortage reported"
      }
    }, {
      onSuccess: () => {
        setShortageModalVisible(false);
        setSuccessTitle("Shortage Reported");
        setSuccessMessage("Stock shortage has been logged and order updated.");
        setSuccessVisible(true);
      }
    });
  };

  const handleConfirmDisburse = () => {
    if (!orderId) return;
    
    if (disburseType === "DM") {
      const offset = 3;
      const dueDate = expectedPaymentDate 
        ? new Date(expectedPaymentDate) 
        : new Date(Date.now() + offset * 86400000);

      createDmMutation.mutate({
        orderId,
        data: { expectedPaymentDate: dueDate.toISOString() }
      }, {
        onSuccess: () => {
          setDisburseModalVisible(false);
          setSuccessTitle("Disbursed via Memo");
          setSuccessMessage("Order dispatched with delivery memo generated.");
          setSuccessVisible(true);
        }
      });
    } else {
      const offset = 7;
      const dueDate = new Date(Date.now() + offset * 86400000);
      const paid = Number(amountPaid) || 0;
      const payments = paid > 0 ? [{ paymentMode, amount: paid }] : [];

      convertSaleMutation.mutate({
        orderId,
        data: {
          dueDate: dueDate.toISOString(),
          payments
        }
      }, {
        onSuccess: () => {
          setDisburseModalVisible(false);
          setSuccessTitle("Converted to Sale");
          setSuccessMessage("Order has been converted to an invoice sale.");
          setSuccessVisible(true);
        }
      });
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "URGENT":
        return { bg: "rgba(220, 38, 38, 0.08)", text: colors.danger };
      case "HIGH":
        return { bg: "rgba(245, 158, 11, 0.08)", text: colors.warning };
      case "NORMAL":
        return { bg: "rgba(59, 130, 246, 0.08)", text: colors.primary };
      default:
        return { bg: colors.surfaceOffset, text: colors.textSecondary };
    }
  };

  const getOrderStatusDisplay = (status?: string) => {
    switch (status) {
      case "DRAFT":
        return { label: "DRAFT", tone: "blue" as const };
      case "CONFIRMED":
        return { label: "CONFIRMED (TO PACK)", tone: "amber" as const };
      case "PACKING":
        return { label: "PACKING", tone: "amber" as const };
      case "PARTIALLY_PACKED":
        return { label: "PART PACKED", tone: "amber" as const };
      case "PACKED":
        return { label: "PACKED", tone: "green" as const };
      case "DISPATCHED":
        return { label: "DISPATCHED", tone: "green" as const };
      case "DM_CREATED":
        return { label: "DISBURSED (DM)", tone: "green" as const };
      case "CONVERTED_TO_SALE":
        return { label: "INVOICED", tone: "green" as const };
      case "CANCELLED":
        return { label: "CANCELLED", tone: "red" as const };
      default:
        return { label: status ?? "UNKNOWN", tone: "blue" as const };
    }
  };

  if (!orderId) {
    return (
      <Screen>
        <AppHeader title="Order Detail" showBack />
        <View style={styles.centerWrapper}>
          <Text style={styles.errorText}>No Order ID provided.</Text>
        </View>
      </Screen>
    );
  }

  if (orderQuery.isLoading) {
    return (
      <Screen>
        <AppHeader title="Order Detail" showBack />
        <View style={styles.centerWrapper}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Fetching order details...</Text>
        </View>
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen>
        <AppHeader title="Order Detail" showBack />
        <View style={styles.centerWrapper}>
          <Text style={styles.errorText}>Order not found.</Text>
        </View>
      </Screen>
    );
  }

  const statusConfig = getOrderStatusDisplay(order.status);
  const priColor = getPriorityColor((order as any).priority);
  const isPendingDisbursement = isFullyPacked && !["DISPATCHED", "DM_CREATED", "CONVERTED_TO_SALE", "CANCELLED"].includes(order.status);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={`Order #${order.orderNumber}`} showBack />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Core Order Info Card */}
        <View style={styles.orderCard}>
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleCol}>
              <Text style={styles.customerName}>{order.customer?.name ?? "Regular Customer"}</Text>
              <Text style={styles.dateText}>
                Placed on: {new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            </View>
            <View style={styles.headerStatusCol}>
              <StatusPill label={statusConfig.label} tone={statusConfig.tone} />
              {(order as any).priority && (
                <View style={[styles.priorityBadge, { backgroundColor: priColor.bg, marginTop: 4 }]}>
                  <Text style={[styles.priorityText, { color: priColor.text }]}>
                    {(order as any).priority} Priority
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Operational Metrics Row */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>TOTAL VALUE</Text>
              <Text style={styles.metricVal}>{money(order.totalAmount)}</Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>PAID</Text>
              <Text style={[styles.metricVal, { color: colors.success }]}>{money(order.paidAmount)}</Text>
            </View>
            <View style={[styles.metricCol, { alignItems: 'flex-end' }]}>
              <Text style={styles.metricLabel}>OUTSTANDING</Text>
              <Text style={[styles.metricVal, { color: balance > 0 ? colors.warning : colors.success }]}>
                {money(balance)}
              </Text>
            </View>
          </View>

          {/* Assigned Staff Banner */}
          <Divider style={styles.divider} />
          <View style={styles.staffRow}>
            <Icon source="account-tie-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.staffText}>
              Assigned Staff: <Text style={styles.boldStaffText}>
                {(order as any).assignedStaff?.name ?? "Not Assigned"}
              </Text>
            </Text>
          </View>
        </View>

        {/* Action Controls Section */}
        {isOwner && (
          <Section title="Owner Actions">
            <View style={styles.actionGrid}>
              {order.status === "DRAFT" && (
                <Button 
                  label="Confirm & Release to Staff" 
                  onPress={handleConfirmOrder}
                  loading={confirmMutation.isPending}
                  style={styles.actionBtn}
                />
              )}
              {["DRAFT", "CONFIRMED"].includes(order.status) && (
                <Button 
                  variant="secondary"
                  label="Assign Packing Staff" 
                  onPress={() => setAssignModalVisible(true)}
                  loading={assignStaffMutation.isPending}
                  style={styles.actionBtn}
                />
              )}
            </View>
          </Section>
        )}

        {/* Staff Packing / Progress States */}
        {!isOwner && order.status === "CONFIRMED" && (
          <Section title="Fulfillment Control">
            <Button
              label="Start Packing Order"
              icon={<Icon source="play-circle-outline" size={20} color={colors.textInverse} />}
              onPress={handleStartPacking}
              loading={startPackingMutation.isPending}
              style={{ marginHorizontal: spacing.sm }}
            />
          </Section>
        )}

        {/* Disburse Banner */}
        {isPendingDisbursement && (
          <Section title="Fulfillment Ready">
            <Card style={styles.readyCard}>
              <Card.Content style={styles.readyContent}>
                <Icon source="check-circle" size={32} color={colors.success} />
                <View style={styles.flex1}>
                  <Text style={styles.readyTitle}>Order Fully Packed!</Text>
                  <Text style={styles.readySubtitle}>Ready to disburse items or invoice the customer.</Text>
                </View>
                <Button
                  variant="success"
                  label="Disburse Order"
                  onPress={() => {
                    setDisburseType("DM");
                    setDisburseModalVisible(true);
                  }}
                />
              </Card.Content>
            </Card>
          </Section>
        )}

        {/* Items Summary Checklist */}
        <Section title="Order Items Checklist">
          <View style={styles.itemsCard}>
            {order.items.map((item, index) => {
              const ordered = Number(item.quantityOrdered);
              const packed = Number(item.quantityPacked);
              const isPacked = packed >= ordered;
              const isPackingState = ["PACKING", "PARTIALLY_PACKED"].includes(order.status);

              return (
                <View key={item.id}>
                  {index > 0 && <Divider />}
                  <View style={styles.itemRow}>
                    <Checkbox.Android
                      status={isPacked ? 'checked' : 'unchecked'}
                      onPress={() => handlePackItem(item.id, ordered, packed)}
                      disabled={isPacked || !isPackingState || packItemMutation.isPending}
                      theme={{ colors: { primary: colors.primary } }}
                    />
                    
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, isPacked && styles.packedText]}>
                        {item.item.name}
                      </Text>
                      <Text style={styles.itemSub}>
                        {packed} / {ordered} {item.item.unit} • {money(item.rate)} / {item.item.unit}
                      </Text>
                    </View>

                    <View style={styles.itemRight}>
                      <Text style={styles.itemTotal}>
                        {money(Number(item.rate) * ordered)}
                      </Text>
                      {!isPacked && isPackingState && (
                        <Pressable 
                          onPress={() => handleOpenShortage(item)}
                          style={({ pressed }) => [styles.shortageBadge, pressed && styles.pressed]}
                        >
                          <Text style={styles.shortageText}>Shortage</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </Section>

        {/* Customer Details Box */}
        <Section title="Customer Contact Details">
          <View style={styles.customerCard}>
            <View style={styles.contactRow}>
              <Icon source="phone-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.contactText}>{order.customer?.phone ?? "No phone recorded"}</Text>
            </View>
            {order.customer?.gstin && (
              <View style={styles.contactRow}>
                <Icon source="file-percent-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.contactText}>GSTIN: {order.customer.gstin}</Text>
              </View>
            )}
            <View style={styles.contactRow}>
              <Icon source="map-marker-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.contactText}>
                {order.customer?.address ? `${order.customer.address}, ${order.customer.city ?? ""}` : "No address recorded"}
              </Text>
            </View>
          </View>
        </Section>
      </ScrollView>

      {/* Staff Assignment Modal */}
      <Portal>
        <Modal
          visible={assignModalVisible}
          onDismiss={() => setAssignModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Assign Packaging Staff</Text>
          <Text style={styles.modalSubtitle}>Select staff member to fulfill this order</Text>
          
          <ScrollView style={styles.staffScroll} showsVerticalScrollIndicator={false}>
            {staffQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              staffQuery.data?.map((staffMember) => (
                <Pressable
                  key={staffMember.id}
                  onPress={() => handleAssignStaff(staffMember.id)}
                  style={({ pressed }) => [
                    styles.staffItemRow,
                    pressed && styles.pressed
                  ]}
                >
                  <Text style={styles.staffItemName}>{staffMember.name}</Text>
                  <Text style={styles.staffItemMobile}>{staffMember.mobile}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>

          <Button variant="ghost" label="Cancel" onPress={() => setAssignModalVisible(false)} style={styles.modalCancelBtn} />
        </Modal>
      </Portal>

      {/* Shortage Logger Modal */}
      <Portal>
        <Modal
          visible={shortageModalVisible}
          onDismiss={() => setShortageModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Report Item Shortage</Text>
          {selectedOrderItem && (
            <Text style={styles.shortageItemName}>{selectedOrderItem.item.name}</Text>
          )}
          
          <TextInput
            mode="outlined"
            label="Available Quantity"
            keyboardType="numeric"
            value={availableQty}
            onChangeText={setAvailableQty}
            style={styles.textInput}
            outlineStyle={{ borderRadius: radius.md }}
          />

          <TextInput
            mode="outlined"
            label="Reason for Shortage"
            value={shortageReason}
            onChangeText={setShortageReason}
            style={[styles.textInput, { height: 80 }]}
            multiline
            outlineStyle={{ borderRadius: radius.md }}
          />

          <View style={styles.modalActions}>
            <Button variant="ghost" label="Cancel" onPress={() => setShortageModalVisible(false)} style={{ flex: 1 }} />
            <Button 
              label="Submit Alert" 
              onPress={handleConfirmShortage} 
              loading={shortageMutation.isPending}
              style={{ flex: 1.5 }} 
            />
          </View>
        </Modal>
      </Portal>

      {/* Disburse Modal */}
      <Portal>
        <Modal
          visible={disburseModalVisible}
          onDismiss={() => setDisburseModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Disburse Order</Text>
          <Text style={styles.modalSubtitle}>How would you like to dispatch items?</Text>

          <View style={styles.disburseTabs}>
            <Pressable
              onPress={() => setDisburseType("DM")}
              style={[styles.disburseTab, disburseType === "DM" && styles.disburseTabActive]}
            >
              <Text style={[styles.disburseTabText, disburseType === "DM" && styles.disburseTabTextActive]}>
                DELIVERY MEMO
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDisburseType("SALE")}
              style={[styles.disburseTab, disburseType === "SALE" && styles.disburseTabActive]}
            >
              <Text style={[styles.disburseTabText, disburseType === "SALE" && styles.disburseTabTextActive]}>
                INVOICE SALE
              </Text>
            </Pressable>
          </View>

          {disburseType === "DM" ? (
            <View style={styles.disburseBody}>
              <Text style={styles.disburseDesc}>
                This will dispatch goods against a Delivery Memo (unpaid invoice). The customer can return or pay later.
              </Text>
              <TextInput
                mode="outlined"
                label="Expected Payment Date (YYYY-MM-DD)"
                placeholder="2026-06-15"
                value={expectedPaymentDate}
                onChangeText={setExpectedPaymentDate}
                style={styles.textInput}
                outlineStyle={{ borderRadius: radius.md }}
              />
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
