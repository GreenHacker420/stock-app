"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { fetchOwnerDashboardApi } from "@/lib/api/client";
import { formatINR } from "@/lib/utils";
import { HoverEffect } from "@/components/ui/card-hover-effect";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
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
  RefreshCw,
} from "lucide-react";

export default function DashboardPage() {
  const { token, activeShopId, user, startDate, endDate } = useAuthStore();

  const { data: dashboard, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", "owner", activeShopId, startDate, endDate],
    queryFn: () => fetchOwnerDashboardApi(token ?? "", { shopId: activeShopId ?? undefined, date: startDate }),
    enabled: !!token,
    retry: 1,
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

  if (isError) {
    return (
      <div className="p-8 border rounded-xl bg-card text-center space-y-4 my-8 shadow-xs">
        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Unable to load active shop dashboard metrics</div>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Make sure backend server is running on <code className="font-mono text-primary">http://localhost:6600</code> and user session is authenticated.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 text-xs">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry Connection
          </Button>
          <Link href="/login">
            <Button size="sm" className="h-9 font-bold text-xs">
              Sign In to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = user?.role === "OWNER";

  const statItems = [
    {
      title: "Today's Sales",
      description: `${dashboard?.todaySalesCount ?? 0} invoices created today`,
      value: formatINR(dashboard?.todaySalesTotal ?? 0),
      link: "/sales",
      badge: "View Sales Register",
      icon: <TrendingUp className="h-5 w-5 text-emerald-600" />,
    },
    {
      title: "Outstanding Collections",
      description: "Total outstanding customer dues",
      value: formatINR(dashboard?.outstandingTotal ?? 0),
      link: "/customers?filter=outstanding",
      badge: "View Ledgers",
      icon: <Users className="h-5 w-5 text-indigo-600" />,
    },
    {
      title: "Pending Approvals",
      description: "Stock & price verification requests",
      value: `${dashboard?.pendingVerifications ?? 0}`,
      link: "/approvals",
      badge: "Review Approvals",
      icon: <ShieldAlert className="h-5 w-5 text-amber-600" />,
    },
    {
      title: "Low Stock Items",
      description: "Products below reorder threshold",
      value: `${dashboard?.lowStockAlerts ?? 0}`,
      link: "/inventory?filter=low_stock",
      badge: "Replenish Inventory",
      icon: <AlertTriangle className="h-5 w-5 text-rose-600" />,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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

      {/* Aceternity UI Hover Effect Grid for Metrics */}
      <HoverEffect items={statItems} />

      {/* Secondary Action Queues Bento Grid */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Operational Action Queues
        </h2>
        <BentoGrid className="grid-cols-1 md:grid-cols-2 lg:grid-cols-4 max-w-none">
          <BentoGridItem
            title="Payment Verification"
            description={`${dashboard?.paymentVerificationPending ?? 0} Bank/Cheque entries pending review.`}
            icon={<CreditCard className="h-4 w-4 text-indigo-500" />}
            header={
              <Link href="/payments?filter=pending" className="flex justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs font-bold">Verify →</Button>
              </Link>
            }
          />
          <BentoGridItem
            title="GST Bills Pending"
            description={`${dashboard?.gstInvoicesPendingCount ?? 0} Tally billing follow-up entries.`}
            icon={<FileCheck className="h-4 w-4 text-amber-500" />}
            header={
              <Link href="/sales?filter=gst_pending" className="flex justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs font-bold">View Queue →</Button>
              </Link>
            }
          />
          <BentoGridItem
            title="Cash Mismatch"
            description={`${dashboard?.cashMismatch ?? 0} Cash drawer balances requiring audit.`}
            icon={<ReceiptIndianRupee className="h-4 w-4 text-purple-500" />}
            header={
              <Link href="/cash-sessions" className="flex justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs font-bold">Audit →</Button>
              </Link>
            }
          />
          <BentoGridItem
            title="Correction Requests"
            description={`${dashboard?.correctionRequests ?? 0} Invoice edit approval requests.`}
            icon={<ShieldAlert className="h-4 w-4 text-rose-500" />}
            header={
              <Link href="/corrections" className="flex justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs font-bold">Approve →</Button>
              </Link>
            }
          />
        </BentoGrid>
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
              <span>Select Date / Period</span>
              <kbd className="font-mono bg-muted border px-1.5 py-0.5 rounded text-[10px]">F2</kbd>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b">
              <span>Switch Shop</span>
              <kbd className="font-mono bg-muted border px-1.5 py-0.5 rounded text-[10px]">F3</kbd>
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
