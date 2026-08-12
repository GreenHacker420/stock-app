"use client";

import { BarChart3, CreditCard, PackageSearch, Receipt, ReceiptIndianRupee, ShoppingBag, Truck, UsersRound } from "lucide-react";

import { HoverEffect } from "@/components/ui/card-hover-effect";
import { Badge } from "@/components/ui/badge";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { useAuthStore } from "@/lib/auth/auth-store";

export default function ReportsPage() {
  const { startDate, endDate } = useAuthStore();

  const reports = [
    { title: "Sales Register", value: "Invoices", description: "Drill into the server-backed sales register for the selected business period.", link: "/sales", icon: <Receipt className="size-4" />, badge: "Open register" },
    { title: "Inventory", value: "Stock", description: "Physical, reserved and available stock with catalogue and movement views.", link: "/inventory", icon: <PackageSearch className="size-4" />, badge: "Open stock query" },
    { title: "Customers", value: "Ledger", description: "Customer master with outstanding and advance balances; drill into account activity.", link: "/customers", icon: <UsersRound className="size-4" />, badge: "Open customers" },
    { title: "Payments", value: "Collections", description: "Payment register with mode, verification and linked-document filters.", link: "/payments", icon: <CreditCard className="size-4" />, badge: "Open payments" },
    { title: "Orders", value: "Fulfilment", description: "Order queue with exact backend packing and dispatch statuses.", link: "/orders", icon: <ShoppingBag className="size-4" />, badge: "Open orders" },
    { title: "Delivery Memos", value: "Credit delivery", description: "Delivery documents with lifecycle, payment and outstanding balance state.", link: "/delivery-memos", icon: <Truck className="size-4" />, badge: "Open memos" },
    { title: "Expenses", value: "Cash outflow", description: "Cash-session expense register and verification status.", link: "/expenses", icon: <ReceiptIndianRupee className="size-4" />, badge: "Open expenses" },
    { title: "Analytics", value: "Trends", description: "Owner analytics and charts live on the dashboard and use a separate range selector.", link: "/dashboard", icon: <BarChart3 className="size-4" />, badge: "Open dashboard" },
  ];

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Analysis · Drill-down"
        title="Reports and operational views"
        description="This hub links only to report views that actually exist in the web dashboard. Placeholder Day Book and Audit Log routes have been removed until real report endpoints and pages are implemented."
        icon={BarChart3}
        meta={<Badge variant="outline" className="font-mono text-[9px]">Period · {startDate} → {endDate}</Badge>}
      />

      <WorkspacePanel title="Available reports" description="Aceternity hover cards are used here for discovery; transactional registers themselves stay dense and keyboard-first.">
        <div className="p-[clamp(0.45rem,0.75vw,0.8rem)]">
          <HoverEffect items={reports} />
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
