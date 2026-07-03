import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRoute } from "@react-navigation/native";
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
import { navigate, goBack } from "../navigation-ref";

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
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={customer.name} subtitle={customer.phone ?? "No phone"} fallbackRoute="CustomerList" />
      
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
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Outstanding</Text>
          <Text style={[styles.statValue, { color: colors.danger }]}>{money(customer.outstandingAmount)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Sales</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{money(customer.totalSales)}</Text>
        </View>
      </View>

      <Section title="Profile Details">
        <View style={styles.infoCard}>
          <InfoRow label="Contact Person" value={customer.contactPerson || "Not provided"} />
          <InfoRow label="Phone / Mobile" value={customer.phone || "Not provided"} />
          <InfoRow label="GSTIN" value={customer.gstin || "Not provided"} />
          <InfoRow label="Address" value={customer.address || "No address"} />
          <InfoRow label="City" value={customer.city || "No city"} />
          <InfoRow label="Credit Limit" value={money(customer.creditLimit)} />
          <InfoRow label="Created On" value={new Date(customer.createdAt).toLocaleDateString()} />
        </View>
      </Section>

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
        <View style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>Sale #{item.saleNumber}</Text>
            <Text style={styles.listSubtitle}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.listAmount}>{money(item.totalAmount)}</Text>
            <StatusPill label={item.paymentStatus} tone={item.paymentStatus === 'PAID' ? 'green' : 'amber'} />
          </View>
        </View>
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
        <View style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>{item.paymentMode} Payment</Text>
            <Text style={styles.listSubtitle}>{new Date(item.receivedAt).toLocaleDateString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.listAmount}>{money(item.amount)}</Text>
            <StatusPill label={item.status} tone={item.status === 'VERIFIED' ? 'green' : item.status === 'REJECTED' ? 'red' : 'amber'} />
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
              <Text style={styles.listTitle}>Sale #{sale.saleNumber}</Text>
              <Text style={styles.listSubtitle}>{new Date(sale.createdAt).toLocaleDateString()}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.listAmount, { color: colors.danger }]}>{money(sale.totalAmount)}</Text>
              <Text style={styles.miniLabel}>PENDING</Text>
            </View>
          </View>
        )) : (
          <EmptyState title="All invoices cleared" icon="check-circle-outline" />
        )}
      </Section>
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
        <View style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>DM #{item.dmNumber}</Text>
            <Text style={styles.listSubtitle}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.listAmount}>{money(item.totalAmount)}</Text>
            <StatusPill label={item.status} tone={item.status === 'PAID' ? 'green' : 'amber'} />
          </View>
        </View>
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
        <View style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle}>Return #{item.returnNumber}</Text>
            <Text style={styles.listSubtitle}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.listAmount, { color: colors.danger }]}>{money(item.totalAmount)}</Text>
            <Text style={styles.miniLabel}>REVERSED</Text>
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
              <Text style={styles.timelineDate}>{new Date(item.createdAt).toLocaleString()}</Text>
              <Text style={styles.timelineTitle}>{item.event}</Text>
              <Text style={styles.timelineDesc}>{item.description}</Text>
              {item.amount && <Text style={styles.timelineAmount}>{money(item.amount)}</Text>}
           </View>
        </View>
      )}
      estimatedItemSize={120}
      contentContainerStyle={{ paddingVertical: spacing.lg }}
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
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
    height: 52,
  },
  tabScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    paddingHorizontal: 4,
  },
  activeTabItem: {
    borderBottomColor: colors.primary,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  activeTabLabel: {
    color: colors.primary,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: spacing.lg,
    paddingBottom: 100,
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
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: fontWeight.black,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
    marginLeft: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  listSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  listAmount: {
    fontSize: 15,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  miniLabel: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
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
