"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Plus, Receipt, RefreshCw, Search, WalletCards } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeatureActionButton } from "@/components/workspace/FeatureActionButton";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { fetchSalesRegister } from "@/features/registers/api/register.queries";
import type { SaleRegisterRow } from "@/features/registers/lib/register-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { drilldownStack } from "@/lib/navigation/drilldown-stack";
import {
  consumeNavigationRestoration,
  peekNavigationRestoration,
  restoreNavigationFrame,
} from "@/lib/navigation/navigation-restoration";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDate, formatINR } from "@/lib/utils";

const PAGE_SIZE = 50;
const REPORT_ID = "sales.register";

function paymentBadge(status: SaleRegisterRow["paymentStatus"]) {
  if (status === "PAID") {
    return <Badge className="bg-emerald-600 text-[9px] text-white">Paid</Badge>;
  }
  if (status === "PARTIALLY_PAID") {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
        Part paid
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
      Unpaid
    </Badge>
  );
}

export default function SalesRegisterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, shops, activeShopId, startDate, endDate } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const restoration = peekNavigationRestoration(pathname);
  const restoredFilter = restoration?.filters?.pageFilter;
  const [pageFilter, setPageFilter] = useState(() => typeof restoredFilter === "string" ? restoredFilter : "");
  const filterInputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: queryKeys.sales.register({
      shopId,
      page,
      limit: PAGE_SIZE,
      dateFrom: startDate,
      dateTo: endDate,
    }),
    queryFn: () => fetchSalesRegister(token ?? "", {
      shopId,
      page,
      limit: PAGE_SIZE,
      dateFrom: startDate,
      dateTo: endDate,
    }),
    enabled: Boolean(token && shopId),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const value = pageFilter.trim().toLowerCase();
    if (!value) return query.data ?? [];
    return (query.data ?? []).filter((sale) =>
      sale.saleNumber.toLowerCase().includes(value) ||
      sale.customer?.name?.toLowerCase().includes(value) ||
      sale.customer?.phone?.toLowerCase().includes(value),
    );
  }, [pageFilter, query.data]);

  useEffect(() => {
    if (!restoration || query.isLoading || !query.data) return;
    restoreNavigationFrame(restoration);
    consumeNavigationRestoration(pathname);
  }, [pathname, query.data, query.isLoading, restoration]);

  const pageTotals = useMemo(() => (query.data ?? []).reduce(
    (total, sale) => ({
      amount: total.amount + Number(sale.totalAmount),
      paid: total.paid + Number(sale.paidAmount),
      balance: total.balance + Number(sale.balanceAmount),
      paidCount: total.paidCount + (sale.paymentStatus === "PAID" ? 1 : 0),
    }),
    { amount: 0, paid: 0, balance: 0, paidCount: 0 },
  ), [query.data]);

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };

  const openSale = useCallback((sale: SaleRegisterRow) => {
    drilldownStack.push({
      route: pathname,
      searchParams: searchParams.toString(),
      module: "sales",
      view: REPORT_ID,
      activePointer: activePointerStore.getPointer(),
      selectedIds: [...activePointerStore.getSelectedIds()],
      filters: { pageFilter },
      page,
      scrollOffset: window.scrollY,
    });
    router.push(`/sales/${sale.id}`);
  }, [page, pageFilter, pathname, router, searchParams]);

  const focusFilter = useCallback(() => {
    filterInputRef.current?.focus();
    filterInputRef.current?.select();
  }, []);

  const searchEscapeCommand = useMemo(() => ({
    id: "sales.register.search.close",
    title: "Return to Sales Register",
    execute: ({ target }: { target?: EventTarget | null }) => {
      if (target instanceof HTMLElement) target.blur();
      const pointer = activePointerStore.getPointer();
      const index = pointer?.zoneId === `${REPORT_ID}.rows` ? pointer.index : 0;
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-operational-report="${REPORT_ID}"] [data-operational-row="${index}"]`)
          ?.focus();
      });
    },
  }), []);
  useCommand(searchEscapeCommand);
  useKeybinding(useMemo(() => ({
    id: "sales-register-search-escape",
    key: "esc",
    command: searchEscapeCommand.id,
    when: "report.search && report.id == sales.register && input.editable && !dialog.open",
    priority: 160,
  }), [searchEscapeCommand.id]));

  const columns = useMemo<ColumnDef<SaleRegisterRow>[]>(() => [
    {
      accessorKey: "saleNumber",
      header: "Sale #",
      cell: ({ row }) => <span className="font-mono text-[11px] font-semibold text-foreground">{row.original.saleNumber}</span>,
    },
    {
      accessorKey: "saleDate",
      header: "Date",
      cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.saleDate)}</span>,
    },
    {
      id: "customer",
      header: "Customer",
      cell: ({ row }) => (
        <div className="min-w-[clamp(10rem,16vw,17rem)]">
          <div className="truncate font-semibold">{row.original.customer?.name || "Walk-in Customer"}</div>
          <div className="truncate text-[10px] text-muted-foreground">{row.original.customer?.phone || (row.original.isWalkin ? "Walk-in" : "No phone")}</div>
        </div>
      ),
    },
    {
      id: "items",
      header: "Items",
      cell: ({ row }) => <span className="numeric-cell block text-right text-muted-foreground">{row.original._count.items}</span>,
    },
    {
      accessorKey: "totalAmount",
      header: "Total",
      cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.totalAmount)}</span>,
    },
    {
      accessorKey: "balanceAmount",
      header: "Balance",
      cell: ({ row }) => <span className="numeric-cell block text-right font-medium text-rose-600 dark:text-rose-300">{formatINR(row.original.balanceAmount)}</span>,
    },
    {
      accessorKey: "paymentStatus",
      header: "Payment",
      cell: ({ row }) => <div className="text-right">{paymentBadge(row.original.paymentStatus)}</div>,
    },
    {
      id: "gst",
      header: "Invoice",
      cell: ({ row }) => (
        <div className="text-right">
          <Badge variant="secondary" className="text-[9px]">
            {row.original.gstRequired ? row.original.gstInvoiceStatus.replaceAll("_", " ") : "Non-GST"}
          </Badge>
        </div>
      ),
    },
  ], []);

  const searchScope = JSON.stringify({
    "report.focused": true,
    "report.id": REPORT_ID,
    "report.search": true,
    "keyboard.scope": "report.search",
  });

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Records · Sales"
        title="Sales register"
        description={`Server-authoritative sales for ${startDate} to ${endDate}. Staff automatically see only their own sales.`}
        icon={Receipt}
        actions={(
          <>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <FeatureActionButton featureId="SALE_CREATE" icon={Plus} />
          </>
        )}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Invoices on page" value={(query.data ?? []).length.toLocaleString("en-IN")} detail={`Page ${page} · up to ${PAGE_SIZE} records`} icon={FileText} loading={query.isLoading} />
        <WorkspaceMetric label="Sales value" value={formatINR(pageTotals.amount)} detail="Current server page" icon={Receipt} tone="info" loading={query.isLoading} />
        <WorkspaceMetric label="Collected" value={formatINR(pageTotals.paid)} detail={`${pageTotals.paidCount} invoices fully paid`} icon={WalletCards} tone="success" loading={query.isLoading} />
        <WorkspaceMetric label="Balance" value={formatINR(pageTotals.balance)} detail="Outstanding on current page" icon={WalletCards} tone={pageTotals.balance > 0 ? "warning" : "neutral"} loading={query.isLoading} />
      </WorkspaceMetricGrid>

      <WorkspacePanel title="Invoices and transactions" description="The backend does not expose register-wide text search yet, so this text filter applies only to the current server page.">
        <WorkspaceToolbar>
          <div
            className="relative w-[clamp(13rem,28vw,32rem)] max-w-full flex-1 sm:flex-none"
            data-keyboard-scope={searchScope}
          >
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={filterInputRef}
              value={pageFilter}
              onChange={(event) => setPageFilter(event.target.value)}
              placeholder="Filter this page by sale #, customer or phone…"
              className="h-9 bg-background pl-9 text-xs"
              aria-label="Filter Sales Register"
              aria-keyshortcuts="Control+F"
            />
          </div>
          <Badge variant="outline" className="h-8 text-[10px]">Business period: {startDate} → {endDate}</Badge>
        </WorkspaceToolbar>

        <OperationalDataTable
          id={REPORT_ID}
          data={rows}
          columns={columns}
          getRowId={(sale) => sale.id}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          onRowOpen={openSale}
          onFilterRequest={focusFilter}
          autoFocus
          emptyTitle="No sales found"
          emptyDescription={pageFilter ? "No records on this page match the filter." : "No sales were returned for the selected business period."}
          renderMobileCard={(sale) => (
            <div className="rounded-xl bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-semibold text-muted-foreground">{sale.saleNumber}</p>
                  <p className="mt-1 truncate text-sm font-semibold">{sale.customer?.name || "Walk-in Customer"}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(sale.saleDate)} · {sale._count.items} items</p>
                </div>
                {paymentBadge(sale.paymentStatus)}
              </div>
              <div className="mt-3 flex items-end justify-between gap-3 border-t pt-2">
                <div>
                  <p className="workspace-kicker">Balance</p>
                  <p className="numeric-cell mt-0.5 text-xs font-semibold text-rose-600">{formatINR(sale.balanceAmount)}</p>
                </div>
                <p className="numeric-cell text-base font-semibold">{formatINR(sale.totalAmount)}</p>
              </div>
            </div>
          )}
        />

        <div className="flex items-center justify-between border-t bg-muted/20 px-[clamp(0.7rem,1vw,1rem)] py-2.5 text-[10px] text-muted-foreground">
          <span>Page {page} · {(query.data ?? []).length} records returned</span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" className="h-8" disabled={(query.data ?? []).length < PAGE_SIZE} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
