"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, CircleDollarSign, CreditCard, RefreshCw, Search, WalletCards } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FeatureActionButton } from "@/components/workspace/FeatureActionButton";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { fetchPaymentsRegister } from "@/features/registers/api/register.queries";
import type { PaymentMode, PaymentRegisterRow, PaymentStatus } from "@/features/registers/lib/register-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDate, formatINR } from "@/lib/utils";

const PAGE_SIZE = 50;
const MODES: PaymentMode[] = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"];
const STATUSES: PaymentStatus[] = ["RECORDED", "VERIFIED", "REJECTED", "CANCELLED"];

function statusBadge(status: PaymentStatus) {
  if (status === "VERIFIED") return <Badge className="bg-emerald-600 text-[9px] text-white">Verified</Badge>;
  if (status === "RECORDED") return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Recorded</Badge>;
  return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{status}</Badge>;
}

function referenceOf(payment: PaymentRegisterRow) {
  if (payment.sale) return payment.sale.saleNumber;
  if (payment.order) return payment.order.orderNumber;
  if (payment.dmId) return `DM · ${payment.dmId.slice(0, 8)}`;
  return "Unlinked";
}

export default function PaymentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, shops, activeShopId } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const modeParam = searchParams.get("mode");
  const statusParam = searchParams.get("status");
  const paymentMode = MODES.includes(modeParam as PaymentMode) ? modeParam as PaymentMode : undefined;
  const status = STATUSES.includes(statusParam as PaymentStatus) ? statusParam as PaymentStatus : undefined;
  const unlinked = searchParams.get("unlinked") === "true";
  const [pageFilter, setPageFilter] = React.useState("");

  const query = useQuery({
    queryKey: queryKeys.payments.register({ shopId, page, limit: PAGE_SIZE, paymentMode, status, unlinked }),
    queryFn: () => fetchPaymentsRegister(token ?? "", { shopId, page, limit: PAGE_SIZE, paymentMode, status, unlinked: unlinked || undefined }),
    enabled: Boolean(token && shopId),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => {
    const value = pageFilter.trim().toLowerCase();
    if (!value) return query.data ?? [];
    return (query.data ?? []).filter((payment) => payment.customer?.name?.toLowerCase().includes(value) || payment.referenceNumber?.toLowerCase().includes(value) || referenceOf(payment).toLowerCase().includes(value));
  }, [pageFilter, query.data]);

  const totals = React.useMemo(() => (query.data ?? []).reduce((acc, payment) => {
    acc.amount += Number(payment.amount);
    if (payment.status === "VERIFIED") acc.verified += Number(payment.amount);
    if (payment.status === "RECORDED") acc.pending += Number(payment.amount);
    if (!payment.saleId && !payment.dmId && !payment.orderId) acc.unlinked += 1;
    return acc;
  }, { amount: 0, verified: 0, pending: 0, unlinked: 0 }), [query.data]);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const columns = React.useMemo<ColumnDef<PaymentRegisterRow>[]>(() => [
    { accessorKey: "receivedAt", header: "Received", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.receivedAt)}</span> },
    { id: "customer", header: "Customer", cell: ({ row }) => <div className="min-w-[clamp(10rem,16vw,17rem)]"><div className="truncate font-semibold">{row.original.customer?.name || "Walk-in / unassigned"}</div><div className="truncate text-[10px] text-muted-foreground">{row.original.customer?.phone || row.original.receivedBy?.name || "—"}</div></div> },
    { accessorKey: "paymentMode", header: "Mode", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.paymentMode.replaceAll("_", " ")}</Badge> },
    { id: "reference", header: "Linked document", cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{referenceOf(row.original)}</span> },
    { accessorKey: "referenceNumber", header: "Reference", cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.referenceNumber || "—"}</span> },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.amount)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right">{statusBadge(row.original.status)}</div> },
  ], []);

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Records · Collections"
        title="Payment register"
        description="Receipts are shown with the backend's RECORDED / VERIFIED / REJECTED / CANCELLED workflow and real linked-document references."
        icon={CreditCard}
        actions={<><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button><FeatureActionButton featureId="PAYMENT_CREATE" icon={CircleDollarSign} /></>}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Received on page" value={formatINR(totals.amount)} detail={`${(query.data ?? []).length} payments returned`} icon={WalletCards} loading={query.isLoading} />
        <WorkspaceMetric label="Verified value" value={formatINR(totals.verified)} detail="Backend VERIFIED receipts" icon={BadgeCheck} tone="success" loading={query.isLoading} />
        <WorkspaceMetric label="Awaiting verification" value={formatINR(totals.pending)} detail="Backend RECORDED receipts" icon={CreditCard} tone={totals.pending > 0 ? "warning" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Unlinked receipts" value={totals.unlinked} detail="No sale, DM or order reference" icon={CircleDollarSign} tone={totals.unlinked > 0 ? "info" : "neutral"} loading={query.isLoading} />
      </WorkspaceMetricGrid>

      <WorkspacePanel title="Collections and verification" description="Mode, status and unlinked filters are server-side. Text search filters only the current returned page.">
        <WorkspaceToolbar>
          <div className="relative w-[clamp(13rem,25vw,29rem)] max-w-full flex-1 sm:flex-none"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} placeholder="Filter current page by customer or reference…" className="h-9 bg-background pl-9 text-xs" /></div>
          <DropdownMenu><DropdownMenuTrigger className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">{paymentMode ? paymentMode.replaceAll("_", " ") : "All modes"}</DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>Payment mode</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={() => setParams({ mode: null, page: null })}>All modes</DropdownMenuItem>{MODES.map((item) => <DropdownMenuItem key={item} onClick={() => setParams({ mode: item, page: null })}>{item.replaceAll("_", " ")}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">{status || "All statuses"}</DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>Verification status</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={() => setParams({ status: null, page: null })}>All statuses</DropdownMenuItem>{STATUSES.map((item) => <DropdownMenuItem key={item} onClick={() => setParams({ status: item, page: null })}>{item}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
          <Button variant={unlinked ? "secondary" : "outline"} size="sm" className="h-9" onClick={() => setParams({ unlinked: unlinked ? null : "true", page: null })}>Unlinked only</Button>
        </WorkspaceToolbar>

        <OperationalDataTable
          data={rows}
          columns={columns}
          getRowId={(payment) => payment.id}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          emptyTitle="No payments found"
          emptyDescription={pageFilter ? "No payment on this page matches the filter." : "No payment was returned for the selected backend filters."}
          renderMobileCard={(payment) => <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">{payment.customer?.name || "Walk-in / unassigned"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(payment.receivedAt)} · {payment.paymentMode.replaceAll("_", " ")}</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">{referenceOf(payment)}</p></div>{statusBadge(payment.status)}</div><div className="mt-3 border-t pt-2 text-right numeric-cell text-base font-semibold">{formatINR(payment.amount)}</div></div>}
        />

        <div className="flex items-center justify-between border-t bg-muted/20 px-[clamp(0.7rem,1vw,1rem)] py-2.5 text-[10px] text-muted-foreground"><span>Page {page} · {(query.data ?? []).length} records</span><div className="flex gap-1.5"><Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</Button><Button variant="outline" size="sm" className="h-8" disabled={(query.data ?? []).length < PAGE_SIZE} onClick={() => setParams({ page: String(page + 1) })}>Next</Button></div></div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
