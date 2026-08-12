"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CreditCard,
  FileCheck,
  PackageCheck,
  Receipt,
  ReceiptIndianRupee,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeatureActionButton } from "@/components/workspace/FeatureActionButton";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { DashboardAnalyticsSection } from "@/features/dashboard/components/DashboardAnalyticsSection";
import { fetchOwnerDashboardApi, fetchStaffDashboardApi } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { queryKeys } from "@/lib/query/query-keys";
import { formatINR } from "@/lib/utils";

function MetricHeader({ label, value, detail, icon: Icon, tone = "neutral" }: { label: string; value: string; detail: string; icon: React.ComponentType<{ className?: string }>; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const toneClass = tone === "success" ? "text-emerald-600 dark:text-emerald-300" : tone === "warning" ? "text-amber-600 dark:text-amber-300" : tone === "danger" ? "text-rose-600 dark:text-rose-300" : tone === "info" ? "text-indigo-600 dark:text-indigo-300" : "text-muted-foreground";
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="workspace-kicker">{label}</p>
        <p className="numeric-cell mt-1 text-[clamp(1.35rem,1.8vw,2rem)] font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>
      </div>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background/70 ${toneClass}`}><Icon className="size-4" /></span>
    </div>
  );
}

export default function DashboardPage() {
  const { token, activeShopId, user, startDate } = useAuthStore();
  const isOwner = user?.role === "OWNER";

  const ownerQuery = useQuery({
    queryKey: queryKeys.dashboard.owner(activeShopId, startDate),
    queryFn: () => fetchOwnerDashboardApi(token ?? "", { shopId: activeShopId ?? undefined, date: startDate }),
    enabled: Boolean(token && isOwner),
    staleTime: 30_000,
  });

  const staffQuery = useQuery({
    queryKey: queryKeys.dashboard.staff(activeShopId || "", startDate),
    queryFn: () => fetchStaffDashboardApi(token ?? "", { shopId: activeShopId || "", date: startDate }),
    enabled: Boolean(token && !isOwner && activeShopId),
    staleTime: 30_000,
  });

  const activeQuery = isOwner ? ownerQuery : staffQuery;
  const errorMessage = activeQuery.error instanceof Error ? activeQuery.error.message : "Dashboard metrics could not be loaded.";

  if (activeQuery.isLoading) {
    return (
      <WorkspacePage>
        <div className="flex items-center justify-between gap-3"><div className="space-y-2"><Skeleton className="h-7 w-[clamp(12rem,20vw,20rem)]"/><Skeleton className="h-4 w-[clamp(16rem,32vw,32rem)]"/></div><Skeleton className="h-9 w-[clamp(7rem,10vw,10rem)]"/></div>
        <div className="workspace-metric-grid">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-[clamp(6rem,11vh,8rem)] rounded-xl" />)}</div>
        <Skeleton className="h-[42vh] w-full rounded-xl" />
      </WorkspacePage>
    );
  }

  if (activeQuery.isError) {
    return (
      <WorkspacePage>
        <WorkspacePageHeader kicker="Live operations" title="Operations dashboard" description="The dashboard request failed; no server metrics have been replaced with zeros." backHref={null} icon={BarChart3} />
        <div className="workspace-panel flex min-h-[48vh] items-center justify-center p-[clamp(1rem,3vw,3rem)] text-center">
          <div className="w-[min(88vw,34rem)]"><AlertTriangle className="mx-auto mb-3 size-8 text-destructive"/><p className="text-sm font-semibold">Failed to load dashboard metrics</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{errorMessage}</p><Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => void activeQuery.refetch()}><RefreshCw className="size-3.5"/>Retry</Button></div>
        </div>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker={isOwner ? "Live operations · Owner" : "Live operations · Staff"}
        title={isOwner ? "Operations dashboard" : "My shift dashboard"}
        description="Server-authoritative business-date snapshot with live operational queues and range-based analytics."
        backHref={null}
        icon={BarChart3}
        meta={<Badge variant="outline" className="font-mono text-[9px]">Business date · {startDate}</Badge>}
        actions={<><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void activeQuery.refetch()}><RefreshCw className="size-3.5"/>Refresh</Button><FeatureActionButton featureId="SALE_CREATE" icon={Receipt}/></>}
      />

      {isOwner && ownerQuery.data ? (
        <div className="space-y-[var(--workspace-gap)]">
          <BentoGrid>
            <BentoGridItem
              className="min-h-[clamp(7rem,13vh,9rem)]"
              header={<MetricHeader label="Today's sales" value={formatINR(ownerQuery.data.todaySales)} detail={`${ownerQuery.data.salesCount} invoices · Walk-in ${formatINR(ownerQuery.data.walkinSales)}`} icon={TrendingUp} tone="success" />}
              title="Sales velocity"
              description="Authoritative sale totals for the selected business date."
            />
            <BentoGridItem
              className="min-h-[clamp(7rem,13vh,9rem)]"
              header={<MetricHeader label="Collections" value={formatINR(ownerQuery.data.cashCollected + ownerQuery.data.upiCollected + ownerQuery.data.cardCollected + ownerQuery.data.bankCollected)} detail={`Cash ${formatINR(ownerQuery.data.cashCollected)} · UPI ${formatINR(ownerQuery.data.upiCollected)}`} icon={CreditCard} tone="info" />}
              title="Collection mix"
              description="Verified and recorded collection channels from backend dashboard aggregation."
            />
            <BentoGridItem
              className="min-h-[clamp(7rem,13vh,9rem)]"
              header={<MetricHeader label="Pending DM value" value={formatINR(ownerQuery.data.pendingDmAmount)} detail="Unbilled delivery memo balance" icon={Truck} tone="warning" />}
              title="Credit delivery exposure"
              description="Outstanding value still represented by delivery memos."
            />
            <BentoGridItem
              className="min-h-[clamp(7rem,13vh,9rem)]"
              header={<MetricHeader label="Low stock" value={ownerQuery.data.lowStockAlerts.toLocaleString("en-IN")} detail="Below minimum available stock" icon={AlertTriangle} tone={ownerQuery.data.lowStockAlerts > 0 ? "danger" : "success"} />}
              title="Inventory exceptions"
              description="Use Inventory to drill into physical, reserved and available quantities."
            />
          </BentoGrid>

          <WorkspaceMetricGrid>
            <WorkspaceMetric label="Pending approvals" value={ownerQuery.data.pendingApprovalRequests} detail="Operational approval requests" icon={ShieldAlert} tone={ownerQuery.data.pendingApprovalRequests ? "warning" : "neutral"} />
            <WorkspaceMetric label="Payment verification" value={ownerQuery.data.paymentVerificationPending} detail="Receipts awaiting owner verification" icon={FileCheck} tone={ownerQuery.data.paymentVerificationPending ? "warning" : "neutral"} />
            <WorkspaceMetric label="Cash mismatches" value={ownerQuery.data.cashMismatch} detail="Cash-session discrepancies" icon={ReceiptIndianRupee} tone={ownerQuery.data.cashMismatch ? "danger" : "neutral"} />
            <WorkspaceMetric label="GST pending" value={ownerQuery.data.gstInvoicesPendingCount} detail={formatINR(ownerQuery.data.gstInvoicesPendingAmount)} icon={Building2} tone={ownerQuery.data.gstInvoicesPendingCount ? "info" : "neutral"} />
          </WorkspaceMetricGrid>

          <div className="workspace-two-column">
            <WorkspacePanel title="Order fulfilment" description="Snapshot of today's order queue from the dashboard service.">
              <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
                <SummaryLine label="Orders created" value={ownerQuery.data.ordersCreated} />
                <SummaryLine label="Orders to pack" value={ownerQuery.data.ordersToPack} tone={ownerQuery.data.ordersToPack ? "warning" : undefined} />
                <SummaryLine label="Orders dispatched" value={ownerQuery.data.ordersDispatched} tone="success" />
              </div>
            </WorkspacePanel>

            <WorkspacePanel title="Customer activity" description="Customer-account signals for the selected business date.">
              <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
                <SummaryLine label="New customers" value={ownerQuery.data.newCustomersToday} />
                <SummaryLine label="With outstanding balance" value={ownerQuery.data.outstandingCustomersCount} tone={ownerQuery.data.outstandingCustomersCount ? "warning" : undefined} />
                <SummaryLine label="Inactive 30+ days" value={ownerQuery.data.inactiveCustomersCount} tone={ownerQuery.data.inactiveCustomersCount ? "danger" : undefined} />
              </div>
            </WorkspacePanel>
          </div>

          <WorkspacePanel title="Owner analytics and trends" description="Date-range analytics are separate from the single business-date snapshot above.">
            <div className="p-[clamp(0.6rem,0.9vw,1rem)]"><DashboardAnalyticsSection /></div>
          </WorkspacePanel>
        </div>
      ) : null}

      {!isOwner && staffQuery.data ? (
        <WorkspaceMetricGrid>
          <WorkspaceMetric label="My sales" value={formatINR(staffQuery.data.salesTotal)} detail={`${staffQuery.data.salesCount} invoices today`} icon={Receipt} tone="success" />
          <WorkspaceMetric label="Cash collected" value={formatINR(staffQuery.data.cashCollected)} detail={`UPI recorded ${formatINR(staffQuery.data.upiRecorded)}`} icon={CreditCard} tone="info" />
          <WorkspaceMetric label="Orders packed" value={staffQuery.data.ordersPacked} detail={`${staffQuery.data.ordersDispatched} dispatched`} icon={ShoppingBag} />
          <WorkspaceMetric label="Delivery memos" value={staffQuery.data.dmsCreated} detail={formatINR(staffQuery.data.dmTotal)} icon={Truck} />
          <WorkspaceMetric label="Cheques received" value={staffQuery.data.chequesReceived} detail="Recorded during this business date" icon={ReceiptIndianRupee} />
          <WorkspaceMetric label="Day close" value={staffQuery.data.dayCloseStatus} detail={`${staffQuery.data.stockEntries} stock entries`} icon={PackageCheck} />
        </WorkspaceMetricGrid>
      ) : null}
    </WorkspacePage>
  );
}

function SummaryLine({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "text-emerald-600 dark:text-emerald-300" : tone === "warning" ? "text-amber-600 dark:text-amber-300" : tone === "danger" ? "text-rose-600 dark:text-rose-300" : "text-foreground";
  return <div className="flex min-h-[clamp(2.6rem,5vh,3.2rem)] items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className={`numeric-cell font-semibold ${toneClass}`}>{value.toLocaleString("en-IN")}</span></div>;
}
