"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock3, PackageCheck, RefreshCw, Search, ShoppingBag, WalletCards } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FeatureActionButton } from "@/components/workspace/FeatureActionButton";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { fetchOrdersRegister } from "@/features/registers/api/register.queries";
import type { OrderRegisterRow, OrderStatus } from "@/features/registers/lib/register-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDate, formatINR } from "@/lib/utils";

const PAGE_SIZE = 50;
const ORDER_STATUSES: OrderStatus[] = ["DRAFT", "CONFIRMED", "PACKING", "PARTIALLY_PACKED", "PACKED", "PARTIALLY_DISPATCHED", "DISPATCHED", "CANCELLED"];

function orderTone(status: OrderStatus) {
  if (status === "DISPATCHED") return "bg-emerald-600 text-white";
  if (status === "CANCELLED") return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
  if (status === "PACKING" || status === "PARTIALLY_PACKED" || status === "PARTIALLY_DISPATCHED") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "PACKED") return "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300";
  return "bg-muted text-foreground";
}

export default function OrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, shops, activeShopId, startDate, endDate } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const statusParam = searchParams.get("status");
  const status = ORDER_STATUSES.includes(statusParam as OrderStatus) ? statusParam as OrderStatus : undefined;
  const [pageFilter, setPageFilter] = React.useState("");

  const query = useQuery({
    queryKey: queryKeys.orders.register({ shopId, page, limit: PAGE_SIZE, dateFrom: startDate, dateTo: endDate, status }),
    queryFn: () => fetchOrdersRegister(token ?? "", { shopId, page, limit: PAGE_SIZE, dateFrom: startDate, dateTo: endDate, status }),
    enabled: Boolean(token && shopId),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => {
    const value = pageFilter.trim().toLowerCase();
    if (!value) return query.data ?? [];
    return (query.data ?? []).filter((order) => order.orderNumber.toLowerCase().includes(value) || order.customer?.name?.toLowerCase().includes(value) || order.customer?.phone?.toLowerCase().includes(value));
  }, [pageFilter, query.data]);

  const totals = React.useMemo(() => (query.data ?? []).reduce((acc, order) => {
    acc.value += Number(order.totalAmount);
    acc.balance += Number(order.balanceAmount);
    if (order.status === "PACKING" || order.status === "PARTIALLY_PACKED") acc.inPacking += 1;
    if (order.status === "DISPATCHED") acc.dispatched += 1;
    return acc;
  }, { value: 0, balance: 0, inPacking: 0, dispatched: 0 }), [query.data]);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const columns = React.useMemo<ColumnDef<OrderRegisterRow>[]>(() => [
    { accessorKey: "orderNumber", header: "Order #", cell: ({ row }) => <span className="font-mono text-[11px] font-semibold">{row.original.orderNumber}</span> },
    { accessorKey: "createdAt", header: "Created", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    { id: "customer", header: "Customer", cell: ({ row }) => <div className="min-w-[clamp(10rem,16vw,17rem)]"><div className="truncate font-semibold">{row.original.customer?.name || "—"}</div><div className="truncate text-[10px] text-muted-foreground">{row.original.customer?.phone || "No phone"}</div></div> },
    { accessorKey: "priority", header: "Priority", cell: ({ row }) => <Badge variant="outline" className="text-[9px]">{row.original.priority}</Badge> },
    { id: "items", header: "Lines", cell: ({ row }) => <span className="numeric-cell block text-right">{row.original.items.length}</span> },
    { accessorKey: "totalAmount", header: "Value", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.totalAmount)}</span> },
    { accessorKey: "balanceAmount", header: "Balance", cell: ({ row }) => <span className="numeric-cell block text-right text-rose-600 dark:text-rose-300">{formatINR(row.original.balanceAmount)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right"><Badge className={`text-[9px] ${orderTone(row.original.status)}`}>{row.original.status.replaceAll("_", " ")}</Badge></div> },
  ], []);

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Records · Fulfilment"
        title="Order register"
        description="Customer orders, reservation lifecycle and fulfilment state. Status values map directly to the backend OrderStatus enum."
        icon={ShoppingBag}
        actions={<><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button><FeatureActionButton featureId="ORDER_CREATE" icon={ShoppingBag} /></>}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Orders on page" value={(query.data ?? []).length.toLocaleString("en-IN")} detail={`Page ${page} · up to ${PAGE_SIZE} server records`} icon={ShoppingBag} loading={query.isLoading} />
        <WorkspaceMetric label="Order value" value={formatINR(totals.value)} detail="Current server page" icon={WalletCards} tone="info" loading={query.isLoading} />
        <WorkspaceMetric label="In packing" value={totals.inPacking} detail="PACKING + PARTIALLY PACKED" icon={Clock3} tone="warning" loading={query.isLoading} />
        <WorkspaceMetric label="Dispatched" value={totals.dispatched} detail="DISPATCHED on current page" icon={PackageCheck} tone="success" loading={query.isLoading} />
      </WorkspaceMetricGrid>

      <WorkspacePanel title="Fulfilment queue" description="Text search filters only the current server page. Status and business period are sent to the backend.">
        <WorkspaceToolbar>
          <div className="relative w-[clamp(13rem,26vw,30rem)] max-w-full flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} placeholder="Filter this page by order # or customer…" className="h-9 bg-background pl-9 text-xs" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">{status ? status.replaceAll("_", " ") : "All statuses"}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[min(82vw,15rem)]">
              <DropdownMenuLabel>Order status</DropdownMenuLabel><DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setParams({ status: null, page: null })}>All statuses</DropdownMenuItem>
              {ORDER_STATUSES.map((item) => <DropdownMenuItem key={item} onClick={() => setParams({ status: item, page: null })}>{item.replaceAll("_", " ")}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <Badge variant="outline" className="h-8 text-[10px]">{startDate} → {endDate}</Badge>
        </WorkspaceToolbar>

        <OperationalDataTable
          data={rows}
          columns={columns}
          getRowId={(order) => order.id}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          emptyTitle="No orders found"
          emptyDescription={pageFilter ? "No order on this page matches the filter." : "No orders were returned for the selected backend filters."}
          renderMobileCard={(order) => <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[10px] text-muted-foreground">{order.orderNumber}</p><p className="mt-1 truncate text-sm font-semibold">{order.customer?.name || "Customer"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(order.createdAt)} · {order.items.length} lines</p></div><Badge className={`text-[9px] ${orderTone(order.status)}`}>{order.status.replaceAll("_", " ")}</Badge></div><div className="mt-3 flex items-end justify-between border-t pt-2"><span className="text-[10px] text-muted-foreground">Balance {formatINR(order.balanceAmount)}</span><span className="numeric-cell text-base font-semibold">{formatINR(order.totalAmount)}</span></div></div>}
        />

        <div className="flex items-center justify-between border-t bg-muted/20 px-[clamp(0.7rem,1vw,1rem)] py-2.5 text-[10px] text-muted-foreground">
          <span>Page {page} · {(query.data ?? []).length} records</span>
          <div className="flex gap-1.5"><Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</Button><Button variant="outline" size="sm" className="h-8" disabled={(query.data ?? []).length < PAGE_SIZE} onClick={() => setParams({ page: String(page + 1) })}>Next</Button></div>
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
