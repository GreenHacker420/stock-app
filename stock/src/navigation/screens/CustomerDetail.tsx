import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Divider, Icon, Text, ActivityIndicator } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { useAuthStore } from "../../auth/auth-store";
import { useCustomerDetailQuery, useCustomerSalesQuery, useCustomerPaymentsQuery, useCustomerDMsQuery, useCustomerReturnsQuery, useCustomerTimelineQuery } from "../../hooks/useCustomers";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonList } from "../../components/ui/SkeletonCard";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

type TabType = "OVERVIEW" | "SALES" | "PAYMENTS" | "OUTSTANDING" | "DMS" | "RETURNS" | "TIMELINE";

export function CustomerDetail() {
  const navigation = useNavigation();
  const customerId = (useRoute().params as { customerId: string }).customerId;
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
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={customer.name} subtitle={customer.phone ?? "No phone"} />
      
      {/* Tab Bar */}
      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabItem, activeTab === tab.key && styles.activeTabItem]}
            >
              <Icon source={tab.icon} size={20} color={activeTab === tab.key ? colors.primary : colors.textMuted} />
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.activeTabLabel]}>{tab.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.content}>
        {activeTab === "OVERVIEW" && <OverviewTab customer={customer} />}
        {activeTab === "SALES" && <SalesTab query={salesQuery} />}
        {activeTab === "PAYMENTS" && <PaymentsTab query={paymentsQuery} />}
        {activeTab === "OUTSTANDING" && <OutstandingTab customer={customer} salesQuery={salesQuery} />}
        {activeTab === "DMS" && <DMsTab query={dmsQuery} />}
        {activeTab === "RETURNS" && <ReturnsTab query={returnsQuery} />}
        {activeTab === "TIMELINE" && <TimelineTab query={timelineQuery} />}
      </View>
    </Screen>
  );
}

function OverviewTab({ customer }: { customer: any }) {
  const navigation = useNavigation();
  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Outstanding</Text>
          <Text style={[styles.statValue, { color: colors.danger }]}>{money(customer.outstandingAmount)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Advance</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>{money(customer.advanceBalance)}</Text>
        </View>
      </View>

      <Section title="Profile Details">
        <View style={styles.infoCard}>
          <InfoRow label="GSTIN" value={customer.gstin || "Not provided"} />
          <InfoRow label="Address" value={customer.address || "No address"} />
          <InfoRow label="City" value={customer.city || "No city"} />
          <InfoRow label="Credit Limit" value={money(customer.creditLimit)} />
          <InfoRow label="Created On" value={new Date(customer.createdAt).toLocaleDateString()} />
        </View>
      </Section>

      <Button 
        variant="secondary" 
        label="Edit Profile" 
        onPress={() => (navigation as any).navigate("AddEditCustomer", { customer })} 
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
}

function SalesTab({ query }: { query: any }) {
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <FlashList
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>Sale #{item.saleNumber}</Text>
            <Text style={styles.listSubtitle}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.listAmount}>{money(item.totalAmount)}</Text>
            <StatusPill label={item.paymentStatus} tone={item.paymentStatus === 'PAID' ? 'green' : 'orange'} />
          </View>
        </View>
      )}
      estimatedItemSize={80}
      ListEmptyComponent={<EmptyState title="No sales found" />}
    />
  );
}

function PaymentsTab({ query }: { query: any }) {
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <FlashList
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>{item.paymentMode} Payment</Text>
            <Text style={styles.listSubtitle}>{new Date(item.receivedAt).toLocaleDateString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.listAmount}>{money(item.amount)}</Text>
            <StatusPill label={item.verificationStatus} tone={item.verificationStatus === 'VERIFIED' ? 'green' : 'orange'} />
          </View>
        </View>
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

      <Section title="Unpaid Invoices">
        {unpaidSales.length > 0 ? unpaidSales.map((sale: any) => (
          <View key={sale.id} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listTitle}>#{sale.saleNumber}</Text>
              <Text style={styles.listSubtitle}>Due: {sale.dueDate ? new Date(sale.dueDate).toLocaleDateString() : 'N/A'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.listAmount}>{money(sale.balanceAmount)}</Text>
              <Text style={styles.pendingText}>Pending of {money(sale.totalAmount)}</Text>
            </View>
          </View>
        )) : (
          <Text style={styles.emptyText}>All invoices are paid.</Text>
        )}
      </Section>
    </ScrollView>
  );
}

function DMsTab({ query }: { query: any }) {
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <FlashList
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>DM #{item.dmNumber}</Text>
            <Text style={styles.listSubtitle}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.listAmount}>{money(item.estimatedAmount)}</Text>
            <StatusPill label={item.status} tone="blue" />
          </View>
        </View>
      )}
      estimatedItemSize={80}
      ListEmptyComponent={<EmptyState title="No delivery memos found" />}
    />
  );
}

function ReturnsTab({ query }: { query: any }) {
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <FlashList
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>Return #{item.returnNumber}</Text>
            <Text style={styles.listSubtitle}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.listAmount, { color: colors.danger }]}>-{money(item.netAmount)}</Text>
            <StatusPill label={item.status} tone="orange" />
          </View>
        </View>
      )}
      estimatedItemSize={80}
      ListEmptyComponent={<EmptyState title="No returns found" />}
    />
  );
}

function TimelineTab({ query }: { query: any }) {
  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <FlashList
      data={query.data ?? []}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.timelineItem}>
          <View style={styles.timelineIcon}>
            <Icon 
              source={item.type === 'SALE' ? 'file-document' : item.type === 'PAYMENT' ? 'currency-inr' : 'history'} 
              size={24} 
              color={colors.primary} 
            />
          </View>
          <View style={styles.timelineContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.timelineTitle}>{item.title}</Text>
              <Text style={styles.timelineDate}>{new Date(item.date).toLocaleDateString()}</Text>
            </View>
            {item.amount && <Text style={styles.timelineAmount}>{money(item.amount)}</Text>}
            <Text style={styles.timelineStatus}>{item.status || item.detail}</Text>
          </View>
        </View>
      )}
      estimatedItemSize={100}
      ListEmptyComponent={<EmptyState title="No activity recorded" />}
    />
  );
}

function InfoRow({ label, value }: { label: string, value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabScroll: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    marginRight: spacing.sm,
    gap: spacing.sm,
  },
  activeTabItem: {
    backgroundColor: colors.surfaceOffset,
  },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  activeTabLabel: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  content: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabContent: {
    padding: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing.lg,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  listTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  listSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  listAmount: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  totalBox: {
    backgroundColor: colors.primary,
    padding: spacing.xl,
    borderRadius: radius.lg,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  totalLabel: {
    color: colors.textInverse,
    opacity: 0.8,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  totalValue: {
    color: colors.textInverse,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    marginTop: 4,
  },
  pendingText: {
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: fontWeight.medium,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    padding: spacing.xl,
  },
  timelineItem: {
    flexDirection: 'row',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
    gap: spacing.lg,
  },
  timelineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  timelineDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  timelineAmount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginTop: 4,
  },
  timelineStatus: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  }
});
