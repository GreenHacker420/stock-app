"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock3, RefreshCw, Search, Truck, WalletCards } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FeatureActionButton } from "@/components/workspace/FeatureActionButton";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { fetchDeliveryMemosRegister } from "@/features/registers/api/register.queries";
import type { DeliveryMemoRegisterRow } from "@/features/registers/lib/register-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDate, formatINR } from "@/lib/utils";

const PAGE_SIZE = 50;
const DM_STATUSES: DeliveryMemoRegisterRow["status"][] = ["CREATED", "PARTIALLY_PAID", "FULLY_PAID", "CONVERTED_TO_SALE", "RETURNED", "CANCELLED", "OVERDUE"];

function dmBadge(status: DeliveryMemoRegisterRow["status"]) {
  const className = status === "FULLY_PAID" || status === "CONVERTED_TO_SALE"
    ? "bg-emerald-600 text-white"
    : status === "OVERDUE" || status === "CANCELLED"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
      : status === "PARTIALLY_PAID"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-muted text-foreground";
  return <Badge className={`text-[9px] ${className}`}>{status.replaceAll("_", " ")}</Badge>;
}

export default function DeliveryMemosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, shops, activeShopId, startDate, endDate } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const statusParam = searchParams.get("status");
  const status = DM_STATUSES.includes(statusParam as DeliveryMemoRegisterRow["status"]) ? statusParam as DeliveryMemoRegisterRow["status"] : undefined;
  const [pageFilter, setPageFilter] = React.useState("");

  const query = useQuery({
    queryKey: queryKeys.deliveryMemos.register({ shopId, page, limit: PAGE_SIZE, dateFrom: startDate, dateTo: endDate, status }),
    queryFn: () => fetchDeliveryMemosRegister(token ?? "", { shopId, page, limit: PAGE_SIZE, dateFrom: startDate, dateTo: endDate, status }),
    enabled: Boolean(token && shopId),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => {
    const value = pageFilter.trim().toLowerCase();
    if (!value) return query.data ?? [];
    return (query.data ?? []).filter((memo) => memo.dmNumber.toLowerCase().includes(value) || memo.customer?.name?.toLowerCase().includes(value) || memo.customer?.phone?.toLowerCase().includes(value));
  }, [pageFilter, query.data]);

  const totals = React.useMemo(() => (query.data ?? []).reduce((acc, memo) => {
    acc.value += Number(memo.estimatedAmount);
    acc.balance += Number(memo.balanceAmount);
    if (memo.lifecycleStatus === "DISPATCHED") acc.dispatched += 1;
    if (memo.status === "OVERDUE") acc.overdue += 1;
    return acc;
  }, { value: 0, balance: 0, dispatched: 0, overdue: 0 }), [query.data]);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const columns = React.useMemo<ColumnDef<DeliveryMemoRegisterRow>[]>(() => [
    { accessorKey: "dmNumber", header: "DM #", cell: ({ row }) => <span className="font-mono text-[11px] font-semibold">{row.original.dmNumber}</span> },
    { accessorKey: "createdAt", header: "Created", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    { id: "customer", header: "Customer", cell: ({ row }) => <div className="min-w-[clamp(10rem,16vw,17rem)]"><div className="truncate font-semibold">{row.original.customer?.name || "—"}</div><div className="truncate text-[10px] text-muted-foreground">{row.original.customer?.phone || "No phone"}</div></div> },
    { id: "lifecycle", header: "Lifecycle", cell: ({ row }) => <Badge variant="outline" className="text-[9px]">{row.original.lifecycleStatus.replaceAll("_", " ")}</Badge> },
    { id: "items", header: "Lines", cell: ({ row }) => <span className="numeric-cell block text-right">{row.original.items.length}</span> },
    { accessorKey: "estimatedAmount", header: "Value", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.estimatedAmount)}</span> },
    { accessorKey: "balanceAmount", header: "Balance", cell: ({ row }) => <span className="numeric-cell block text-right text-rose-600 dark:text-rose-300">{formatINR(row.original.balanceAmount)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right">{dmBadge(row.original.status)}</div> },
  ], []);

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Records · Delivery"
        title="Delivery memo register"
        description="Credit-delivery documents with backend lifecycle, payment, return and invoicing state preserved separately."
        icon={Truck}
        actions={<><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button><FeatureActionButton featureId="DM_CREATE" icon={Truck} /></>}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Memos on page" value={(query.data ?? []).length} detail={`Page ${page} · up to ${PAGE_SIZE} records`} icon={Truck} loading={query.isLoading} />
        <WorkspaceMetric label="Memo value" value={formatINR(totals.value)} detail="Estimated value on current page" icon={WalletCards} tone="info" loading={query.isLoading} />
        <WorkspaceMetric label="Outstanding" value={formatINR(totals.balance)} detail="Balance on current page" icon={WalletCards} tone={totals.balance > 0 ? "warning" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Dispatched" value={totals.dispatched} detail={totals.overdue ? `${totals.overdue} overdue on this page` : "No overdue memos on this page"} icon={Clock3} tone={totals.overdue ? "danger" : "success"} loading={query.isLoading} />
      </WorkspaceMetricGrid>

      <WorkspacePanel title="Delivery documents" description="The backend status filter is applied server-side. Text search filters only this returned page because the current list API has no text-search parameter.">
        <WorkspaceToolbar>
          <div className="relative w-[clamp(13rem,26vw,30rem)] max-w-full flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} placeholder="Filter this page by DM # or customer…" className="h-9 bg-background pl-9 text-xs" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">{status ? status.replaceAll("_", " ") : "All statuses"}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[min(82vw,16rem)]"><DropdownMenuLabel>Memo status</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setParams({ status: null, page: null })}>All statuses</DropdownMenuItem>{DM_STATUSES.map((item) => <DropdownMenuItem key={item} onClick={() => setParams({ status: item, page: null })}>{item.replaceAll("_", " ")}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          <Badge variant="outline" className="h-8 text-[10px]">{startDate} → {endDate}</Badge>
        </WorkspaceToolbar>

        <OperationalDataTable
          data={rows}
          columns={columns}
          getRowId={(memo) => memo.id}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          emptyTitle="No delivery memos found"
          emptyDescription={pageFilter ? "No memo on this page matches the filter." : "No delivery memos were returned for the selected backend filters."}
          renderMobileCard={(memo) => <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[10px] text-muted-foreground">{memo.dmNumber}</p><p className="mt-1 truncate text-sm font-semibold">{memo.customer?.name || "Customer"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(memo.createdAt)} · {memo.lifecycleStatus.replaceAll("_", " ")}</p></div>{dmBadge(memo.status)}</div><div className="mt-3 flex items-end justify-between border-t pt-2"><span className="text-[10px] text-muted-foreground">Balance {formatINR(memo.balanceAmount)}</span><span className="numeric-cell text-base font-semibold">{formatINR(memo.estimatedAmount)}</span></div></div>}
        />

        <div className="flex items-center justify-between border-t bg-muted/20 px-[clamp(0.7rem,1vw,1rem)] py-2.5 text-[10px] text-muted-foreground"><span>Page {page} · {(query.data ?? []).length} records</span><div className="flex gap-1.5"><Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</Button><Button variant="outline" size="sm" className="h-8" disabled={(query.data ?? []).length < PAGE_SIZE} onClick={() => setParams({ page: String(page + 1) })}>Next</Button></div></div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
