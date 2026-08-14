import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Alert, Linking, TouchableOpacity } from "react-native";
import { useRoute } from "@react-navigation/native";
import { Text, Menu, Portal, Dialog, Modal, TextInput, IconButton, Icon, ActivityIndicator } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";

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
import { useCustomerLedger, useCustomerLedgerSummary, useReverseLedgerEntry } from "../../hooks/useCustomerLedger";
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
import {
  CustomerLedgerAttachment,
  CustomerLedgerEntry,
  CustomerLedgerSummary,
  getAssetDownloadUrl,
} from "../../api/ledger.api";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

function formatCustomerDate(d?: string | Date | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatBalanceStatus(outstanding: number, advance: number) {
  if (outstanding > 0) return { label: `${money(outstanding)} Outstanding`, tone: "red" as const };
  if (advance > 0) return { label: `${money(advance)} Advance`, tone: "green" as const };
  return { label: "₹0 Settled", tone: "amber" as const };
}

function ledgerBalanceStatus(summary?: CustomerLedgerSummary) {
  return summary
    ? formatBalanceStatus(Number(summary.outstandingAmount), Number(summary.advanceBalance))
    : { label: "Balance unavailable", tone: "amber" as const };
}

type TabType = "OVERVIEW" | "LEDGER" | "SALES" | "PAYMENTS" | "OUTSTANDING" | "DMS" | "RETURNS" | "TIMELINE";

export function CustomerDetail() {
  const route = useRoute<any>();
  const customerId = route.params?.customerId;
  const [activeTab, setActiveTab] = useState<TabType>("OVERVIEW");

  const activeShopId = useShopStore((state) => state.activeShopId);
  const customerQuery = useCustomerDetailQuery(customerId);
  const ledgerSummaryQuery = useCustomerLedgerSummary(customerId, activeShopId || "");
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
        {activeTab === "OVERVIEW" && <OverviewTab customer={customer} ledgerSummary={ledgerSummaryQuery.data} onNavigateTab={setActiveTab} />}
        {activeTab === "LEDGER" && <LedgerTab customer={customer} shopId={activeShopId || ""} ledgerSummary={ledgerSummaryQuery.data} />}
        {activeTab === "SALES" && <SalesTab query={salesQuery} />}
        {activeTab === "PAYMENTS" && <PaymentsTab query={paymentsQuery} />}
        {activeTab === "OUTSTANDING" && <OutstandingTab customer={customer} ledgerSummary={ledgerSummaryQuery.data} salesQuery={salesQuery} />}
        {activeTab === "DMS" && <DMsTab query={dmsQuery} />}
        {activeTab === "RETURNS" && <ReturnsTab query={returnsQuery} />}
        {activeTab === "TIMELINE" && <TimelineTab query={timelineQuery} />}
      </View>
    </ScreenScaffold>
  );
}

