import React, { useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from "react-native";
import { Text, Icon, Button, Portal, Dialog, TextInput } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { ScreenScaffold } from "../../components/layout/ScreenScaffold";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StickyFooterActions } from "../../components/layout/StickyFooterActions";
import { StatusPill } from "../../components/ui/StatusPill";
import { AmountBreakdown } from "../../components/ui/AmountBreakdown";
import { PaymentCard } from "../../components/domain/payments/PaymentCard";
import { LoadingState } from "../../components/feedback/LoadingState";
import { ErrorState } from "../../components/feedback/ErrorState";
import {
  useDeliveryMemoQuery,
  useDeliveryMemoTimelineQuery,
  usePostDeliveryMemoMutation,
  useConvertDeliveryMemoToSaleMutation,
  useRequestDeliveryMemoCancellationMutation,
} from "../../hooks/useDeliveryMemos";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";
import { printDeliveryMemo, shareDeliveryMemoPdf } from "../../utils/pdf";

const money = (value?: string | number | null) => "₹" + Number(value ?? 0).toLocaleString("en-IN");

export function DeliveryMemoDetail() {
  const route = useRoute<any>();
  const id = route.params?.id;

  const { data: dm, isLoading, isFetching, refetch, error } = useDeliveryMemoQuery(id);
  const timelineQuery = useDeliveryMemoTimelineQuery(id);
  const postMutation = usePostDeliveryMemoMutation();
  const convertMutation = useConvertDeliveryMemoToSaleMutation();
  const cancellationMutation = useRequestDeliveryMemoCancellationMutation();
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [documentAction, setDocumentAction] = useState<"print" | "share" | null>(null);

  const getStatusTone = (status?: string) => {
    switch (status) {
      case "PAID":
      case "FULLY_PAID":
      case "CONVERTED_TO_SALE":
        return "green";
      case "PARTIALLY_PAID":
      case "CREATED":
        return "amber";
      case "CANCELLED":
      case "OVERDUE":
        return "red";
      default:
        return "neutral";
    }
  };

  const handleCollectPayment = () => {
    if (!dm) return;
    navigate("TakePayment", {
      customerId: dm.customerId,
      customer: dm.customer,
      dmId: dm.id,
      amount: dm.balanceAmount || dm.estimatedAmount,
    });
  };

  const handlePostDraft = () => {
    Alert.alert(
      "Confirm Physical Dispatch",
      "This will deduct stock and create the customer receivable. Continue only after the goods have left the shop.",
      [
        { text: "Not Yet", style: "cancel" },
        {
          text: "Confirm Dispatch",
          onPress: () => postMutation.mutate(
            { id: dm.id, version: dm.version },
            { onError: (err: any) => Alert.alert("Could Not Post", err?.message || "Please refresh and try again.") },
          ),
        },
      ],
    );
  };

  const handleConvert = () => {
    Alert.alert(
      "Generate Sale Invoice?",
      "The invoice will use the immutable DM quantities and rates. Stock and customer debt will not be posted again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate Invoice",
          onPress: () => convertMutation.mutate(
            { id: dm.id },
            {
              onSuccess: (sale) => navigate("SaleDetail", { id: sale.id }),
              onError: (err: any) => Alert.alert("Conversion Failed", err?.message || "Please try again."),
            },
          ),
        },
      ],
    );
  };

  const handleRequestCancellation = () => {
    const reason = cancelReason.trim();
    if (!reason) return;
    cancellationMutation.mutate(
      { id: dm.id, reason },
      {
        onSuccess: () => {
          setCancelVisible(false);
          setCancelReason("");
          Alert.alert("Request Submitted", "A different owner must approve the cancellation.");
        },
        onError: (err: any) => Alert.alert("Request Failed", err?.message || "Please try again."),
      },
    );
  };

  const handleDocumentAction = async (action: "print" | "share") => {
    setDocumentAction(action);
    try {
      if (action === "print") await printDeliveryMemo(dm);
      else await shareDeliveryMemoPdf(dm);
    } catch (err: any) {
      Alert.alert("Document Error", err?.message || "Could not create the delivery memo document.");
    } finally {
      setDocumentAction(null);
    }
  };

  if (isLoading) {
    return (
      <ScreenScaffold title="Delivery Memo" showBack>
        <LoadingState label="Loading delivery memo..." />
      </ScreenScaffold>
    );
  }

  if (error || !dm) {
    return (
      <ScreenScaffold title="Delivery Memo" showBack>
        <ErrorState title="Failed to load delivery memo details." />
      </ScreenScaffold>
    );
  }

  const dateStr = new Date(dm.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const expectedPayDateStr = dm.expectedPaymentDate
    ? new Date(dm.expectedPaymentDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const balance = Number(dm.balanceAmount ?? 0);
  const totalAmount = Number(dm.estimatedAmount ?? 0);
  const paidAmount = Number(dm.paidAmount ?? 0);

  return (
    <ScreenScaffold
      title={`DM #${dm.dmNumber}`}
      subtitle="Delivery Memo Details"
      showBack
      footer={dm.allowedActions?.canPost ? (
        <StickyFooterActions
          primary={{ label: "Confirm Dispatch", onPress: handlePostDraft, icon: "truck-check", loading: postMutation.isPending }}
        />
      ) : dm.allowedActions?.canCollectPayment || dm.allowedActions?.canConvertToSale ? (
        <StickyFooterActions actions={[
          ...(dm.allowedActions?.canCollectPayment ? [{ label: "Collect Payment", onPress: handleCollectPayment, icon: "cash-register" }] : []),
          ...(dm.allowedActions?.canConvertToSale ? [{ label: "Generate Invoice", onPress: handleConvert, icon: "file-document-check", loading: convertMutation.isPending }] : []),
        ]} />
      ) : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            colors={[colors.primary]}
          />
        }
      >
        {/* Status Card */}
        <ScreenSection card>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.createdAtLabel}>CREATED ON</Text>
              <Text style={styles.createdAtVal}>{dateStr}</Text>
            </View>
            <StatusPill label={dm.lifecycleStatus || "DISPATCHED"} tone={dm.lifecycleStatus === "CANCELLED" ? "red" : dm.lifecycleStatus === "DRAFT" ? "neutral" : "green"} />
          </View>

          <View style={styles.badges}>
            <StatusPill label={dm.paymentStatus || "UNPAID"} tone={getStatusTone(dm.status)} />
            <StatusPill label={(dm.dueStatus || "NOT_DUE").replaceAll("_", " ")} tone={dm.dueStatus === "OVERDUE" ? "red" : "blue"} />
            <StatusPill label={(dm.invoicingStatus || "NOT_INVOICED").replaceAll("_", " ")} tone={dm.invoicingStatus === "FULLY_INVOICED" ? "green" : "neutral"} />
            <StatusPill label={(dm.returnStatus || "NO_RETURN").replaceAll("_", " ")} tone={dm.returnStatus === "NO_RETURN" ? "neutral" : "amber"} />
          </View>

          <AmountBreakdown
            rows={[
              { label: "Estimated Total", value: money(totalAmount) },
              { label: "Amount Paid", value: money(paidAmount), tone: "green" },
              { label: "Balance Due", value: money(balance), tone: balance > 0 ? "red" : "default" },
            ]}
          />

          {expectedPayDateStr && (
            <View style={styles.expectedPayContainer}>
              <Icon source="calendar-clock" size={16} color={colors.textSecondary} />
              <Text style={styles.expectedPayText}>
                Expected Payment Date: <Text style={styles.expectedPayDate}>{expectedPayDateStr}</Text>
              </Text>
            </View>
          )}
        </ScreenSection>

        {/* Customer Details */}
        <ScreenSection title="Customer Information" card>
          <View style={styles.customerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(dm.customer?.name || "W")[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.flex1}>
              <Text style={styles.custName}>{dm.customer?.name || "Walk-in Customer"}</Text>
              {dm.customer?.phone ? (
                <Text style={styles.custPhone}>{dm.customer.phone}</Text>
              ) : null}
              {dm.customer?.address ? (
                <Text style={styles.custAddress}>{dm.customer.address}</Text>
              ) : null}
            </View>
          </View>
        </ScreenSection>

        {/* Items Section */}
        <ScreenSection title="Products Listed" card>
          {dm.items && dm.items.length > 0 ? (
            dm.items.map((item: any, idx: number) => {
              const lineTotal = Number(item.quantity) * Number(item.rate);
              const remaining = Number(item.quantity) - Number(item.returnedQty || 0);
              return (
                <View key={item.id || idx} style={idx > 0 ? styles.itemRowBordered : undefined}>
                  <View style={styles.itemRow}>
                    <View style={styles.itemMainInfo}>
                      <Text style={styles.itemName}>{item.item?.name || "Product SKU"}</Text>
                      <Text style={styles.itemSku}>{item.item?.sku || "N/A"}</Text>
                      <Text style={styles.itemSku}>Delivered {item.quantity} • Returned {item.returnedQty || 0} • Remaining {remaining}</Text>
                      {Array.isArray(item.serialNumbers) && item.serialNumbers.length ? (
                        <Text style={styles.serialText}>S/N: {item.serialNumbers.join(", ")}</Text>
                      ) : null}
                    </View>
                    <View style={styles.itemPriceCol}>
                      <Text style={styles.itemRateQty}>
                        {item.quantity} {item.item?.unit || "units"} × {money(item.rate)}
                      </Text>
                      <Text style={styles.itemSubtotal}>{money(lineTotal)}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.noItemsText}>No items listed in this Delivery Memo.</Text>
          )}
        </ScreenSection>

        {/* Payments History */}
        <ScreenSection title="Collection History" card>
          {dm.payments && dm.payments.length > 0 ? (
            dm.payments.map((p: any, idx: number) => {
              const payDate = new Date(p.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              return (
                <PaymentCard
                  key={p.id || idx}
                  title={p.paymentMode}
                  subtitle={p.referenceNumber ? `Ref: ${p.referenceNumber} • ${payDate}` : payDate}
                  amount={money(p.amount)}
                  status={p.status || "RECORDED"}
                  statusTone={p.status === "VERIFIED" ? "green" : p.status === "REJECTED" ? "red" : "amber"}
                />
              );
            })
          ) : (
            <View style={styles.noPaymentsBox}>
              <Icon source="cash-remove" size={24} color={colors.textMuted} />
              <Text style={styles.noPaymentsText}>No collections recorded for this memo yet.</Text>
            </View>
          )}
        </ScreenSection>

        <ScreenSection title="Lifecycle Timeline" card>
          {timelineQuery.isLoading ? (
            <Text style={styles.noPaymentsText}>Loading timeline…</Text>
          ) : timelineQuery.data?.length ? (
            timelineQuery.data.map((event: any, index: number) => (
              <View key={`${event.type}-${index}`} style={styles.timelineRow}>
                <View style={styles.timelineDot} />
                <View style={styles.flex1}>
                  <Text style={styles.timelineTitle}>{String(event.type).replaceAll("_", " ")}</Text>
                  <Text style={styles.itemSku}>{new Date(event.at).toLocaleString("en-IN")}</Text>
                </View>
                {event.amount ? <Text style={styles.timelineAmount}>{money(event.amount)}</Text> : null}
              </View>
            ))
          ) : (
            <Text style={styles.noPaymentsText}>No lifecycle events recorded yet.</Text>
          )}
        </ScreenSection>

        {dm.allowedActions?.canPrint || dm.allowedActions?.canShare ? (
          <View style={styles.documentActions}>
            {dm.allowedActions?.canPrint ? (
              <Button mode="outlined" icon="printer" loading={documentAction === "print"} onPress={() => handleDocumentAction("print")} style={styles.documentButton}>
                Print
              </Button>
            ) : null}
            {dm.allowedActions?.canShare ? (
              <Button mode="outlined" icon="share-variant" loading={documentAction === "share"} onPress={() => handleDocumentAction("share")} style={styles.documentButton}>
                Share PDF
              </Button>
            ) : null}
          </View>
        ) : null}

        {dm.allowedActions?.canRequestCancellation ? (
          <Button mode="outlined" textColor={colors.danger} icon="cancel" onPress={() => setCancelVisible(true)}>
            Request Cancellation
          </Button>
        ) : null}
      </ScrollView>

      <Portal>
        <Dialog visible={cancelVisible} onDismiss={() => setCancelVisible(false)}>
          <Dialog.Title>Request DM Cancellation</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.cancelHelp}>Cancellation restores stock and reverses the remaining receivable only after independent owner approval.</Text>
            <TextInput mode="outlined" label="Reason" value={cancelReason} onChangeText={setCancelReason} multiline />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCancelVisible(false)}>Keep DM</Button>
            <Button textColor={colors.danger} onPress={handleRequestCancellation} loading={cancellationMutation.isPending} disabled={!cancelReason.trim()}>
              Submit Request
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  serialText: {
    marginTop: spacing.xs,
    color: colors.info,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  timelineTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textTransform: "capitalize",
  },
  timelineAmount: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  cancelHelp: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  documentActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  documentButton: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  createdAtLabel: {
    fontSize: 9,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  createdAtVal: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  expectedPayContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  expectedPayText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  expectedPayDate: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.primary,
  },
  custName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  custPhone: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    marginTop: 2,
  },
  custAddress: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
  itemRowBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemMainInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSku: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  itemPriceCol: {
    alignItems: "flex-end",
    gap: 2,
  },
  itemRateQty: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  itemSubtotal: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  noItemsText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.md,
    fontWeight: fontWeight.medium,
  },
  noPaymentsBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  noPaymentsText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
    textAlign: "center",
  },
});
