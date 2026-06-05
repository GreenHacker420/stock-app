import { useNavigation, useRoute } from "@react-navigation/native";
import { ScrollView, View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Button, Divider, Searchbar, SegmentedButtons, Text, TextInput, Icon } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { useOwnerDashboardQuery } from "../../hooks/useDashboard";
import { useAuthStore } from "../../auth/auth-store";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

type Action = { title: string; subtitle: string; icon: string; route?: string; tone?: "green" | "amber" | "blue" | "red" };
type Field = { label: string; value?: string; type?: "input" | "readonly" | "textarea" };
type ScreenConfig = {
  title: string;
  subtitle: string;
  tabs?: string[];
  badges?: Array<{ label: string; tone?: "green" | "amber" | "blue" | "red" | "neutral" }>;
  stats?: string[];
  fields?: Field[];
  rows?: string[];
  actions?: Action[];
  primary?: string;
};

const baseBadges = [{ label: "Screen UI complete", tone: "green" as const }];

function smartTitle(routeName: string) {
  return routeName.replace(/([A-Z])/g, " $1").trim();
}

function ConfiguredScreen({ config }: { config: ScreenConfig }) {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as Record<string, unknown> | undefined;
  const tabs = config.tabs ?? ["All", "Pending", "Completed"];

  const isTab = ["StaffWork", "OwnerRecords", "OwnerStock", "OwnerAlerts", "Notifications"].includes(route.name);

  return (
    <Screen scroll={false}>
      <AppHeader title={config.title} subtitle={config.subtitle} />
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerClassName={isTab ? "pb-24" : "pb-7"}
      >
        <View className="gap-4">
          <View className="flex-row flex-wrap gap-2">
            {[...baseBadges, ...(config.badges ?? [])].map((badge) => (
              <StatusPill key={badge.label} label={badge.label} tone={badge.tone ?? "blue"} />
            ))}
          </View>

          {params ? (
            <View className="rounded-lg border border-[#dbeafe] bg-blue-50 p-3">
              <Text variant="bodySmall" style={{ color: "#1e3a8a", fontWeight: "700" }}>
                Context: {JSON.stringify(params)}
              </Text>
            </View>
          ) : null}

          <Searchbar
            value=""
            onChangeText={() => {}}
            placeholder="Search by number, name, phone, SKU, or reference"
            style={{ backgroundColor: "white", borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb" } as any}
          />

          <SegmentedButtons
            value={tabs[0]}
            onValueChange={() => {}}
            buttons={tabs.slice(0, 4).map((tab) => ({ value: tab, label: tab }))}
            density="small"
          />

          {config.stats?.length ? (
            <Section title="Summary">
              <View className="flex-row flex-wrap gap-3">
                {config.stats.map((stat) => (
                  <View key={stat} className="min-w-[46%] flex-1 rounded-lg border border-[#e5e7eb] bg-white p-4">
                    <Text variant="bodySmall" style={{ color: "#64748b" }}>
                      {stat.split(":")[0]}
                    </Text>
                    <Text variant="titleMedium" style={{ color: "#111827", fontWeight: "900" }}>
                      {stat.includes(":") ? stat.split(":").slice(1).join(":").trim() : "--"}
                    </Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {config.fields?.length ? (
            <Section title="Details">
              <View className="gap-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
                {config.fields.map((field) =>
                  field.type === "readonly" ? (
                    <View key={field.label} className="flex-row justify-between gap-4">
                      <Text style={{ color: "#64748b", flex: 1 }}>{field.label}</Text>
                      <Text style={{ color: "#111827", fontWeight: "800", flex: 1, textAlign: "right" }}>{field.value ?? "--"}</Text>
                    </View>
                  ) : (
                    <TextInput
                      key={field.label}
                      mode="outlined"
                      label={field.label}
                      value={field.value ?? ""}
                      multiline={field.type === "textarea"}
                      onChangeText={() => {}}
                      style={{ backgroundColor: "white" }}
                      outlineStyle={{ borderRadius: 10 }}
                    />
                  ),
                )}
              </View>
            </Section>
          ) : null}

          {config.rows?.length ? (
            <Section title="Records">
              <View className="rounded-lg border border-dashed border-[#cbd5e1] bg-white p-5">
                <Text style={{ color: "#475569", fontWeight: "800" }}>No records loaded</Text>
                <Text variant="bodySmall" style={{ color: "#64748b", marginTop: 4 }}>
                  This screen needs its list API connected before it can show live records.
                </Text>
              </View>
            </Section>
          ) : null}

          {config.actions?.length ? (
            <Section title="Actions">
              <View className="gap-3">
                {config.actions.map((action) => (
                  <ActionTile
                    key={action.title}
                    title={action.title}
                    subtitle={action.subtitle}
                    icon={action.icon}
                    tone={action.tone ?? "blue"}
                    onPress={action.route ? () => (navigation as any).navigate(action.route) : undefined}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          <Button mode="contained" icon="check-circle-outline" style={{ borderRadius: 10 }} onPress={() => {}}>
            {config.primary ?? "Save"}
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

const configs: Record<string, ScreenConfig> = {
  Notifications: {
    title: "Notifications",
    subtitle: "In-app alerts linked to records.",
    tabs: ["All", "Unread"],
    stats: ["Unread: 0", "Today: 0"],
    rows: ["Cheque bounced alert", "Cash mismatch alert", "Rate change request alert", "Low stock alert"],
    primary: "Mark all read",
  },
  StaffWork: {
    title: "Staff Work",
    subtitle: "Daily staff workflows grouped by task.",
    actions: [
      { title: "Orders to Pack", subtitle: "View assigned packing work.", icon: "package-variant", route: "OrdersToPack" },
      { title: "New Sale", subtitle: "Choose walk-in or regular sale.", icon: "cart-plus", route: "NewSaleType" },
      { title: "Create DM", subtitle: "Record delivery memo stock out.", icon: "file-document-outline", route: "CreateDeliveryMemo" },
      { title: "Take Payment", subtitle: "Collect against an existing record.", icon: "cash-register", route: "TakePayment" },
      { title: "Stock Entry", subtitle: "Stock in, stock out, or damage/loss.", icon: "warehouse", route: "StockEntry" },
      { title: "Close Day", subtitle: "Submit cash reconciliation.", icon: "cash-check", route: "CloseDay", tone: "amber" },
    ],
    primary: "Open selected workflow",
  },
  OwnerRecords: {
    title: "Records",
    subtitle: "Orders, sales, DMs, customers, and cheques.",
    actions: [
      { title: "Order List", subtitle: "Browse and manage all orders.", icon: "clipboard-list-outline", route: "OrderList" },
      { title: "Sales List", subtitle: "Filter walk-in, regular, credit, and returns.", icon: "receipt", route: "SalesList" },
      { title: "DM List", subtitle: "Track pending and overdue delivery memos.", icon: "file-document-outline", route: "DeliveryMemoList" },
      { title: "Customer List", subtitle: "Manage registered customers.", icon: "account-group-outline", route: "CustomerList" },
      { title: "Cheque List", subtitle: "Track cheque lifecycle.", icon: "bank-check", route: "ChequeList" },
    ],
    primary: "Open records",
  },
  OwnerStock: {
    title: "Stock",
    subtitle: "Catalog, current stock, low stock, and movement audit.",
    actions: [
      { title: "Item List", subtitle: "Browse and edit item catalog.", icon: "shape-outline", route: "ItemList" },
      { title: "Stock Dashboard", subtitle: "Low stock and out-of-stock overview.", icon: "warehouse", route: "StockDashboard" },
      { title: "Stock Movement History", subtitle: "Full audit of stock changes.", icon: "history", route: "StockMovementHistory" },
      { title: "Set Opening Stock", subtitle: "One-time stock setup.", icon: "playlist-check", route: "SetOpeningStock" },
    ],
    primary: "Open stock tools",
  },
  OwnerAlerts: {
    title: "Alerts",
    subtitle: "Owner review queues and operational exceptions.",
    actions: [
      { title: "Payment Verification", subtitle: "Verify non-cash records.", icon: "check-decagram-outline", route: "PaymentVerification" },
      { title: "Cash Closing Review", subtitle: "Review day-close submissions.", icon: "cash-check", route: "CashClosingReview" },
      { title: "Rate Change Requests", subtitle: "Approve or reject rate requests.", icon: "tag-edit-outline", route: "RateChangeRequests" },
      { title: "Correction Requests", subtitle: "Review correction requests.", icon: "file-alert-outline", route: "CorrectionRequests" },
    ],
    primary: "Review alerts",
  },
  NewSaleType: {
    title: "New Sale",
    subtitle: "Choose sale type.",
    actions: [
      { title: "Walk-in / Counter Sale", subtitle: "No customer account. Fully paid now.", icon: "walk", route: "WalkInSale", tone: "green" },
      { title: "Regular Sale", subtitle: "Optional customer with split or pending payment.", icon: "account-cash-outline", route: "RegularSale" },
    ],
    primary: "Continue",
  },
  RegularSale: {
    title: "Regular Sale",
    subtitle: "Customer sale with split or pending payment.",
    stats: ["Subtotal: ₹0", "Paid: ₹0", "Balance: ₹0"],
    fields: [{ label: "Customer search" }, { label: "Due date" }],
    rows: ["Added item rows with qty, rate, discount, total", "Payment lines with Cash, UPI, Card, Bank, Cheque, Pending"],
    actions: [{ title: "Add Item", subtitle: "Open item picker.", icon: "plus-circle-outline" }, { title: "Split Payment", subtitle: "Record multiple modes.", icon: "cash-multiple", route: "SplitPayment" }],
    primary: "Complete Sale",
  },
  SplitPayment: {
    title: "Split Payment",
    subtitle: "Record multiple payment modes for one bill.",
    tabs: ["Cash", "UPI", "Card", "Bank"],
    stats: ["Bill Total: ₹0", "Paid: ₹0", "Balance: ₹0"],
    fields: [{ label: "Amount" }, { label: "Reference / UTR / Txn ID" }],
    rows: ["Cash payment line", "UPI payment line", "Cheque payment line", "Pending due line"],
    primary: "Done - Confirm Payment",
  },
  OrderDetail: detailConfig("Order Detail", "Full order view with packing, DM, sale, and request actions.", ["Start Packing", "Continue Packing", "Create DM", "Convert to Sale", "Request Correction"]),
  Packing: {
    title: "Packing",
    subtitle: "Mark ordered items as packed or shortage.",
    stats: ["Packed: 0 of 0", "Shortage: 0"],
    rows: ["Item row: qty ordered, qty packed, packed toggle, shortage reason"],
    fields: [{ label: "Staff notes", type: "textarea" }],
    primary: "Mark Order Packed",
  },
  Dispatch: {
    title: "Dispatch",
    subtitle: "Dispatch packed items and continue to DM or sale.",
    stats: ["Packed qty: 0", "Dispatch qty: 0"],
    fields: [{ label: "Dispatch date" }, { label: "Proof photo URL" }, { label: "Notes", type: "textarea" }],
    rows: ["Item dispatch row with qty to dispatch"],
    actions: [{ title: "Create DM", subtitle: "Use dispatch items.", icon: "file-document-outline", route: "CreateDeliveryMemo" }, { title: "Convert to Sale", subtitle: "Use dispatch items.", icon: "receipt", route: "RegularSale" }],
    primary: "Dispatch",
  },
  CreateDeliveryMemo: formConfig("Create Delivery Memo", "Record goods leaving without final payment.", ["Customer name", "Customer phone", "Customer address", "Expected payment date", "Reason for DM"], "Create DM"),
  DeliveryMemoList: listConfig("Delivery Memos", "Track delivery memos by payment and return status.", ["All", "Pending", "Overdue", "Paid"], ["DM-20260527-001 - ABC Traders - Balance ₹0", "DM-20260527-002 - Counter customer - Pending"]),
  DeliveryMemoDetail: detailConfig("Delivery Memo Detail", "Full DM record with payment, return, and correction actions.", ["Add Payment", "Mark Returned", "Request Correction", "Request Cancel"]),
  StockMovementHistory: listConfig("Stock Movement History", "Audit stock in, out, damage, and adjustments.", ["Today", "Last 7 Days", "All"], ["Cement - STOCK_IN - 20 bags", "Paint - DAMAGE_LOSS - 2 pcs"]),
  RequestCorrection: formConfig("Request Correction", "Ask owner to correct a record while preserving audit history.", ["Record type and number", "What needs to be corrected", "Reason / explanation"], "Submit Request"),
  RequestRateChange: formConfig("Request Rate Change", "Ask owner to approve a different rate on an order item.", ["Order number", "Item name", "Current rate", "Suggested rate", "Reason"], "Submit Request"),
  CreateOrder: formConfig("Create Order", "Three-step owner order flow: customer, items, review.", ["Customer", "Priority", "Expected dispatch date", "Owner notes", "Item, qty, rate, discount"], "Confirm & Send to Staff"),
  OrderList: listConfig("Orders", "Browse and manage all orders.", ["All", "Draft", "To Pack", "Packing"], ["ORD-20260527-001 - ABC Traders - To Pack", "ORD-20260527-002 - XYZ Store - Packing"]),
  RateChangeRequests: reviewConfig("Rate Change Requests", "Approve or reject staff rate change requests.", ["Current rate", "Suggested rate", "Difference", "Reason"]),
  PriceHistory: listConfig("Price History", "Item/customer rate history across orders, sales, and DMs.", ["Customer", "All"], ["ABC Traders - ₹390 - 12 May 2026", "XYZ Traders - ₹395 - 10 May 2026"]),
  SalesList: listConfig("Sales", "See all sales with full filters.", ["All", "Walk-in", "Regular", "Credit"], ["SAL-20260527-001 - Walk-in - ₹0", "SAL-20260527-002 - ABC Traders - Balance ₹0"]),
  SaleDetail: detailConfig("Sale Detail", "Full sale record with payment verification and owner controls.", ["Verify Payment", "Mark Mismatch", "Approve Correction", "Approve Cancellation"]),
  ChequeList: listConfig("Cheques", "Track cheque lifecycle.", ["All", "Received", "Deposited", "Cleared"], ["CHQ 123456 - ABC Traders - ₹0", "CHQ 998877 - XYZ Store - Deposited"]),
  ChequeDetail: detailConfig("Cheque Detail", "Cheque record, proof, and lifecycle management.", ["Mark Deposited", "Mark Cleared", "Mark Bounced", "Mark Returned"]),
  CustomerList: listConfig("Customers", "Browse and manage registered customers.", ["Active", "Inactive"], ["ABC Traders - Outstanding ₹0", "XYZ Store - Credit limit ₹0"]),
  AddEditCustomer: formConfig("Add / Edit Customer", "Create or update a customer profile.", ["Name", "Phone", "Address", "City", "GSTIN", "Credit limit", "Notes"], "Save Customer"),
  CustomerDetail: detailConfig("Customer Detail", "Customer profile, history, payments, outstanding, and price history.", ["Edit", "Record Payment", "Open Price History"]),
  CustomerOutstandingList: listConfig("Customer Outstanding", "All pending customer payments.", ["All", "Overdue", "Due Week"], ["ABC Traders - SAL-001 - Pending ₹0", "XYZ Store - DM-001 - Overdue"]),
  ItemList: listConfig("Items", "Browse and manage item catalog.", ["All", "Active", "Inactive", "Low Stock"], ["Cement - 45 bags - ₹390", "Paint - Low stock - ₹250"]),
  AddEditItem: formConfig("Add / Edit Item", "Create or update catalog item.", ["Name", "SKU", "Category", "Unit", "Default price", "Minimum price", "Purchase price", "MRP", "Minimum stock"], "Save Item"),
  ItemDetail: detailConfig("Item Detail", "Item stock, pricing, movement, and customer history.", ["Add Stock Entry", "Open Price History"]),
  StockDashboard: listConfig("Stock Dashboard", "Bird's-eye stock view with low and out-of-stock alerts.", ["All", "Low Stock", "Out of Stock"], ["Cement - 45 bags - Healthy", "Paint - 2 pcs - Low stock"]),
  CashSessionDetail: detailConfig("Cash Session Detail", "Owner review of staff cash close submission.", ["Approve & Mark Reviewed", "Flag Mismatch"]),
  CorrectionRequests: reviewConfig("Correction Requests", "Review staff correction requests.", ["Entity", "What to correct", "Reason", "Requested by"]),
  DailySummaryList: listConfig("Daily Summaries", "Browse past daily reports.", ["All", "Generated", "Locked"], ["27 May 2026 - Generated - Sales ₹0", "26 May 2026 - Locked - Difference ₹0"]),
  StaffManagement: listConfig("Staff Management", "Manage staff accounts and shop access.", ["Active", "Inactive"], ["Ravi Staff - 9999999999 - Assigned shops", "Priya Staff - Last login pending"]),
  AddEditStaff: formConfig("Add / Edit Staff", "Create or update staff account.", ["Name", "Mobile", "Password", "Status", "Shop assignments"], "Save Staff"),
  AuditLog: listConfig("Audit Log", "Full activity trail for owner oversight.", ["Today", "7 Days", "All"], ["Sale created - SAL-001", "Cheque marked bounced - CHQ 123456"]),
  Settings: formConfig("Settings", "Shop configuration, notification preferences, and account controls.", ["Shop name", "City", "Address", "Default opening cash", "Allow negative stock", "UPI reference required", "Card reference required"], "Save Settings"),
};

function formConfig(title: string, subtitle: string, labels: string[], primary: string): ScreenConfig {
  return { title, subtitle, fields: labels.map((label) => ({ label, type: label.toLowerCase().includes("notes") || label.toLowerCase().includes("reason") ? "textarea" : "input" })), primary };
}

function listConfig(title: string, subtitle: string, tabs: string[], rows: string[]): ScreenConfig {
  return { title, subtitle, tabs, stats: ["Count: 0", "Amount: ₹0"], rows, primary: "Export / Refresh" };
}

function reviewConfig(title: string, subtitle: string, labels: string[]): ScreenConfig {
  return {
    title,
    subtitle,
    tabs: ["Pending", "Approved", "Rejected", "All"],
    rows: ["Pending request card with approve/reject controls"],
    fields: labels.map((label) => ({ label, value: "--", type: "readonly" })),
    actions: [
      { title: "Approve", subtitle: "Confirm and notify staff.", icon: "check-circle-outline", tone: "green" },
      { title: "Reject", subtitle: "Capture rejection reason.", icon: "close-circle-outline", tone: "red" },
    ],
    primary: "Submit Decision",
  };
}

function detailConfig(title: string, subtitle: string, actions: string[]): ScreenConfig {
  return {
    title,
    subtitle,
    stats: ["Total: ₹0", "Paid: ₹0", "Balance: ₹0"],
    fields: [
      { label: "Record number", value: "--", type: "readonly" },
      { label: "Customer", value: "--", type: "readonly" },
      { label: "Status", value: "--", type: "readonly" },
    ],
    rows: ["Item/payment/history row", "Timeline event row"],
    actions: actions.map((title) => ({ title, subtitle: "Run this record action.", icon: "chevron-right-circle-outline" })),
    primary: "Save Changes",
  };
}

export function Notifications() {
  return <ConfiguredScreen config={configs.Notifications} />;
}

export function StaffWork() {
  return <ConfiguredScreen config={configs.StaffWork} />;
}

export function OwnerRecords() {
  const navigation = useNavigation();
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data;

  const navigate = (screen: string) => {
    (navigation as any).navigate(screen);
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Records Dashboard" subtitle="Manage orders, sales, delivery memos, and customers" />
      
      {dashboardQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Section title="RECORDS OVERVIEW">
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>TODAY SALES</Text>
                <Text style={styles.statValue}>₹{Number(dashboard?.todaySales ?? 0).toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>PENDING DM</Text>
                <Text style={styles.statValue}>₹{Number(dashboard?.pendingDmAmount ?? 0).toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>ORDERS TO PACK</Text>
                <Text style={styles.statValue}>{dashboard?.ordersToPack ?? 0}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>TODAY SALES COUNT</Text>
                <Text style={styles.statValue}>{dashboard?.salesCount ?? 0}</Text>
              </View>
            </View>
          </Section>

          <Section title="DATA MODULES">
            <View style={styles.gridContainer}>
              <ActionTile
                title="Order List"
                subtitle="Browse and manage customer orders"
                icon="clipboard-list-outline"
                tone="blue"
                onPress={() => navigate("OrderList")}
              />
              <ActionTile
                title="Sales List"
                subtitle="Walk-in, credit, and regular sales history"
                icon="receipt"
                tone="blue"
                onPress={() => navigate("SalesList")}
              />
              <ActionTile
                title="DM List"
                subtitle="Track pending and overdue delivery memos"
                icon="file-document-outline"
                tone="blue"
                onPress={() => navigate("DeliveryMemoList")}
              />
              <ActionTile
                title="Customer List"
                subtitle="Manage registered customers and balances"
                icon="account-group-outline"
                tone="blue"
                onPress={() => navigate("CustomerList")}
              />
              <ActionTile
                title="Cheque List"
                subtitle="Track received and pending bank cheques"
                icon="bank-check"
                tone="blue"
                onPress={() => navigate("ChequeList")}
              />
            </View>
          </Section>
        </ScrollView>
      )}
    </Screen>
  );
}

export function OwnerStock() {
  const navigation = useNavigation();
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data;

  const navigate = (screen: string) => {
    (navigation as any).navigate(screen);
  };

  const isLowStock = (dashboard?.lowStockAlerts ?? 0) > 0;
  const ownerName = user?.name ? user.name.split(/\s+/)[0] : "Owner";

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* Premium Reference-Style Greeting Header */}
      <View style={styles.dashboardHeader}>
        <View style={styles.headerUserRow}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>{ownerName.slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={styles.headerGreetingCol}>
            <Text style={styles.greetingGreeting}>☀️ GOOD MORNING! ^_^</Text>
            <Text style={styles.greetingName}>{ownerName} 👋</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerBtn} onPress={() => navigate("Updates")}>
            <Text style={styles.headerBtnText}>Shops</Text>
          </Pressable>
          <Pressable style={styles.headerIconBtn} onPress={() => navigate("NotificationHistory")}>
            <Icon source="bell-outline" size={20} color="#0f172a" />
            <View style={styles.redDot} />
          </Pressable>
        </View>
      </View>

      {dashboardQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Reference-Style 4-Card Metric Grid */}
          <Section title="INVENTORY OVERVIEW">
            <View style={styles.metricsGrid}>
              {/* Total Stock Value - Large Purple Filled Card */}
              <Pressable 
                style={[styles.metricCard, styles.metricCardPrimary]}
                onPress={() => navigate("ItemList")}
              >
                <View style={styles.metricCardHeader}>
                  <View style={styles.metricIconWrapperLight}>
                    <Icon source="layers-outline" size={24} color={colors.primary} />
                  </View>
                  <Icon source="arrow-up-right" size={20} color="#ffffff" />
                </View>
                <Text style={[styles.metricValue, { color: "#ffffff" }]}>₹14,52,180</Text>
                <Text style={[styles.metricLabel, { color: "rgba(255, 255, 255, 0.8)" }]}>Total Stock Value</Text>
              </Pressable>

              {/* Total Stock Card */}
              <Pressable 
                style={styles.metricCard}
                onPress={() => navigate("ItemList")}
              >
                <View style={styles.metricCardHeader}>
                  <View style={[styles.metricIconWrapper, { backgroundColor: "rgba(34, 197, 94, 0.08)" }]}>
                    <Icon source="database-outline" size={22} color={colors.primary} />
                  </View>
                  <Icon source="arrow-up-right" size={20} color="#64748b" />
                </View>
                <Text style={styles.metricValue}>1,284</Text>
                <Text style={styles.metricLabel}>Total Stock Units</Text>
              </Pressable>

              {/* Out of Stock Card */}
              <Pressable 
                style={styles.metricCard}
                onPress={() => navigate("StockDashboard")}
              >
                <View style={styles.metricCardHeader}>
                  <View style={[styles.metricIconWrapper, { backgroundColor: "rgba(220, 38, 38, 0.08)" }]}>
                    <Icon source="cube-off-outline" size={22} color={colors.danger} />
                  </View>
                  <Icon source="arrow-up-right" size={20} color="#64748b" />
                </View>
                <Text style={styles.metricValue}>08</Text>
                <Text style={styles.metricLabel}>Out of Stock</Text>
              </Pressable>

              {/* Low Stock Card */}
              <Pressable 
                style={styles.metricCard}
                onPress={() => navigate("StockDashboard")}
              >
                <View style={styles.metricCardHeader}>
                  <View style={[styles.metricIconWrapper, { backgroundColor: "rgba(217, 119, 6, 0.08)" }]}>
                    <Icon source="alert-circle-outline" size={22} color={colors.warning} />
                  </View>
                  <Icon source="arrow-up-right" size={20} color="#64748b" />
                </View>
                <Text style={styles.metricValue}>{dashboard?.lowStockAlerts ?? 0}</Text>
                <Text style={styles.metricLabel}>Low Stock Items</Text>
              </Pressable>
            </View>
          </Section>

          {/* Reference-Style Stock Flow Chart */}
          <Section title="STOCK FLOW">
            <View style={styles.chartContainer}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartSubtitle}>+18% Rise in Total inventory Units</Text>
                <View style={styles.chartDropdown}>
                  <Text style={styles.chartDropdownText}>Last 7 days</Text>
                  <Icon source="chevron-down" size={16} color="#64748b" />
                </View>
              </View>
              
              {/* Stacked area mockup columns */}
              <View style={styles.chartContent}>
                {/* Column 1 */}
                <View style={styles.chartCol}>
                  <View style={styles.chartBarWrapper}>
                    <View style={[styles.chartBarSegment, { height: "30%", backgroundColor: "rgba(22, 163, 74, 0.7)", borderTopLeftRadius: 6, borderTopRightRadius: 6 }]} />
                    <View style={[styles.chartBarSegment, { height: "15%", backgroundColor: "rgba(34, 197, 94, 0.5)" }]} />
                    <View style={[styles.chartBarSegment, { height: "20%", backgroundColor: "rgba(217, 119, 6, 0.4)" }]} />
                    <View style={[styles.chartBarSegment, { height: "15%", backgroundColor: "rgba(59, 130, 246, 0.3)", borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }]} />
                  </View>
                  <Text style={styles.chartColLabel}>45%</Text>
                </View>

                {/* Column 2 */}
                <View style={styles.chartCol}>
                  <View style={styles.chartBarWrapper}>
                    <View style={[styles.chartBarSegment, { height: "15%", backgroundColor: "rgba(22, 163, 74, 0.7)", borderTopLeftRadius: 6, borderTopRightRadius: 6 }]} />
                    <View style={[styles.chartBarSegment, { height: "10%", backgroundColor: "rgba(34, 197, 94, 0.5)" }]} />
                    <View style={[styles.chartBarSegment, { height: "10%", backgroundColor: "rgba(217, 119, 6, 0.4)" }]} />
                    <View style={[styles.chartBarSegment, { height: "15%", backgroundColor: "rgba(59, 130, 246, 0.3)", borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }]} />
                  </View>
                  <Text style={styles.chartColLabel}>20%</Text>
                </View>

                {/* Column 3 */}
                <View style={styles.chartCol}>
                  <View style={styles.chartBarWrapper}>
                    <View style={[styles.chartBarSegment, { height: "40%", backgroundColor: "rgba(22, 163, 74, 0.7)", borderTopLeftRadius: 6, borderTopRightRadius: 6 }]} />
                    <View style={[styles.chartBarSegment, { height: "20%", backgroundColor: "rgba(34, 197, 94, 0.5)" }]} />
                    <View style={[styles.chartBarSegment, { height: "15%", backgroundColor: "rgba(217, 119, 6, 0.4)" }]} />
                    <View style={[styles.chartBarSegment, { height: "15%", backgroundColor: "rgba(59, 130, 246, 0.3)", borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }]} />
                  </View>
                  <Text style={styles.chartColLabel}>50%</Text>
                </View>

                {/* Column 4 */}
                <View style={styles.chartCol}>
                  <View style={styles.chartBarWrapper}>
                    <View style={[styles.chartBarSegment, { height: "20%", backgroundColor: "rgba(22, 163, 74, 0.7)", borderTopLeftRadius: 6, borderTopRightRadius: 6 }]} />
                    <View style={[styles.chartBarSegment, { height: "15%", backgroundColor: "rgba(34, 197, 94, 0.5)" }]} />
                    <View style={[styles.chartBarSegment, { height: "10%", backgroundColor: "rgba(217, 119, 6, 0.4)" }]} />
                    <View style={[styles.chartBarSegment, { height: "10%", backgroundColor: "rgba(59, 130, 246, 0.3)", borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }]} />
                  </View>
                  <Text style={styles.chartColLabel}>35%</Text>
                </View>

                {/* Column 5 */}
                <View style={styles.chartCol}>
                  <View style={styles.chartBarWrapper}>
                    <View style={[styles.chartBarSegment, { height: "45%", backgroundColor: "rgba(22, 163, 74, 0.7)", borderTopLeftRadius: 6, borderTopRightRadius: 6 }]} />
                    <View style={[styles.chartBarSegment, { height: "20%", backgroundColor: "rgba(34, 197, 94, 0.5)" }]} />
                    <View style={[styles.chartBarSegment, { height: "20%", backgroundColor: "rgba(217, 119, 6, 0.4)" }]} />
                    <View style={[styles.chartBarSegment, { height: "15%", backgroundColor: "rgba(59, 130, 246, 0.3)", borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }]} />
                  </View>
                  <Text style={styles.chartColLabel}>100%</Text>
                </View>
              </View>
            </View>
          </Section>

          <Section title="INVENTORY TOOLS">
            <View style={styles.gridContainer}>
              <ActionTile
                title="Products Catalog"
                subtitle="Browse, edit, and add catalog items"
                icon="shape-outline"
                tone="blue"
                onPress={() => navigate("ItemList")}
              />
              <ActionTile
                title="Stock Dashboard"
                subtitle="View low stock and out-of-stock items"
                icon="warehouse"
                tone={isLowStock ? "red" : "blue"}
                onPress={() => navigate("StockDashboard")}
              />
              <ActionTile
                title="Stock Movement History"
                subtitle="Audit log of all stock entries and adjustments"
                icon="history"
                tone="blue"
                onPress={() => navigate("StockMovementHistory")}
              />
              <ActionTile
                title="Set Opening Stock"
                subtitle="One-time initial stock setup per item"
                icon="playlist-check"
                tone="blue"
                onPress={() => navigate("SetOpeningStock")}
              />
            </View>
          </Section>
        </ScrollView>
      )}
    </Screen>
  );
}

export function OwnerAlerts() {
  const navigation = useNavigation();
  const dashboardQuery = useOwnerDashboardQuery();
  const dashboard = dashboardQuery.data;

  const navigate = (screen: string) => {
    (navigation as any).navigate(screen);
  };

  const hasAlerts = 
    (dashboard?.paymentVerificationPending ?? 0) > 0 ||
    (dashboard?.cashMismatch ?? 0) > 0 ||
    (dashboard?.rateChangeRequests ?? 0) > 0 ||
    (dashboard?.correctionRequests ?? 0) > 0;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Owner Alerts" subtitle="Review queues and operational exceptions" />

      {dashboardQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {hasAlerts ? (
            <Section title="PENDING APPROVALS & EXCEPTIONS">
              <View style={styles.alertsContainer}>
                {/* Payment Verification */}
                <Pressable
                  onPress={() => navigate("PaymentVerification")}
                  style={({ pressed }) => [
                    styles.alertCard,
                    (dashboard?.paymentVerificationPending ?? 0) > 0 && styles.alertCardActive,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.alertContent}>
                    <Icon 
                      source="check-decagram-outline" 
                      size={28} 
                      color={(dashboard?.paymentVerificationPending ?? 0) > 0 ? colors.warning : colors.textMuted} 
                    />
                    <View style={styles.alertTextContainer}>
                      <Text style={styles.alertTitle}>Payment Verification</Text>
                      <Text style={styles.alertDesc}>UPI & Cheque payments awaiting clearance</Text>
                    </View>
                  </View>
                  <Text style={[
                    styles.alertBadge,
                    (dashboard?.paymentVerificationPending ?? 0) > 0 ? styles.alertBadgeWarning : styles.alertBadgeClean
                  ]}>
                    {dashboard?.paymentVerificationPending ?? 0}
                  </Text>
                </Pressable>

                {/* Cash Closing Review */}
                <Pressable
                  onPress={() => navigate("CashClosingReview")}
                  style={({ pressed }) => [
                    styles.alertCard,
                    (dashboard?.cashMismatch ?? 0) > 0 && styles.alertCardDanger,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.alertContent}>
                    <Icon 
                      source="cash-check" 
                      size={28} 
                      color={(dashboard?.cashMismatch ?? 0) > 0 ? colors.danger : colors.textMuted} 
                    />
                    <View style={styles.alertTextContainer}>
                      <Text style={styles.alertTitle}>Cash Session Mismatches</Text>
                      <Text style={styles.alertDesc}>Flagged staff shift close reports</Text>
                    </View>
                  </View>
                  <Text style={[
                    styles.alertBadge,
                    (dashboard?.cashMismatch ?? 0) > 0 ? styles.alertBadgeDanger : styles.alertBadgeClean
                  ]}>
                    {dashboard?.cashMismatch ?? 0}
                  </Text>
                </Pressable>

                {/* Rate Change Requests */}
                <Pressable
                  onPress={() => navigate("RateChangeRequests")}
                  style={({ pressed }) => [
                    styles.alertCard,
                    (dashboard?.rateChangeRequests ?? 0) > 0 && styles.alertCardActive,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.alertContent}>
                    <Icon 
                      source="tag-edit-outline" 
                      size={28} 
                      color={(dashboard?.rateChangeRequests ?? 0) > 0 ? colors.primary : colors.textMuted} 
                    />
                    <View style={styles.alertTextContainer}>
                      <Text style={styles.alertTitle}>Rate Approvals</Text>
                      <Text style={styles.alertDesc}>Staff discount override requests</Text>
                    </View>
                  </View>
                  <Text style={[
                    styles.alertBadge,
                    (dashboard?.rateChangeRequests ?? 0) > 0 ? styles.alertBadgeActive : styles.alertBadgeClean
                  ]}>
                    {dashboard?.rateChangeRequests ?? 0}
                  </Text>
                </Pressable>

                {/* Correction Requests */}
                <Pressable
                  onPress={() => navigate("CorrectionRequests")}
                  style={({ pressed }) => [
                    styles.alertCard,
                    (dashboard?.correctionRequests ?? 0) > 0 && styles.alertCardActive,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.alertContent}>
                    <Icon 
                      source="file-alert-outline" 
                      size={28} 
                      color={(dashboard?.correctionRequests ?? 0) > 0 ? colors.primary : colors.textMuted} 
                    />
                    <View style={styles.alertTextContainer}>
                      <Text style={styles.alertTitle}>Correction Requests</Text>
                      <Text style={styles.alertDesc}>Invoice edit & cancel approvals</Text>
                    </View>
                  </View>
                  <Text style={[
                    styles.alertBadge,
                    (dashboard?.correctionRequests ?? 0) > 0 ? styles.alertBadgeActive : styles.alertBadgeClean
                  ]}>
                    {dashboard?.correctionRequests ?? 0}
                  </Text>
                </Pressable>
              </View>
            </Section>
          ) : (
            <View style={styles.emptyContainer}>
              <Icon source="check-circle-outline" size={64} color={colors.success} />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptyDesc}>
                There are no pending payment verifications, session mismatches, or change approvals at this time.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

export function NewSaleType() {
  return <ConfiguredScreen config={configs.NewSaleType} />;
}

export function GenericPlannedScreen() {
  const route = useRoute();
  return <ConfiguredScreen config={configs[route.name] ?? { title: smartTitle(route.name), subtitle: "ShopControl screen.", primary: "Save" }} />;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 100,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: spacing.xs,
  },
  statCardDanger: {
    borderColor: "rgba(220, 38, 38, 0.25)",
    backgroundColor: "rgba(220, 38, 38, 0.01)",
  },
  statLabel: {
    fontSize: fontSize.xs - 2,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
  },
  statValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  gridContainer: {
    gap: spacing.md,
  },
  alertsContainer: {
    gap: spacing.md,
  },
  alertCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...shadow.sm,
  },
  alertCardActive: {
    borderColor: "rgba(217, 119, 6, 0.25)",
    backgroundColor: "rgba(217, 119, 6, 0.01)",
  },
  alertCardDanger: {
    borderColor: "rgba(220, 38, 38, 0.25)",
    backgroundColor: "rgba(220, 38, 38, 0.01)",
  },
  alertContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  alertTextContainer: {
    flex: 1,
    gap: 2,
  },
  alertTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  alertDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  alertBadge: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  alertBadgeClean: {
    backgroundColor: colors.surfaceOffset,
    color: colors.textSecondary,
  },
  alertBadgeWarning: {
    backgroundColor: "rgba(217, 119, 6, 0.1)",
    color: colors.warning,
  },
  alertBadgeDanger: {
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    color: colors.danger,
  },
  alertBadgeActive: {
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    color: colors.primary,
  },
  emptyContainer: {
    padding: spacing.huge,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  loadingContainer: {
    padding: spacing.huge,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  dashboardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  headerUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  headerGreetingCol: {
    gap: 2,
  },
  greetingGreeting: {
    fontSize: 9,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  greetingName: {
    fontSize: 18,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerBtnText: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  redDot: {
    position: "absolute",
    top: 10,
    right: 11,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  metricCard: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: spacing.sm,
  },
  metricCardPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  metricCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  metricIconWrapperLight: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: spacing.md,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chartSubtitle: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.success,
  },
  chartDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chartDropdownText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  chartContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 140,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  chartCol: {
    alignItems: "center",
    width: "15%",
    gap: spacing.xs,
  },
  chartBarWrapper: {
    width: 14,
    height: 100,
    backgroundColor: colors.surfaceOffset,
    borderRadius: 7,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  chartBarSegment: {
    width: "100%",
  },
  chartColLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
});