function OverviewTab({
  customer,
  ledgerSummary,
  onNavigateTab,
}: {
  customer: any;
  ledgerSummary?: CustomerLedgerSummary;
  onNavigateTab: (tab: TabType) => void;
}) {
  const outstanding = Number(ledgerSummary?.outstandingAmount || 0);
  const advance = Number(ledgerSummary?.advanceBalance || 0);
  const balanceStatus = ledgerBalanceStatus(ledgerSummary);

  const handleCall = () => {
    if (customer.phone) {
      Linking.openURL(`tel:${customer.phone}`);
    } else {
      Alert.alert("No Phone", "Phone number is not available for this customer.");
    }
  };

  const handleWhatsApp = () => {
    if (customer.phone) {
      const cleanPhone = customer.phone.replace(/[^0-9]/g, "");
      const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      Linking.openURL(`whatsapp://send?phone=${fullPhone}`).catch(() => {
        Alert.alert("WhatsApp Unavailable", "Could not open WhatsApp.");
      });
    } else {
      Alert.alert("No Phone", "Phone number is not available for this customer.");
    }
  };

  const createdFormatted = formatCustomerDate(customer.createdAt || customer.created_at);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* Sleek Financial Summary Card */}
      <View style={styles.financialCard}>
        <View style={styles.financialHeader}>
          <View>
            <Text style={styles.financialLabel}>CURRENT BALANCE</Text>
            <Text
              style={[
                styles.financialMainValue,
                outstanding > 0 ? styles.debitText : advance > 0 ? styles.creditText : null,
              ]}
            >
              {balanceStatus.label}
            </Text>
          </View>
          <View
            style={[
              styles.balancePill,
              outstanding > 0
                ? styles.balancePillDebt
                : advance > 0
                ? styles.balancePillCredit
                : styles.balancePillSettled,
            ]}
          >
            <Text
              style={[
                styles.balancePillText,
                outstanding > 0
                  ? styles.balancePillTextDebt
                  : advance > 0
                  ? styles.balancePillTextCredit
                  : styles.balancePillTextSettled,
              ]}
            >
              {!ledgerSummary ? "UNAVAILABLE" : outstanding > 0 ? "DUE" : advance > 0 ? "ADVANCE" : "SETTLED"}
            </Text>
          </View>
        </View>

        {/* Mini stats divider row */}
        <View style={styles.financialMetricsRow}>
          <View style={styles.financialMetric}>
            <Text style={styles.metricLabel}>Total Sales</Text>
            <Text style={styles.metricValue}>{money(customer.totalSales)}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.financialMetric}>
            <Text style={styles.metricLabel}>Credit Limit</Text>
            <Text style={styles.metricValue}>{money(customer.creditLimit)}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.financialMetric}>
            <Text style={styles.metricLabel}>Customer Type</Text>
            <Text style={styles.metricValue}>{customer.type || "REGULAR"}</Text>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleCall}>
            <IconButton icon="phone-outline" size={18} iconColor={colors.primary} style={styles.zeroMargin} />
            <Text style={styles.quickActionText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleWhatsApp}>
            <IconButton icon="whatsapp" size={18} iconColor="#25D366" style={styles.zeroMargin} />
            <Text style={styles.quickActionText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionBtn} onPress={() => onNavigateTab("LEDGER")}>
            <IconButton icon="book-open-outline" size={18} iconColor={colors.primary} style={styles.zeroMargin} />
            <Text style={styles.quickActionText}>Ledger</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile & Contact Details Card */}
      <View style={styles.detailsCard}>
        <View style={styles.cardSectionHeader}>
          <Icon source="account-details-outline" size={18} color={colors.primary} />
          <Text style={styles.cardSectionTitle}>Profile & Contact Details</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Contact Person</Text>
          <Text style={styles.detailValue}>{customer.contactPerson || "Not provided"}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Phone / Mobile</Text>
          <Text style={styles.detailValueBold}>{customer.phone || "Not provided"}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>GSTIN</Text>
          <Text style={styles.detailValueMonospace}>{customer.gstin || "Not provided"}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Address</Text>
          <Text style={styles.detailValue}>{customer.address || "No address"}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>City</Text>
          <Text style={styles.detailValue}>{customer.city || "No city"}</Text>
        </View>

        <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.detailLabel}>Created On</Text>
          <Text style={styles.detailValue}>{createdFormatted}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function LedgerTab({ customer, shopId, ledgerSummary }: { customer: any; shopId: string; ledgerSummary?: CustomerLedgerSummary }) {
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";
  const isWalkIn = customer.type === "WALK_IN";

  const [openingSheetVisible, setOpeningSheetVisible] = useState(false);
  const [adjustmentSheetVisible, setAdjustmentSheetVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CustomerLedgerEntry | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalDialogVisible, setReversalDialogVisible] = useState(false);
  const [viewedAttachments, setViewedAttachments] = useState<CustomerLedgerAttachment[]>([]);

  const ledgerQuery = useCustomerLedger(customer.id, { shopId, limit: 30 });
  const reverseMutation = useReverseLedgerEntry(customer.id);

  const pages = ledgerQuery.data?.pages || [];
  const entries: CustomerLedgerEntry[] = pages.flatMap((p) => p.entries);
  const hasOpeningBalance = entries.some((e) => e.sourceType === "OPENING_BALANCE");

  const balanceStatus = ledgerBalanceStatus(ledgerSummary);

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
            <LedgerRow
              item={item}
              isOwner={isOwner}
              onReverse={() => handleReverseClick(item)}
              onViewAttachments={() => setViewedAttachments(item.attachments || [])}
            />
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

      <LedgerAttachmentViewer
        attachments={viewedAttachments}
        shopId={shopId}
        onDismiss={() => setViewedAttachments([])}
      />
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
  onViewAttachments,
}: {
  item: CustomerLedgerEntry;
  isOwner: boolean;
  onReverse: () => void;
  onViewAttachments: () => void;
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
        <Text style={styles.rowRunning}>
          {Number(item.runningBalance) < 0
            ? `${money(Math.abs(Number(item.runningBalance)))} Advance`
            : `${money(item.runningBalance)} Outstanding`}
        </Text>
        {item.attachments && item.attachments.length > 0 && (
          <TouchableOpacity accessibilityRole="button" onPress={onViewAttachments}>
            <Text style={styles.attachmentBadge}>{item.attachments.length} file(s) · View</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function LedgerAttachmentViewer({
  attachments,
  shopId,
  onDismiss,
}: {
  attachments: CustomerLedgerAttachment[];
  shopId: string;
  onDismiss: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const attachment = attachments[index];

  useEffect(() => {
    if (!attachment) {
      setIndex(0);
      setUrl(null);
      return;
    }
    let active = true;
    setLoading(true);
    setUrl(null);
    getAssetDownloadUrl(attachment.assetId, { shopId })
      .then((result) => {
        if (active) setUrl(result.downloadUrl);
      })
      .catch((error) => {
        if (active) Alert.alert("Attachment unavailable", error?.message || "Could not load this attachment");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attachment, shopId]);

  const isImage = attachment?.asset?.mimeType?.startsWith("image/") !== false;

  return (
    <Portal>
      <Modal visible={attachments.length > 0} onDismiss={onDismiss} contentContainerStyle={styles.attachmentModal}>
        <View style={styles.attachmentHeader}>
          <Text style={styles.attachmentTitle}>{attachment?.asset?.fileName || "Ledger attachment"}</Text>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        {loading ? (
          <ActivityIndicator style={styles.attachmentLoader} />
        ) : url && isImage ? (
          <Image source={{ uri: url }} style={styles.attachmentImage} contentFit="contain" />
        ) : url ? (
          <Button label="Open document" onPress={() => Linking.openURL(url)} />
        ) : null}

        {attachments.length > 1 ? (
          <View style={styles.attachmentNavigation}>
            <Button label="Previous" variant="secondary" disabled={index === 0} onPress={() => setIndex((value) => value - 1)} />
            <Text>{index + 1} / {attachments.length}</Text>
            <Button label="Next" variant="secondary" disabled={index === attachments.length - 1} onPress={() => setIndex((value) => value + 1)} />
          </View>
        ) : null}
      </Modal>
    </Portal>
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

function OutstandingTab({ customer, ledgerSummary, salesQuery }: { customer: any; ledgerSummary?: CustomerLedgerSummary; salesQuery: any }) {
  const sales = (salesQuery.data ?? []).filter((s: any) => Number(s.balanceAmount) > 0);
  const totalUnpaidDue = customer.unpaidSalesDue == null ? null : Number(customer.unpaidSalesDue);
  const customerDue = Number(ledgerSummary?.outstandingAmount || 0);
  const advance = Number(ledgerSummary?.advanceBalance || 0);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* Sleek Outstanding Header Card */}
      <View style={styles.financialCard}>
        <View style={styles.financialHeader}>
          <View>
            <Text style={styles.financialLabel}>CURRENT OUTSTANDING</Text>
            <Text style={[styles.financialMainValue, styles.debitText]}>
              {ledgerSummary ? money(customerDue) : "—"}
            </Text>
          </View>
          <View style={[styles.balancePill, customerDue > 0 ? styles.balancePillDebt : styles.balancePillSettled]}>
            <Text style={[styles.balancePillText, customerDue > 0 ? styles.balancePillTextDebt : styles.balancePillTextSettled]}>
              {!ledgerSummary ? "UNAVAILABLE" : customerDue > 0 ? (sales.length > 0 ? `${sales.length} UNPAID` : "LEDGER DUE") : "ALL PAID"}
            </Text>
          </View>
        </View>

        <View style={styles.financialMetricsRow}>
          <View style={styles.financialMetric}>
            <Text style={styles.metricLabel}>Total Invoices Due</Text>
            <Text style={styles.metricValue}>{totalUnpaidDue == null ? "—" : money(totalUnpaidDue)}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.financialMetric}>
            <Text style={styles.metricLabel}>Ledger Balance</Text>
            <Text style={styles.metricValue}>{ledgerSummary ? money(customerDue) : "—"}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.financialMetric}>
            <Text style={styles.metricLabel}>Advance Credit</Text>
            <Text style={styles.metricValue}>{ledgerSummary ? money(advance) : "—"}</Text>
          </View>
        </View>
      </View>

      <ScreenSection title="Unpaid Sales Invoices" card>
        {sales.length === 0 ? (
          <Text style={styles.emptyText}>No pending invoices for this customer.</Text>
        ) : (
          sales.map((sale: any) => (
            <View key={sale.id} style={styles.unpaidRow}>
              <View>
                <Text style={styles.unpaidNumber}>{sale.saleNumber}</Text>
                <Text style={styles.unpaidDate}>{new Date(sale.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Text>
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
      keyExtractor={(item: any, idx: number) => item.id || String(idx)}
      renderItem={({ item }: { item: any }) => {
        const isSale = item.type === "SALE";
        const isPayment = item.type === "PAYMENT";
        const isReturn = item.type === "RETURN";

        return (
          <View style={styles.rowCard}>
            <View style={styles.rowHeader}>
              <View style={styles.rowMainInfo}>
                <Text style={styles.rowDate}>
                  {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} • {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Text style={styles.rowType}>{item.event || item.description || "Activity"}</Text>
              </View>
              {item.amount != null ? (
                <Text style={[styles.rowAmount, (isSale || isReturn) ? styles.debitText : isPayment ? styles.creditText : null]}>
                  {isSale ? `+${money(item.amount)}` : isPayment ? `-${money(item.amount)}` : money(item.amount)}
                </Text>
              ) : null}
            </View>
            {item.description && item.event !== item.description ? (
              <Text style={styles.rowNotes}>{item.description}</Text>
            ) : null}
          </View>
        );
      }}
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
    fontWeight: "600",
  },
  attachmentModal: {
    backgroundColor: colors.surface,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  attachmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attachmentTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  attachmentLoader: {
    height: 420,
    justifyContent: "center",
  },
  attachmentImage: {
    width: "100%",
    height: 420,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
  },
  attachmentNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
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
  // Overview Tab Sleek Styles
  financialCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  financialHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  financialLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  financialMainValue: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: 2,
  },
  balancePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  balancePillDebt: {
    backgroundColor: "#FEE2E2",
  },
  balancePillCredit: {
    backgroundColor: "#DCFCE7",
  },
  balancePillSettled: {
    backgroundColor: colors.surfaceOffset,
  },
  balancePillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  balancePillTextDebt: {
    color: colors.danger,
  },
  balancePillTextCredit: {
    color: colors.success,
  },
  balancePillTextSettled: {
    color: colors.textSecondary,
  },
  financialMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  financialMetric: {
    flex: 1,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  zeroMargin: {
    margin: 0,
    marginRight: -4,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardSectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  detailValueBold: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
    fontWeight: "700",
    maxWidth: "60%",
    textAlign: "right",
  },
  detailValueMonospace: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
    fontWeight: "600",
    fontFamily: "monospace",
    maxWidth: "60%",
    textAlign: "right",
  },
});
