"use client";

import { useCallback, useState } from "react";
import { AlertCircle, Banknote, ReceiptIndianRupee, TrendingDown, TrendingUp } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useOwnerDashboardAnalyticsQuery } from "../api/dashboard-analytics.query";
import { formatINR, getPresetRange } from "../lib/analytics-formatters";
import type { Granularity } from "../lib/analytics-types";
import { CustomerGrowthChart } from "./CustomerGrowthChart";
import { DashboardAnalyticsToolbar } from "./DashboardAnalyticsToolbar";
import { OrderStatusChart } from "./OrderStatusChart";
import { PaymentMixChart } from "./PaymentMixChart";
import { SalesTrendChart } from "./SalesTrendChart";
import { TopCustomersChart } from "./TopCustomersChart";
import { TopItemsChart } from "./TopItemsChart";

function getDefaultRange() {
  return getPresetRange("30D");
}

export function DashboardAnalyticsSection() {
  const { token, activeShopId } = useAuthStore();
  const defaults = getDefaultRange();
  const [analyticsRange, setAnalyticsRange] = useState<{ dateFrom: string; dateTo: string; granularity: Granularity }>({
    dateFrom: defaults.dateFrom,
    dateTo: defaults.dateTo,
    granularity: "AUTO",
  });

  const query = useOwnerDashboardAnalyticsQuery({
    token,
    shopId: activeShopId,
    dateFrom: analyticsRange.dateFrom,
    dateTo: analyticsRange.dateTo,
    granularity: analyticsRange.granularity,
    topLimit: 5,
    enabled: true,
  });

  const handleRangeChange = useCallback((range: { dateFrom: string; dateTo: string; granularity?: string }) => {
    const granularity: Granularity = ["AUTO", "DAY", "WEEK", "MONTH"].includes(range.granularity || "")
      ? range.granularity as Granularity
      : "AUTO";
    setAnalyticsRange({ dateFrom: range.dateFrom, dateTo: range.dateTo, granularity });
  }, []);

  return (
    <div className="space-y-[var(--workspace-gap)]">
      <DashboardAnalyticsToolbar
        dateFrom={analyticsRange.dateFrom}
        dateTo={analyticsRange.dateTo}
        granularity={analyticsRange.granularity}
        onRangeChange={handleRangeChange}
      />

      {query.isError ? (
        <Alert variant="destructive" className="text-xs">
          <AlertCircle className="size-4" />
          <AlertDescription>{query.error instanceof Error ? query.error.message : "Failed to load analytics data."}</AlertDescription>
        </Alert>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-[var(--workspace-gap)]">
          <div className="workspace-two-column">
            <Skeleton className="h-[clamp(18rem,42vh,32rem)] rounded-xl" />
            <Skeleton className="h-[clamp(18rem,42vh,32rem)] rounded-xl" />
          </div>
          <div className="workspace-grid-auto">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[clamp(16rem,34vh,26rem)] rounded-xl" />)}
          </div>
        </div>
      ) : null}

      {!query.isLoading && !query.isError && query.data ? (
        <div className="space-y-[var(--workspace-gap)]">
          <div className="workspace-metric-grid">
            <AnalyticsMetric label="Total sales" value={formatINR(query.data.totals.salesAmount)} detail={`${query.data.totals.invoiceCount} invoices`} icon={TrendingUp} tone="success" />
            <AnalyticsMetric label="Recorded expenses" value={formatINR(query.data.totals.expensesAmount)} detail="Logged in selected period" icon={TrendingDown} tone="danger" />
            <AnalyticsMetric label="Sales less expenses" value={formatINR(query.data.totals.salesLessRecordedExpenses)} detail="Operational metric, not net profit" icon={ReceiptIndianRupee} tone="info" />
            <AnalyticsMetric label="Total collected" value={formatINR(query.data.totals.collectedAmount)} detail="All payment modes" icon={Banknote} tone="neutral" />
          </div>

          <div className="grid min-w-0 grid-cols-12 gap-[var(--workspace-gap)]">
            <SalesTrendChart data={query.data.salesTrend} granularity={query.data.range.granularity} />
            <PaymentMixChart data={query.data.paymentMix} totalCollected={query.data.totals.collectedAmount} />
          </div>

          <div className="grid min-w-0 grid-cols-12 gap-[var(--workspace-gap)]">
            <OrderStatusChart data={query.data.orderStatus} />
            <TopItemsChart data={query.data.topItems} />
            <TopCustomersChart data={query.data.topCustomers} />
          </div>

          <div className="grid min-w-0 grid-cols-12 gap-[var(--workspace-gap)]">
            <CustomerGrowthChart data={query.data.customerTrend} granularity={query.data.range.granularity} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AnalyticsMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "neutral" | "success" | "danger" | "info";
}) {
  const toneClass = tone === "success" ? "text-emerald-600 dark:text-emerald-300" : tone === "danger" ? "text-rose-600 dark:text-rose-300" : tone === "info" ? "text-indigo-600 dark:text-indigo-300" : "text-muted-foreground";
  return (
    <Card className="flex min-h-[clamp(5.5rem,10vh,7rem)] items-center gap-3 rounded-xl p-[clamp(0.7rem,0.9vw,1rem)] shadow-none">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/25 ${toneClass}`}><Icon className="size-4" /></span>
      <div className="min-w-0"><p className="workspace-kicker">{label}</p><p className="numeric-cell mt-1 truncate text-[clamp(0.95rem,1.15vw,1.25rem)] font-semibold">{value}</p><p className="mt-0.5 truncate text-[9px] text-muted-foreground">{detail}</p></div>
    </Card>
  );
}
