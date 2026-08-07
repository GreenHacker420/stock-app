import { useState } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { useRoute } from "@react-navigation/native";
import { Text, Menu, Portal, Dialog, TextInput, IconButton } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import {
  useCustomerDetailQuery,
  useCustomerSalesQuery,
  useCustomerPaymentsQuery,
  useCustomerDMsQuery,
  useCustomerReturnsQuery,
  useCustomerTimelineQuery,
} from "../../hooks/useCustomers";
import { useCustomerLedger, useReverseLedgerEntry } from "../../hooks/useCustomerLedger";
import { ScreenScaffold } from "../../components/layout/ScreenScaffold";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { Button } from "../../components/ui/Button";
import { InfoRow } from "../../components/ui/InfoRow";
import { MetricGrid } from "../../components/ui/MetricGrid";
import { PaymentCard } from "../../components/domain/payments/PaymentCard";
import { SaleCard } from "../../components/domain/sales/SaleCard";
import { DeliveryMemoCard } from "../../components/domain/delivery/DeliveryMemoCard";
import { AppSegmentedControl } from "../../components/ui/AppSegmentedControl";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, spacing, radius, fontSize, shadow } from "../../theme";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { navigate } from "../navigation-ref";
import { OpeningBalanceSheet } from "../../components/domain/ledger/OpeningBalanceSheet";
import { ManualAdjustmentSheet } from "../../components/domain/ledger/ManualAdjustmentSheet";
import { CustomerLedgerEntry } from "../../api/ledger.api";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

function formatBalanceStatus(outstanding: number, advance: number) {
  if (outstanding > 0) return { label: `${money(outstanding)} Outstanding`, tone: "red" as const };
  if (advance > 0) return { label: `${money(advance)} Advance`, tone: "green" as const };
  return { label: "₹0 Settled", tone: "amber" as const };
}

type TabType = "OVERVIEW" | "LEDGER" | "SALES" | "PAYMENTS" | "OUTSTANDING" | "DMS" | "RETURNS" | "TIMELINE";

export function CustomerDetail() {
  const route = useRoute<any>();
  const customerId = route.params?.customerId;
  const [activeTab, setActiveTab] = useState<TabType>("OVERVIEW");

  const activeShopId = useShopStore((state) => state.activeShopId);
  const customerQuery = useCustomerDetailQuery(customerId);
  const salesQuery = useCustomerSalesQuery(customerId);
  const paymentsQuery = useCustomerPaymentsQuery(customerId);
  const dmsQuery = useCustomerDMsQuery(customerId);
  const returnsQuery = useCustomerReturnsQuery(customerId);
  const timelineQuery = useCustomerTimelineQuery(customerId);

  const customer = customerQuery.data;

  if (customerQuery.isLoading) return <SkeletonList count={10} />;
  if (!customer) return <EmptyState title="Customer not found" />;

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: "OVERVIEW", label: "Overview", icon: "view-dashboard-outline" },
    { key: "LEDGER", label: "Ledger", icon: "book-open-outline" },
    { key: "SALES", label: "Sales", icon: "file-document-outline" },
    { key: "PAYMENTS", label: "Payments", icon: "currency-inr" },
    { key: "OUTSTANDING", label: "Outstanding", icon: "alert-circle-outline" },
    { key: "DMS", label: "DMs", icon: "truck-delivery-outline" },
    { key: "RETURNS", label: "Returns", icon: "keyboard-return" },
    { key: "TIMELINE", label: "Timeline", icon: "history" },
  ];

  return (
    <ScreenScaffold title={customer.name} subtitle={customer.phone ?? "No phone"} fallbackRoute="CustomerList">
      {/* Tab Bar */}
      <AppSegmentedControl
        scrollable
        minOptionWidth={104}
        value={activeTab}
        onChange={setActiveTab}
        options={tabs.map((tab) => ({ value: tab.key, label: tab.label, icon: tab.icon }))}
        style={styles.tabs}
      />

      <View style={styles.content}>
        {activeTab === "OVERVIEW" && <OverviewTab customer={customer} />}
        {activeTab === "LEDGER" && <LedgerTab customer={customer} shopId={activeShopId || ""} />}
        {activeTab === "SALES" && <SalesTab query={salesQuery} />}
        {activeTab === "PAYMENTS" && <PaymentsTab query={paymentsQuery} />}
        {activeTab === "OUTSTANDING" && <OutstandingTab customer={customer} salesQuery={salesQuery} />}
        {activeTab === "DMS" && <DMsTab query={dmsQuery} />}
        {activeTab === "RETURNS" && <ReturnsTab query={returnsQuery} />}
        {activeTab === "TIMELINE" && <TimelineTab query={timelineQuery} />}
      </View>
    </ScreenScaffold>
  );
}

