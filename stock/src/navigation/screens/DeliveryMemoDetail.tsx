import React from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Text, Icon } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { ScreenScaffold } from "../../components/layout/ScreenScaffold";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StickyFooterActions } from "../../components/layout/StickyFooterActions";
import { StatusPill } from "../../components/ui/StatusPill";
import { AmountBreakdown } from "../../components/ui/AmountBreakdown";
import { PaymentCard } from "../../components/domain/payments/PaymentCard";
import { LoadingState } from "../../components/feedback/LoadingState";
import { ErrorState } from "../../components/feedback/ErrorState";
import { useDeliveryMemoQuery } from "../../hooks/useDeliveryMemos";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";

const money = (value?: string | number | null) => "₹" + Number(value ?? 0).toLocaleString("en-IN");

export function DeliveryMemoDetail() {
  const route = useRoute<any>();
  const id = route.params?.id;

  const { data: dm, isLoading, isFetching, refetch, error } = useDeliveryMemoQuery(id);

  const getStatusTone = (status?: string) => {
    switch (status) {
      case "PAID":
      case "FULLY_PAID":
      case "CONVERTED":
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
      dmId: dm.id,
      amount: dm.balanceAmount || dm.estimatedAmount,
    });
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
      footer={balance > 0 ? (
        <StickyFooterActions
          primary={{ label: "Collect Payment", onPress: handleCollectPayment, icon: "cash-register" }}
        />
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
            <StatusPill label={dm.status || "CREATED"} tone={getStatusTone(dm.status)} />
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
              return (
                <View key={item.id || idx} style={idx > 0 ? styles.itemRowBordered : undefined}>
                  <View style={styles.itemRow}>
                    <View style={styles.itemMainInfo}>
                      <Text style={styles.itemName}>{item.item?.name || "Product SKU"}</Text>
                      <Text style={styles.itemSku}>{item.item?.sku || "N/A"}</Text>
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
      </ScrollView>
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
