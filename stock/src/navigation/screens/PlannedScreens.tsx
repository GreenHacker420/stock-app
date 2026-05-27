import { useNavigation, useRoute } from "@react-navigation/native";
import { ScrollView, View } from "react-native";
import { Button, Divider, Searchbar, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

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

  return (
    <Screen scroll={false}>
      <AppHeader title={config.title} subtitle={config.subtitle} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
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
              <View className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
                {config.rows.map((row, index) => (
                  <View key={row}>
                    {index > 0 ? <Divider /> : null}
                    <View className="p-4">
                      <Text style={{ color: "#111827", fontWeight: "800" }}>{row}</Text>
                      <Text variant="bodySmall" style={{ color: "#64748b", marginTop: 4 }}>
                        Tap to open detail, verify status, or continue the workflow.
                      </Text>
                    </View>
                  </View>
                ))}
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
  return <ConfiguredScreen config={configs.OwnerRecords} />;
}

export function OwnerStock() {
  return <ConfiguredScreen config={configs.OwnerStock} />;
}

export function OwnerAlerts() {
  return <ConfiguredScreen config={configs.OwnerAlerts} />;
}

export function NewSaleType() {
  return <ConfiguredScreen config={configs.NewSaleType} />;
}

export function GenericPlannedScreen() {
  const route = useRoute();
  return <ConfiguredScreen config={configs[route.name] ?? { title: smartTitle(route.name), subtitle: "ShopControl screen.", primary: "Save" }} />;
}