function OverviewTab({ customer }: { customer: any }) {
  const balanceStatus = formatBalanceStatus(Number(customer.outstandingAmount || 0), Number(customer.advanceBalance || 0));

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <MetricGrid
        items={[
          { label: "Account Balance", value: balanceStatus.label, icon: "cash-multiple", tone: balanceStatus.tone },
          { label: "Sales", value: money(customer.totalSales), icon: "chart-line", tone: "green" },
        ]}
      />

      <ScreenSection title="Profile Details" card>
        <InfoRow label="Contact Person" value={customer.contactPerson || "Not provided"} />
        <InfoRow label="Phone / Mobile" value={customer.phone || "Not provided"} />
        <InfoRow label="GSTIN" value={customer.gstin || "Not provided"} />
        <InfoRow label="Address" value={customer.address || "No address"} />
        <InfoRow label="City" value={customer.city || "No city"} />
        <InfoRow label="Credit Limit" value={money(customer.creditLimit)} />
        <InfoRow label="Created On" value={new Date(customer.createdAt).toLocaleDateString()} />
      </ScreenSection>
    </ScrollView>
  );
}

function LedgerTab({ customer, shopId }: { customer: any; shopId: string }) {
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";
  const isWalkIn = customer.type === "WALK_IN";

  const [openingSheetVisible, setOpeningSheetVisible] = useState(false);
  const [adjustmentSheetVisible, setAdjustmentSheetVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CustomerLedgerEntry | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalDialogVisible, setReversalDialogVisible] = useState(false);

  const ledgerQuery = useCustomerLedger(customer.id, { shopId, limit: 30 });
  const reverseMutation = useReverseLedgerEntry(customer.id);

  const pages = ledgerQuery.data?.pages || [];
  const entries: CustomerLedgerEntry[] = pages.flatMap((p) => p.entries);
  const hasOpeningBalance = entries.some((e) => e.sourceType === "OPENING_BALANCE");

  const balanceStatus = formatBalanceStatus(Number(customer.outstandingAmount || 0), Number(customer.advanceBalance || 0));

  const handleReverseClick = (entry: CustomerLedgerEntry) => {
    setSelectedEntry(entry);
    setReversalReason("");
    setReversalDialogVisible(true);
  };

  const handleConfirmReversal = async () => {
    if (!selectedEntry || !reversalReason.trim()) {
      Alert.alert("Reason Required", "Please enter a mandatory reversal reason");
      return;
    }
    try {
      await reverseMutation.mutateAsync({
        entryId: selectedEntry.id,
        payload: { shopId, reversalReason: reversalReason.trim() },
      });
      setReversalDialogVisible(false);
      setSelectedEntry(null);
      Alert.alert("Success", "Ledger entry reversed successfully");
    } catch (err: any) {
      Alert.alert("Reversal Failed", err?.response?.data?.message || err?.message || "Could not reverse entry");
    }
  };

  if (isWalkIn) {
    return (
      <View style={styles.tabContent}>
        <EmptyState
          title="Walk-In Customer"
          subtitle="Walk-in cash customers do not carry financial ledger history or debt."
        />
      </View>
    );
  }

  return (
    <View style={styles.ledgerContainer}>
      {/* Header Balance Banner */}
      <View style={styles.balanceBanner}>
        <View>
          <Text style={styles.balanceLabel}>Current Financial Position</Text>
          <Text style={styles.balanceValue}>{balanceStatus.label}</Text>
        </View>

        {isOwner && (
          <View style={styles.headerActions}>
            {!hasOpeningBalance && (
              <Button label="+ Opening" variant="secondary" size="sm" onPress={() => setOpeningSheetVisible(true)} />
            )}
            <Button label="+ Adjust" variant="primary" size="sm" onPress={() => setAdjustmentSheetVisible(true)} />
          </View>
        )}
      </View>

      {/* Ledger FlashList */}
      {ledgerQuery.isLoading ? (
        <SkeletonList count={8} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No Ledger Entries"
          subtitle="Posting sales, payments, or opening balances will populate this ledger."
        />
      ) : (
        <FlashList
          data={entries}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (ledgerQuery.hasNextPage) ledgerQuery.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshing={ledgerQuery.isRefetching}
          onRefresh={() => ledgerQuery.refetch()}
          renderItem={({ item }) => (
            <LedgerRow item={item} isOwner={isOwner} onReverse={() => handleReverseClick(item)} />
          )}
        />
      )}

      {/* Modals & Sheets */}
      {isOwner && (
        <>
          <OpeningBalanceSheet
            visible={openingSheetVisible}
            onDismiss={() => setOpeningSheetVisible(false)}
            customerId={customer.id}
            customerName={customer.name}
            shopId={shopId}
          />

          <ManualAdjustmentSheet
            visible={adjustmentSheetVisible}
            onDismiss={() => setAdjustmentSheetVisible(false)}
            customerId={customer.id}
            customerName={customer.name}
            shopId={shopId}
          />
        </>
      )}

      {/* Reversal Reason Dialog */}
      <Portal>
        <Dialog visible={reversalDialogVisible} onDismiss={() => setReversalDialogVisible(false)}>
          <Dialog.Title>Reverse Ledger Entry</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              Reversing this entry will post an opposite entry of ₹{itemAmount(selectedEntry?.amount)} and restore customer balance.
            </Text>
            <TextInput
              label="Mandatory Reversal Reason *"
              value={reversalReason}
              onChangeText={setReversalReason}
              mode="outlined"
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button label="Cancel" variant="secondary" onPress={() => setReversalDialogVisible(false)} />
            <Button label="Confirm Reversal" variant="primary" onPress={handleConfirmReversal} loading={reverseMutation.isPending} />
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function itemAmount(amt: any) {
  return Number(amt || 0).toLocaleString("en-IN");
}

function LedgerRow({
  item,
  isOwner,
  onReverse,
}: {
  item: CustomerLedgerEntry;
  isOwner: boolean;
  onReverse: () => void;
}) {
  const [menuVisible, setMenuVisible] = useState(false);
  const isDebit = item.direction === "DEBIT";

  return (
    <View style={[styles.rowCard, item.isReversed && styles.reversedCard]}>
      <View style={styles.rowHeader}>
        <View style={styles.rowMainInfo}>
          <Text style={styles.rowDate}>
            {new Date(item.effectiveAt).toLocaleDateString()} {new Date(item.effectiveAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <Text style={styles.rowType}>{formatEntryType(item.entryType)}</Text>
        </View>

        <View style={styles.rowRight}>
          <Text style={[styles.rowAmount, isDebit ? styles.debitText : styles.creditText]}>
            {isDebit ? "+" : "-"}{money(item.amount)}
          </Text>
          {item.isReversed ? (
            <StatusPill label="Reversed" tone="red" />
          ) : item.isReversal ? (
            <StatusPill label="Reversal Entry" tone="amber" />
          ) : isOwner ? (
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={<IconButton icon="dots-vertical" size={18} onPress={() => setMenuVisible(true)} />}
            >
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  onReverse();
                }}
                title="Reverse Entry"
                leadingIcon="undo"
              />
            </Menu>
          ) : null}
        </View>
      </View>

      {item.notes ? <Text style={styles.rowNotes}>{item.notes}</Text> : null}

      <View style={styles.rowFooter}>
        <Text style={styles.rowRunning}>Running Net: {money(item.runningBalance)}</Text>
        {item.ledgerAttachments && item.ledgerAttachments.length > 0 && (
          <Text style={styles.attachmentBadge}>📎 {item.ledgerAttachments.length} file(s)</Text>
        )}
      </View>
    </View>
  );
}

function formatEntryType(type: string) {
  switch (type) {
    case "OPENING_RECEIVABLE":
      return "Opening Receivable";
    case "OPENING_ADVANCE":
      return "Opening Advance";
    case "SALE_POSTED":
      return "Sale Invoice";
    case "DELIVERY_MEMO_POSTED":
      return "Delivery Memo";
    case "PAYMENT_RECEIVED":
      return "Payment Received";
    case "SALE_VALUE_INCREASE":
      return "Sale Value Increase";
    case "SALE_VALUE_DECREASE":
      return "Sale Value Decrease";
    case "PAYMENT_VALUE_INCREASE":
      return "Payment Value Increase";
    case "PAYMENT_VALUE_DECREASE":
      return "Payment Value Decrease";
    case "ADJUSTMENT_DEBIT":
      return "Manual Debit Adjustment";
    case "ADJUSTMENT_CREDIT":
      return "Manual Credit Adjustment";
    case "REVERSAL":
      return "Entry Reversal";
    case "CHEQUE_BOUNCED":
      return "Cheque Bounced";
    case "RETURN_CREDIT":
      return "Return Credit";
    default:
      return type.replace(/_/g, " ");
  }
}

function SalesTab({ query }: { query: any }) {
  if (query.isLoading) return <SkeletonList count={5} />;
  const sales = query.data ?? [];
  if (sales.length === 0) return <EmptyState title="No sales found" />;

  return (
    <FlashList
      data={sales}
      keyExtractor={(item: any) => item.id}
      renderItem={({ item }: { item: any }) => (
        <SaleCard
          saleNumber={item.saleNumber || item.id.slice(-6)}
          customerName={item.customer?.name}
          amount={money(item.totalAmount)}
          paymentStatus={item.paymentStatus}
          date={new Date(item.createdAt).toLocaleDateString()}
          onPress={() => navigate("EditSale", { saleId: item.id })}
        />
      )}
    />
  );
}

function PaymentsTab({ query }: { query: any }) {
  if (query.isLoading) return <SkeletonList count={5} />;
  const payments = query.data ?? [];
  if (payments.length === 0) return <EmptyState title="No payments found" />;

  return (
    <FlashList
      data={payments}
      keyExtractor={(item: any) => item.id}
      renderItem={({ item }: { item: any }) => (
        <PaymentCard
          title={`Payment #${item.receiptNumber || item.id.slice(-6)}`}
          subtitle={item.paymentMode}
          amount={money(item.amount)}
          status={item.status}
        />
      )}
    />
  );
}

function OutstandingTab({ customer, salesQuery }: { customer: any; salesQuery: any }) {
  const sales = (salesQuery.data ?? []).filter((s: any) => Number(s.balanceAmount) > 0);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <MetricGrid
        items={[
          { label: "Net Outstanding", value: money(customer.outstandingAmount), icon: "alert-circle-outline", tone: "red" },
          { label: "Advance Credit", value: money(customer.advanceBalance), icon: "cash-check", tone: "green" },
        ]}
      />

      <ScreenSection title="Unpaid Sales Invoices" card>
        {sales.length === 0 ? (
          <Text style={styles.emptyText}>No pending invoices for this customer.</Text>
        ) : (
          sales.map((sale: any) => (
            <View key={sale.id} style={styles.unpaidRow}>
              <View>
                <Text style={styles.unpaidNumber}>{sale.saleNumber}</Text>
                <Text style={styles.unpaidDate}>{new Date(sale.createdAt).toLocaleDateString()}</Text>
              </View>

              <View style={styles.unpaidAmounts}>
                <Text style={styles.unpaidTotal}>Total: {money(sale.totalAmount)}</Text>
                <Text style={styles.unpaidBalance}>Due: {money(sale.balanceAmount)}</Text>
              </View>
            </View>
          ))
        )}
      </ScreenSection>
    </ScrollView>
  );
}

function DMsTab({ query }: { query: any }) {
  if (query.isLoading) return <SkeletonList count={5} />;
  const dms = query.data ?? [];
  if (dms.length === 0) return <EmptyState title="No delivery memos found" />;

  return (
    <FlashList
      data={dms}
      keyExtractor={(item: any) => item.id}
      renderItem={({ item }: { item: any }) => (
        <DeliveryMemoCard
          number={item.memoNumber || item.id.slice(-6)}
          date={new Date(item.createdAt).toLocaleDateString()}
          customerName={item.customer?.name || ""}
          status={item.status}
          estimatedAmount={money(item.totalAmount)}
          paidAmount={money(item.paidAmount)}
          balanceAmount={money(item.balanceAmount)}
          itemCount={item.items?.length || 0}
          onPress={() => navigate("DeliveryMemoDetail", { id: item.id })}
        />
      )}
    />
  );
}


function ReturnsTab({ query }: { query: any }) {
  if (query.isLoading) return <SkeletonList count={5} />;
  const returnsList = query.data ?? [];
  if (returnsList.length === 0) return <EmptyState title="No sales returns found" />;

  return (
    <FlashList
      data={returnsList}
      keyExtractor={(item: any) => item.id}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.rowCard}>
          <Text style={styles.rowType}>Return #{item.returnNumber || item.id.slice(-6)}</Text>
          <Text style={styles.debitText}>{money(item.totalAmount)}</Text>
        </View>
      )}
    />
  );
}

