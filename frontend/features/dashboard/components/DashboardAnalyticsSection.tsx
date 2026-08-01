"use client";

import { useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useOwnerDashboardAnalyticsQuery } from "../api/dashboard-analytics.query";
import { DashboardAnalyticsToolbar } from "./DashboardAnalyticsToolbar";
import { SalesTrendChart } from "./SalesTrendChart";
import { PaymentMixChart } from "./PaymentMixChart";
import { OrderStatusChart } from "./OrderStatusChart";
import { TopItemsChart } from "./TopItemsChart";
import { TopCustomersChart } from "./TopCustomersChart";
import { CustomerGrowthChart } from "./CustomerGrowthChart";
import { getPresetRange, formatINR } from "../lib/analytics-formatters";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, ReceiptIndianRupee, Banknote, TrendingDown } from "lucide-react";

function getDefaultRange() {
  return getPresetRange("30D");
}

export function DashboardAnalyticsSection() {
  const { token, activeShopId } = useAuthStore();

  const defaults = getDefaultRange();
  const [analyticsRange, setAnalyticsRange] = useState<{
    dateFrom: string;
    dateTo: string;
    granularity?: string;
  }>({
    dateFrom: defaults.dateFrom,
    dateTo: defaults.dateTo,
    granularity: "AUTO",
  });

  const { data, isLoading, isError, error } = useOwnerDashboardAnalyticsQuery({
    token,
    shopId: activeShopId,
    dateFrom: analyticsRange.dateFrom,
    dateTo: analyticsRange.dateTo,
    granularity: (analyticsRange.granularity as any) || "AUTO",
    topLimit: 5,
    enabled: true,
  });

  const handleRangeChange = useCallback(
    (range: { dateFrom: string; dateTo: string; granularity?: string }) => {
      setAnalyticsRange(range);
    },
    []
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <DashboardAnalyticsToolbar
        dateFrom={analyticsRange.dateFrom}
        dateTo={analyticsRange.dateTo}
        granularity={analyticsRange.granularity || "AUTO"}
        onRangeChange={handleRangeChange}
      />

      {/* Error State */}
      {isError && (
        <Alert variant="destructive" className="text-xs">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as any)?.message || "Failed to load analytics data. Please retry."}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-4">
            <Skeleton className="col-span-12 lg:col-span-8 h-80 rounded-xl" />
            <Skeleton className="col-span-12 lg:col-span-4 h-80 rounded-xl" />
          </div>
          <div className="grid grid-cols-12 gap-4">
            <Skeleton className="col-span-12 lg:col-span-4 h-64 rounded-xl" />
            <Skeleton className="col-span-12 lg:col-span-4 h-64 rounded-xl" />
            <Skeleton className="col-span-12 lg:col-span-4 h-64 rounded-xl" />
          </div>
        </div>
      )}

      {/* Analytics Content */}
      {!isLoading && !isError && data && (
        <div className="space-y-4">
          {/* Totals Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 flex items-center gap-3 bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/30">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                <TrendingUp className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Total Sales</p>
                <p className="text-base font-black text-slate-900 dark:text-slate-100">{formatINR(data.totals.salesAmount)}</p>
                <p className="text-[10px] text-muted-foreground">{data.totals.invoiceCount} invoices</p>
              </div>
            </Card>

            <Card className="p-3 flex items-center gap-3 bg-rose-50/60 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-800/30">
              <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/40">
                <TrendingDown className="h-4 w-4 text-rose-700 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wide">Recorded Expenses</p>
                <p className="text-base font-black text-slate-900 dark:text-slate-100">{formatINR(data.totals.expensesAmount)}</p>
                <p className="text-[10px] text-muted-foreground">Logged in period</p>
              </div>
            </Card>

            <Card className="p-3 flex items-center gap-3 bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200/60 dark:border-indigo-800/30">
              <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
                <ReceiptIndianRupee className="h-4 w-4 text-indigo-700 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide">Sales Less Expenses</p>
                <p className="text-base font-black text-slate-900 dark:text-slate-100">{formatINR(data.totals.salesLessRecordedExpenses)}</p>
                <p className="text-[10px] text-muted-foreground">Not net profit</p>
              </div>
            </Card>

            <Card className="p-3 flex items-center gap-3 bg-sky-50/60 dark:bg-sky-950/20 border-sky-200/60 dark:border-sky-800/30">
              <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/40">
                <Banknote className="h-4 w-4 text-sky-700 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wide">Total Collected</p>
                <p className="text-base font-black text-slate-900 dark:text-slate-100">{formatINR(data.totals.collectedAmount)}</p>
                <p className="text-[10px] text-muted-foreground">All payment modes</p>
              </div>
            </Card>
          </div>

          {/* Row 1: Sales Trend (wide) + Payment Mix (narrow) */}
          <div className="grid grid-cols-12 gap-4">
            <SalesTrendChart data={data.salesTrend} granularity={data.range.granularity} />
            <PaymentMixChart data={data.paymentMix} totalCollected={data.totals.collectedAmount} />
          </div>

          {/* Row 2: Order Status + Top Items + Top Customers */}
          <div className="grid grid-cols-12 gap-4">
            <OrderStatusChart data={data.orderStatus} />
            <TopItemsChart data={data.topItems} />
            <TopCustomersChart data={data.topCustomers} />
          </div>

          {/* Row 3: Customer Growth */}
          <div className="grid grid-cols-12 gap-4">
            <CustomerGrowthChart data={data.customerTrend} granularity={data.range.granularity} />
          </div>
        </div>
      )}
    </div>
  );
}
