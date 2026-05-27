import { useNavigation, useRoute } from "@react-navigation/native";
import { ScrollView, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { ActionTile } from "../../components/ui/ActionTile";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

type PlannedScreenConfig = {
  title: string;
  subtitle: string;
  status?: "Ready" | "API pending" | "Planned";
  actions?: Array<{ title: string; subtitle: string; icon: string; route?: string }>;
  metrics?: string[];
};

function PlannedScreen({ config }: { config: PlannedScreenConfig }) {
  const route = useRoute();
  const navigation = useNavigation();
  const params = route.params as Record<string, unknown> | undefined;

  return (
    <Screen scroll={false}>
      <AppHeader title={config.title} subtitle={config.subtitle} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="gap-4">
          <Section title="Status">
            <View className="gap-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
              <View className="flex-row flex-wrap gap-2">
                <StatusPill label={config.status ?? "Planned"} tone={config.status === "Ready" ? "green" : "amber"} />
                <StatusPill label="Route registered" tone="blue" />
              </View>
              <Text style={{ color: "#4b5563", lineHeight: 20 }}>
                This screen is part of the ShopControl rollout and is available in navigation. The next pass wires its form, filters,
                validation, and API actions to the backend contract.
              </Text>
              {params ? (
                <Text variant="bodySmall" style={{ color: "#64748b" }}>
                  Params: {JSON.stringify(params)}
                </Text>
              ) : null}
            </View>
          </Section>

          {config.metrics?.length ? (
            <Section title="Planned sections">
              <View className="gap-2">
                {config.metrics.map((metric) => (
                  <View key={metric} className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-3">
                    <Text style={{ color: "#111827", fontWeight: "700" }}>{metric}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {config.actions?.length ? (
            <Section title="Related actions">
              <View className="gap-3">
                {config.actions.map((action) => (
                  <ActionTile
                    key={action.title}
                    title={action.title}
                    subtitle={action.subtitle}
                    icon={action.icon}
                    tone="blue"
                    onPress={action.route ? () => (navigation as any).navigate(action.route) : undefined}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          <Button mode="outlined" icon="progress-wrench" style={{ borderRadius: 8 }}>
            Full API wiring scheduled
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

const staffDailyActions = [
  { title: "Orders to Pack", subtitle: "View assigned packing work.", icon: "package-variant", route: "OrdersToPack" },
  { title: "New Sale", subtitle: "Choose walk-in or regular sale.", icon: "cart-plus", route: "NewSaleType" },
  { title: "Create DM", subtitle: "Record delivery memo stock out.", icon: "file-document-outline", route: "CreateDeliveryMemo" },
  { title: "Take Payment", subtitle: "Collect against an existing record.", icon: "cash-register", route: "TakePayment" },
];

export function Notifications() {
  return (
    <PlannedScreen
      config={{
        title: "Notifications",
        subtitle: "Unread alerts and record-linked activity.",
        metrics: ["All and unread filters", "Swipe to mark read", "Tap through to linked sale, DM, order, cheque, or request"],
      }}
    />
  );
}

export function StaffWork() {
  return (
    <PlannedScreen
      config={{
        title: "Staff Work",
        subtitle: "Daily staff workflows grouped by task.",
        status: "Ready",
        actions: staffDailyActions,
      }}
    />
  );
}

export function OwnerRecords() {
  return (
    <PlannedScreen
      config={{
        title: "Records",
        subtitle: "Orders, sales, DMs, customers, and cheques.",
        status: "Ready",
        actions: [
          { title: "Order List", subtitle: "Browse and manage all orders.", icon: "clipboard-list-outline", route: "OrderList" },
          { title: "Sales List", subtitle: "Filter walk-in, regular, credit, and returns.", icon: "receipt", route: "SalesList" },
          { title: "DM List", subtitle: "Track pending and overdue delivery memos.", icon: "file-document-outline", route: "DeliveryMemoList" },
          { title: "Customer List", subtitle: "Manage registered customers.", icon: "account-group-outline", route: "CustomerList" },
        ],
      }}
    />
  );
}

export function OwnerStock() {
  return (
    <PlannedScreen
      config={{
        title: "Stock",
        subtitle: "Catalog, current stock, low stock, and movement audit.",
        status: "Ready",
        actions: [
          { title: "Item List", subtitle: "Browse and edit item catalog.", icon: "shape-outline", route: "ItemList" },
          { title: "Stock Dashboard", subtitle: "Low stock and out-of-stock overview.", icon: "warehouse", route: "StockDashboard" },
          { title: "Stock Movement History", subtitle: "Full audit of stock changes.", icon: "history", route: "StockMovementHistory" },
        ],
      }}
    />
  );
}

export function OwnerAlerts() {
  return (
    <PlannedScreen
      config={{
        title: "Alerts",
        subtitle: "Owner review queues and operational exceptions.",
        status: "Ready",
        actions: [
          { title: "Payment Verification", subtitle: "Verify UPI, card, bank, and cheque records.", icon: "check-decagram-outline", route: "PaymentVerification" },
          { title: "Cash Closing Review", subtitle: "Review day-close submissions.", icon: "cash-check", route: "CashClosingReview" },
          { title: "Rate Change Requests", subtitle: "Approve or reject staff rate requests.", icon: "tag-edit-outline", route: "RateChangeRequests" },
          { title: "Correction Requests", subtitle: "Review correction requests.", icon: "file-alert-outline", route: "CorrectionRequests" },
        ],
      }}
    />
  );
}

export function NewSaleType() {
  return (
    <PlannedScreen
      config={{
        title: "New Sale",
        subtitle: "Choose walk-in or regular customer sale.",
        status: "Ready",
        metrics: ["Walk-in sale blocks credit and requires full payment", "Regular sale supports customer account and pending balance"],
        actions: [
          { title: "Walk-in / Counter Sale", subtitle: "No customer account. Fully paid now.", icon: "walk", route: "WalkInSale" },
          { title: "Regular Sale", subtitle: "Optional customer with split or pending payment.", icon: "account-cash-outline", route: "RegularSale" },
        ],
      }}
    />
  );
}

export function GenericPlannedScreen() {
  const route = useRoute();
  return (
    <PlannedScreen
      config={{
        title: route.name.replace(/([A-Z])/g, " $1").trim(),
        subtitle: "ShopControl rollout screen.",
        metrics: ["Filters and list/detail states", "Create or update form", "Role-aware API actions", "Empty, loading, and error states"],
      }}
    />
  );
}
