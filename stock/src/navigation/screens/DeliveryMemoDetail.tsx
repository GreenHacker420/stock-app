import React from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Text, Card, Icon, Divider } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
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
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Delivery Memo" showBack />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !dm) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Delivery Memo" showBack />
        <View style={styles.centerContainer}>
          <Icon source="alert-circle-outline" size={48} color={colors.danger} />
          <Text style={styles.errorText}>Failed to load delivery memo details.</Text>
        </View>
      </Screen>
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
    <Screen edges={["top", "left", "right"]}>
      <AppHeader 
        title={`DM #${dm.dmNumber}`} 
        subtitle="Delivery Memo Details" 
        showBack 
      />

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
        <Card style={styles.statusCard}>
          <Card.Content style={styles.statusCardContent}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.createdAtLabel}>CREATED ON</Text>
                <Text style={styles.createdAtVal}>{dateStr}</Text>
              </View>
              <StatusPill label={dm.status || "CREATED"} tone={getStatusTone(dm.status)} />
            </View>

            <Divider style={styles.divider} />

            <View style={styles.amountGrid}>
              <View style={styles.amountCol}>
                <Text style={styles.amountLabel}>ESTIMATED TOTAL</Text>
                <Text style={styles.amountValue}>{money(totalAmount)}</Text>
              </View>
              <View style={styles.amountCol}>
                <Text style={styles.amountLabel}>AMOUNT PAID</Text>
                <Text style={[styles.amountValue, { color: colors.success }]}>
                  {money(paidAmount)}
                </Text>
              </View>
              <View style={[styles.amountCol, styles.rightAlign]}>
                <Text style={styles.amountLabel}>BALANCE DUE</Text>
                <Text style={[
                  styles.amountValue, 
                  styles.balanceText,
                  { color: balance > 0 ? colors.danger : colors.textSecondary }
                ]}>
                  {money(balance)}
                </Text>
              </View>
            </View>

            {expectedPayDateStr && (
              <View style={styles.expectedPayContainer}>
                <Icon source="calendar-clock" size={16} color={colors.textSecondary} />
                <Text style={styles.expectedPayText}>
                  Expected Payment Date: <Text style={styles.expectedPayDate}>{expectedPayDateStr}</Text>
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Customer Details */}
        <Section title="Customer Information">
          <View style={styles.customerCard}>
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
          </View>
        </Section>

        {/* Items Section */}
        <Section title="Products Listed">
          <Card style={styles.itemsCard}>
            <Card.Content style={styles.itemsContent}>
              {dm.items && dm.items.length > 0 ? (
                dm.items.map((item: any, idx: number) => {
                  const lineTotal = Number(item.quantity) * Number(item.rate);
                  return (
                    <View key={item.id || idx}>
                      {idx > 0 && <Divider style={styles.itemDivider} />}
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
            </Card.Content>
          </Card>
        </Section>

        {/* Reason / Details if any */}
        {dm.reason ? (
          <Section title="Remarks">
            <Card style={styles.remarksCard}>
              <Card.Content>
                <Text style={styles.remarksText}>{dm.reason}</Text>
              </Card.Content>
            </Card>
          </Section>
        ) : null}

        {/* Payments History */}
        <Section title="Collection History">
          <Card style={styles.paymentsCard}>
            <Card.Content style={styles.paymentsContent}>
              {dm.payments && dm.payments.length > 0 ? (
                dm.payments.map((p: any, idx: number) => {
                  const payDate = new Date(p.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  return (
                    <View key={p.id || idx}>
                      {idx > 0 && <Divider style={styles.itemDivider} />}
                      <View style={styles.paymentRow}>
                        <View style={styles.paymentMain}>
                          <View style={styles.paymentHeader}>
                            <Text style={styles.paymentMode}>{p.paymentMode}</Text>
                            <StatusPill 
                              label={p.status || "RECORDED"} 
                              tone={p.status === "VERIFIED" ? "green" : p.status === "REJECTED" ? "red" : "amber"} 
                            />
                          </View>
                          {p.referenceNumber ? (
                            <Text style={styles.paymentRef}>Ref: {p.referenceNumber}</Text>
                          ) : null}
                          <Text style={styles.paymentDate}>{payDate}</Text>
                        </View>
                        <Text style={styles.paymentAmount}>{money(p.amount)}</Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.noPaymentsBox}>
                  <Icon source="cash-remove" size={24} color={colors.textMuted} />
                  <Text style={styles.noPaymentsText}>No collections recorded for this memo yet.</Text>
                </View>
              )}
            </Card.Content>
          </Card>
        </Section>
      </ScrollView>

      {/* Collect Payment Action Bottom Bar */}
      {balance > 0 ? (
        <View style={styles.footerBar}>
          <Button 
            label="Collect Payment"
            onPress={handleCollectPayment}
            style={styles.collectButton}
            icon="cash-register"
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontWeight: fontWeight.semibold,
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
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    elevation: 2,
  },
  statusCardContent: {
    padding: spacing.lg,
  },
  divider: {
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  amountGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  amountCol: {
    gap: 4,
  },
  rightAlign: {
    alignItems: "flex-end",
  },
  amountLabel: {
    fontSize: 9,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  balanceText: {
    fontSize: fontSize.md,
  },
  expectedPayContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
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
  customerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 1,
    padding: spacing.md,
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
  itemsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 1,
  },
  itemsContent: {
    padding: spacing.md,
  },
  itemDivider: {
    marginVertical: spacing.sm,
    backgroundColor: colors.border,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
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
  remarksCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 1,
  },
  remarksText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    lineHeight: 20,
  },
  paymentsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 1,
  },
  paymentsContent: {
    padding: spacing.md,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  paymentMain: {
    flex: 1,
    gap: 4,
  },
  paymentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  paymentMode: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  paymentRef: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
  },
  paymentDate: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  paymentAmount: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.success,
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
  footerBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    ...shadow.lg,
    elevation: 8,
  },
  collectButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
  },
});
