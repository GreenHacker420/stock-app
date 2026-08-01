"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { fetchOwnerDashboardApi, fetchStaffDashboardApi } from "@/lib/api/client";
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
  RefreshCw,
  ShoppingBag,
  Truck,
  Building,
} from "lucide-react";

export default function DashboardPage() {
  const { token, activeShopId, user, startDate } = useAuthStore();
  const isOwner = user?.role === "OWNER";

  const {
    data: ownerData,
    isLoading: isOwnerLoading,
    isError: isOwnerError,
    error: ownerError,
    refetch: refetchOwner,
  } = useQuery({
    queryKey: ["dashboard", "owner", activeShopId, startDate],
    queryFn: () => fetchOwnerDashboardApi(token ?? "", { shopId: activeShopId ?? undefined, date: startDate }),
    enabled: !!token && isOwner,
    retry: 1,
  });

  const {
    data: staffData,
    isLoading: isStaffLoading,
    isError: isStaffError,
    error: staffError,
    refetch: refetchStaff,
  } = useQuery({
    queryKey: ["dashboard", "staff", activeShopId, startDate],
    queryFn: () => fetchStaffDashboardApi(token ?? "", { shopId: activeShopId || "", date: startDate }),
    enabled: !!token && !isOwner && !!activeShopId,
    retry: 1,
  });

  const isLoading = isOwner ? isOwnerLoading : isStaffLoading;
  const isError = isOwner ? isOwnerError : isStaffError;
  const errorObj = isOwner ? ownerError : staffError;
  const refetch = isOwner ? refetchOwner : refetchStaff;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 border rounded-xl bg-card text-center space-y-4 my-8 max-w-2xl mx-auto shadow-xs">
        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Failed to load dashboard metrics
        </div>
        <p className="text-xs text-muted-foreground">
          {(errorObj as any)?.message || "An unexpected error occurred while loading dashboard metrics."}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 text-xs font-bold">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry Connection
          </Button>
          <Link href="/login">
            <Button size="sm" className="h-9 font-bold text-xs">
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              {isOwner ? "Owner Operations Console" : "Staff Today Summary"}
            </h1>
            <Badge variant="outline" className="text-[10px] font-mono">
              Business Date: {startDate}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time server-authoritative metrics for active shop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh Metrics</span>
          </Button>
          <Link href="/sales/new">
            <Button size="sm" className="h-9 gap-1 font-bold text-xs">
              <Receipt className="h-3.5 w-3.5" />
              <span>New Sale (F8)</span>
            </Button>
          </Link>
        </div>
      </div>

      {isOwner && ownerData && (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium">Today's Sales</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatINR(ownerData.todaySales)}</div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {ownerData.salesCount} Invoices • Walk-in: {formatINR(ownerData.walkinSales)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium">Collections & Cash</CardTitle>
                <CreditCard className="h-4 w-4 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatINR(ownerData.cashCollected + ownerData.upiCollected + ownerData.cardCollected + ownerData.bankCollected)}</div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Cash: {formatINR(ownerData.cashCollected)} • UPI: {formatINR(ownerData.upiCollected)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium">Pending DMs Amount</CardTitle>
                <Truck className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatINR(ownerData.pendingDmAmount)}</div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Unbilled delivery memo balance
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium">Low Stock Alerts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{ownerData.lowStockAlerts}</div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Items below minimum threshold
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Operational Action Queues */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Pending Approvals</span>
                <p className="text-lg font-extrabold">{ownerData.pendingApprovalRequests}</p>
              </div>
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Payment Verifications</span>
                <p className="text-lg font-extrabold">{ownerData.paymentVerificationPending}</p>
              </div>
              <FileCheck className="h-5 w-5 text-indigo-500" />
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Cash Mismatches</span>
                <p className="text-lg font-extrabold">{ownerData.cashMismatch}</p>
              </div>
              <ReceiptIndianRupee className="h-5 w-5 text-purple-500" />
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">GST Bills Pending</span>
                <p className="text-lg font-extrabold">{ownerData.gstInvoicesPendingCount}</p>
              </div>
              <Building className="h-5 w-5 text-emerald-500" />
            </Card>
          </div>

          {/* Orders & Customers Widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  <span>Order Fulfillment Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b">
                  <span>Orders Created Today</span>
                  <span className="font-bold">{ownerData.ordersCreated}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span>Orders to Pack</span>
                  <span className="font-bold text-amber-600">{ownerData.ordersToPack}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span>Orders Dispatched Today</span>
                  <span className="font-bold text-emerald-600">{ownerData.ordersDispatched}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>Customer Activity Summary</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b">
                  <span>New Customers Today</span>
                  <span className="font-bold">{ownerData.newCustomersToday}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span>Customers with Outstanding Balance</span>
                  <span className="font-bold text-indigo-600">{ownerData.outstandingCustomersCount}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span>Inactive Customers (30+ Days)</span>
                  <span className="font-bold text-rose-600">{ownerData.inactiveCustomersCount}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {!isOwner && staffData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium">My Sales Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatINR(staffData.salesTotal)}</div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {staffData.salesCount} Total Invoices
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium">Cash Collected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatINR(staffData.cashCollected)}</div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  UPI Recorded: {formatINR(staffData.upiRecorded)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium">Orders Packed & Dispatched</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{staffData.ordersPacked} / {staffData.ordersDispatched}</div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Day Close Status: <span className="font-bold text-primary">{staffData.dayCloseStatus}</span>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
