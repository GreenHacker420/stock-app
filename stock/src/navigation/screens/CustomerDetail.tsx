import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useRoute } from "@react-navigation/native";
import { ActivityIndicator, Text } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { useAuthStore } from "../../auth/auth-store";
import { useCustomerDetailQuery, useCustomerSalesQuery, useCustomerPaymentsQuery, useCustomerDMsQuery, useCustomerReturnsQuery, useCustomerTimelineQuery } from "../../hooks/useCustomers";
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
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { navigate } from "../navigation-ref";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

type TabType = "OVERVIEW" | "SALES" | "PAYMENTS" | "OUTSTANDING" | "DMS" | "RETURNS" | "TIMELINE";

export function CustomerDetail() {
  const route = useRoute<any>();
  const customerId = route.params?.customerId;
  const [activeTab, setActiveTab] = useState<TabType>("OVERVIEW");

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
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <MetricGrid
        items={[
          { label: "Outstanding", value: money(customer.outstandingAmount), icon: "cash-remove", tone: "red" },
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

      {customer.type !== "WALK_IN" && isOwner && (
        <Button
          variant="secondary"
          label="Edit Profile"
          onPress={() => navigate("AddEditCustomer", { customer })}
          style={{ marginTop: spacing.lg }}
        />
      )}
    </ScrollView>
  );
}

function SalesTab({ query }: { query: any }) {
  const List = FlashList as any;
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <List
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <SaleCard
          saleNumber={item.saleNumber}
          customerName={item.customer?.name || 'Sale'}
          date={new Date(item.createdAt).toLocaleDateString()}
          amount={money(item.totalAmount)}
          paymentStatus={item.paymentStatus}
          statusTone={item.paymentStatus === 'PAID' ? 'green' : 'amber'}
        />
      )}
      estimatedItemSize={80}
      ListEmptyComponent={<EmptyState title="No sales found" />}
    />
  );
}

function PaymentsTab({ query }: { query: any }) {
  const List = FlashList as any;
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <List
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <PaymentCard
          title={`${item.paymentMode} Payment`}
          subtitle={new Date(item.receivedAt).toLocaleDateString()}
          amount={money(item.amount)}
          status={item.status}
          statusTone={item.status === 'VERIFIED' ? 'green' : item.status === 'REJECTED' ? 'red' : 'amber'}
        />
      )}
      estimatedItemSize={80}
      ListEmptyComponent={<EmptyState title="No payments found" />}
    />
  );
}

function OutstandingTab({ customer, salesQuery }: { customer: any, salesQuery: any }) {
  const unpaidSales = (salesQuery.data ?? []).filter((s: any) => s.paymentStatus !== "PAID");

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Total Outstanding</Text>
        <Text style={styles.totalValue}>{money(customer.outstandingAmount)}</Text>
      </View>

      <ScreenSection title="Unpaid Invoices">
        {unpaidSales.length > 0 ? unpaidSales.map((sale: any) => (
          <SaleCard
            key={sale.id}
            saleNumber={sale.saleNumber}
            customerName={sale.customer?.name || "Sale"}
            date={new Date(sale.createdAt).toLocaleDateString()}
            amount={money(sale.totalAmount)}
            paymentStatus="PENDING"
            statusTone="red"
          />
        )) : (
          <EmptyState title="All invoices cleared" icon="check-circle-outline" />
        )}
      </ScreenSection>
    </ScrollView>
  );
}

function DMsTab({ query }: { query: any }) {
  const List = FlashList as any;
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <List
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <DeliveryMemoCard
          number={item.dmNumber}
          date={new Date(item.createdAt).toLocaleDateString()}
          customerName={item.customer?.name || "Customer"}
          status={item.status}
          statusTone={item.status === 'PAID' ? 'green' : 'amber'}
          estimatedAmount={money(item.estimatedAmount ?? item.totalAmount)}
          paidAmount={money(item.paidAmount)}
          balanceAmount={money(item.balanceAmount)}
          balanceTone={Number(item.balanceAmount) > 0 ? "red" : "default"}
          itemCount={item.items?.length || 0}
        />
      )}
      estimatedItemSize={80}
      ListEmptyComponent={<EmptyState title="No Delivery Memos" />}
    />
  );
}

function ReturnsTab({ query }: { query: any }) {
  const List = FlashList as any;
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <List
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.returnRow}>
          <View style={styles.returnMain}>
            <Text style={styles.returnTitle} numberOfLines={1}>Return #{item.returnNumber}</Text>
            <Text style={styles.returnSubtitle}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.returnRight}>
            <Text style={styles.returnAmount} numberOfLines={1}>{money(item.totalAmount)}</Text>
            <StatusPill label="REVERSED" tone="red" />
          </View>
        </View>
      )}
      estimatedItemSize={80}
      ListEmptyComponent={<EmptyState title="No returns found" />}
    />
  );
}

function TimelineTab({ query }: { query: any }) {
  const List = FlashList as any;
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  const formatDate = (raw: any) => {
    if (!raw) return "—";
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  };

  return (
    <List
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.timelineItem}>
           <View style={styles.timelinePoint}>
              <View style={styles.timelineLine} />
              <View style={styles.timelineDot} />
           </View>
           <View style={styles.timelineCard}>
              <Text style={styles.timelineDate}>{formatDate(item.createdAt)}</Text>
              <Text style={styles.timelineTitle}>{item.event ?? item.title ?? item.type}</Text>
              {!!item.description && <Text style={styles.timelineDesc}>{item.description}</Text>}
              {item.amount != null && <Text style={styles.timelineAmount}>{money(item.amount)}</Text>}
           </View>
        </View>
      )}
      estimatedItemSize={120}
      contentContainerStyle={{ paddingVertical: spacing.lg }}
    />
  );
}

const styles = StyleSheet.create({
  tabs: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: spacing.lg,
    paddingBottom: 100,
    gap: spacing.lg,
  },
  totalBox: {
    backgroundColor: colors.surfaceOffset,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: fontWeight.black,
    color: colors.danger,
  },
  returnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  returnMain: {
    flex: 1,
    minWidth: 0,
  },
  returnTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  returnSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  returnRight: {
    alignItems: "flex-end",
    gap: spacing.xs,
    minWidth: 0,
  },
  returnAmount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    color: colors.danger,
  },
  timelineItem: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
  },
  timelinePoint: {
    width: 24,
    alignItems: 'center',
  },
  timelineLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.surfaceOffset,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 20,
    zIndex: 2,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.surface,
    marginVertical: spacing.sm,
    marginLeft: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  timelineDate: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 4,
  },
  timelineDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timelineAmount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginTop: 4,
  },
});
