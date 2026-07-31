"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { fetchOwnerDashboardApi } from "@/lib/api/client";
import { formatINR } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  Receipt,
  Users,
  ShieldAlert,
  AlertTriangle,
  CreditCard,
  ReceiptIndianRupee,
  FileCheck,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";

export default function DashboardPage() {
  const { token, activeShopId, user } = useAuthStore();

  const { data: dashboard, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", "owner", activeShopId],
    queryFn: () => fetchOwnerDashboardApi(token ?? "", { shopId: activeShopId ?? undefined }),
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const isOwner = user?.role === "OWNER";

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {isOwner ? "Owner Dashboard" : "Staff Hub"}
          </h1>
          <p className="text-xs text-muted-foreground">
            Real-time operational summary and action queues for active shop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
          <Link href="/sales/new">
            <Button size="sm" className="h-9 gap-1 font-bold text-xs">
              <Receipt className="h-3.5 w-3.5" />
              <span>New Sale (F8)</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary Financial & Operational Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Today's Sales
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {formatINR(dashboard?.todaySalesTotal ?? 0)}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
              <span>{dashboard?.todaySalesCount ?? 0} invoices created</span>
              <Link href="/sales" className="text-primary font-semibold flex items-center hover:underline">
                View <ArrowUpRight className="h-3 w-3 ml-0.5" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Customer Outstanding */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Outstanding Collections
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {formatINR(dashboard?.outstandingTotal ?? 0)}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
              <span>Total customer dues</span>
              <Link href="/customers?filter=outstanding" className="text-primary font-semibold flex items-center hover:underline">
                Ledger <ArrowUpRight className="h-3 w-3 ml-0.5" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Pending Verifications */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Pending Approvals
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {dashboard?.pendingVerifications ?? 0}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
              <span>Stock & price requests</span>
              <Link href="/approvals" className="text-primary font-semibold flex items-center hover:underline">
                Review <ArrowUpRight className="h-3 w-3 ml-0.5" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Low Stock Items
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {dashboard?.lowStockAlerts ?? 0}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
              <span>Below safety thresholds</span>
              <Link href="/inventory?filter=low_stock" className="text-primary font-semibold flex items-center hover:underline">
                Replenish <ArrowUpRight className="h-3 w-3 ml-0.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Action Queues Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Payment Approvals */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Payment Verification
              </CardTitle>
              <CreditCard className="h-4 w-4 text-indigo-500" />
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold">{dashboard?.paymentVerificationPending ?? 0}</div>
              <p className="text-[11px] text-muted-foreground">Bank/Cheque entries</p>
            </div>
            <Link href="/payments?filter=pending">
              <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold">
                Verify
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* GST Invoices Pending */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                GST Bills Pending
              </CardTitle>
              <FileCheck className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold">{dashboard?.gstInvoicesPendingCount ?? 0}</div>
              <p className="text-[11px] text-muted-foreground">Tally billing follow-up</p>
            </div>
            <Link href="/sales?filter=gst_pending">
              <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold">
                View Queue
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Cash Drawer Closing */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Cash Mismatch
              </CardTitle>
              <ReceiptIndianRupee className="h-4 w-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold">{dashboard?.cashMismatch ?? 0}</div>
              <p className="text-[11px] text-muted-foreground">Drawer differences</p>
            </div>
            <Link href="/cash-sessions">
              <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold">
                Audit
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Correction Requests */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Correction Requests
              </CardTitle>
              <ShieldAlert className="h-4 w-4 text-rose-500" />
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold">{dashboard?.correctionRequests ?? 0}</div>
              <p className="text-[11px] text-muted-foreground">Invoice edit requests</p>
            </div>
            <Link href="/corrections">
              <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold">
                Approve
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Operational Workflows & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-extrabold">Recent Shop Operations</CardTitle>
            <CardDescription>
              Audit log of real-time transactions across sales, payments & inventory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard?.recentActivity && dashboard.recentActivity.length > 0 ? (
              <div className="space-y-3">
                {dashboard.recentActivity.map((act) => (
                  <div key={act.id} className="flex items-center justify-between p-3 border rounded-lg bg-card/60 text-xs">
                    <div className="space-y-0.5">
                      <p className="font-bold text-slate-900 dark:text-slate-100">{act.description}</p>
                      <p className="text-muted-foreground">
                        {act.actorName ? `By ${act.actorName} • ` : ""}{act.timestamp}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase font-bold">
                      {act.type}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No recent activity logged for the active shop.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Operational Shortcuts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-extrabold">Shortcut Cheat Sheet</CardTitle>
            <CardDescription>
              Keyboard-first operational controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b">
              <span>New Sale</span>
              <kbd className="font-mono bg-muted border px-1.5 py-0.5 rounded text-[10px]">F8</kbd>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b">
              <span>Delivery Memo</span>
              <kbd className="font-mono bg-muted border px-1.5 py-0.5 rounded text-[10px]">Alt+F8</kbd>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b">
              <span>New Order</span>
              <kbd className="font-mono bg-muted border px-1.5 py-0.5 rounded text-[10px]">Ctrl+F8</kbd>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b">
              <span>Receive Payment</span>
              <kbd className="font-mono bg-muted border px-1.5 py-0.5 rounded text-[10px]">F6</kbd>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b">
              <span>Stock Entry</span>
              <kbd className="font-mono bg-muted border px-1.5 py-0.5 rounded text-[10px]">F9</kbd>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span>Go To Palette</span>
              <kbd className="font-mono bg-muted border px-1.5 py-0.5 rounded text-[10px]">Alt+G</kbd>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