function TimelineTab({ query }: { query: any }) {
  if (query.isLoading) return <SkeletonList count={5} />;
  const events = query.data ?? [];
  if (events.length === 0) return <EmptyState title="No timeline events" />;

  return (
    <FlashList
      data={events}
      keyExtractor={(item: any) => item.id}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.rowCard}>
          <Text style={styles.rowDate}>{new Date(item.createdAt).toLocaleString()}</Text>
          <Text style={styles.rowType}>{item.description || item.action}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  tabs: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  ledgerContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  balanceBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginVertical: spacing.sm,
  },
  balanceLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  balanceValue: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  rowCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  reversedCard: {
    opacity: 0.6,
    backgroundColor: colors.surfaceOffset,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  rowMainInfo: {
    flex: 1,
  },
  rowDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  rowType: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: 2,
  },
  rowRight: {
    alignItems: "flex-end",
  },
  rowAmount: {
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  debitText: {
    color: colors.danger,
  },
  creditText: {
    color: colors.success,
  },
  rowNotes: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: "italic",
  },
  rowFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowRunning: {
    fontSize: fontSize.xs,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  attachmentBadge: {
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  dialogText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  dialogInput: {
    backgroundColor: colors.surface,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    padding: spacing.md,
  },
  unpaidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unpaidNumber: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  unpaidDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  unpaidAmounts: {
    alignItems: "flex-end",
  },
  unpaidTotal: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  unpaidBalance: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.danger,
  },
});
