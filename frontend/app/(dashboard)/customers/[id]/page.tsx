"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, CreditCard, FileText, MapPin, Phone, RefreshCw, TrendingUp, UserRound, WalletCards } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { fetchCustomerLedger, fetchCustomerLedgerSummary, fetchCustomerSummary } from "@/features/customers/api/customer-detail.queries";
import type { CustomerLedgerEntry } from "@/features/customers/lib/customer-detail-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDate, formatDateTime, formatINR } from "@/lib/utils";

function directionBadge(direction: "DEBIT" | "CREDIT") {
  return direction === "DEBIT"
    ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">Debit</Badge>
    : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[9px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Credit</Badge>;
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, shops, activeShopId, startDate, endDate } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";

  const customerQuery = useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => fetchCustomerSummary(token ?? "", id),
    enabled: Boolean(token && id),
    staleTime: 45_000,
  });

  const ledgerSummaryQuery = useQuery({
    queryKey: queryKeys.customers.ledgerSummary(id, shopId, startDate, endDate),
    queryFn: () => fetchCustomerLedgerSummary(token ?? "", id, { shopId, from: startDate, to: endDate }),
    enabled: Boolean(token && id && shopId),
    staleTime: 30_000,
  });

  const ledgerQuery = useQuery({
    queryKey: queryKeys.customers.ledger(id, { shopId, from: startDate, to: endDate, limit: 50 }),
    queryFn: () => fetchCustomerLedger(token ?? "", id, { shopId, from: startDate, to: endDate, limit: 50 }),
    enabled: Boolean(token && id && shopId),
    staleTime: 30_000,
  });

  const customer = customerQuery.data;
  const ledgerSummary = ledgerSummaryQuery.data;

  const ledgerColumns: ColumnDef<CustomerLedgerEntry>[] = [
    { accessorKey: "effectiveAt", header: "Effective", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.effectiveAt)}</span> },
    { accessorKey: "entryType", header: "Entry", cell: ({ row }) => <div><div className="text-[10px] font-semibold">{row.original.entryType.replaceAll("_", " ")}</div><div className="text-[9px] text-muted-foreground">{row.original.sourceType.replaceAll("_", " ")}</div></div> },
    { accessorKey: "direction", header: "Side", cell: ({ row }) => directionBadge(row.original.direction) },
    { accessorKey: "notes", header: "Notes", cell: ({ row }) => <div className="w-[clamp(10rem,20vw,26rem)] truncate text-muted-foreground" title={row.original.notes || row.original.reversalReason || undefined}>{row.original.notes || row.original.reversalReason || "—"}</div> },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.amount)}</span> },
    { accessorKey: "runningBalance", header: "Running balance", cell: ({ row }) => <span className={`numeric-cell block text-right font-semibold ${row.original.runningBalance > 0 ? "text-rose-600 dark:text-rose-300" : row.original.runningBalance < 0 ? "text-emerald-600 dark:text-emerald-300" : ""}`}>{formatINR(Math.abs(row.original.runningBalance))}{row.original.runningBalance < 0 ? " Cr" : row.original.runningBalance > 0 ? " Dr" : ""}</span> },
    { id: "state", header: "State", cell: ({ row }) => <div className="text-right">{row.original.isReversal ? <Badge variant="secondary" className="text-[9px]">Reversal</Badge> : row.original.isReversed ? <Badge variant="outline" className="text-[9px]">Reversed</Badge> : <span className="text-[10px] text-muted-foreground">Posted</span>}</div> },
  ];

  if (customerQuery.isLoading) {
    return <WorkspacePage><div className="workspace-panel flex min-h-[54vh] items-center justify-center text-xs text-muted-foreground">Loading customer account…</div></WorkspacePage>;
  }

  if (customerQuery.isError || !customer) {
    return <WorkspacePage><WorkspacePageHeader kicker="Accounts · Customer" title="Customer account" description="The customer profile could not be loaded." backHref="/customers" icon={UserRound} /><div className="workspace-panel flex min-h-[46vh] items-center justify-center p-6 text-center"><div><p className="text-sm font-semibold">Customer unavailable</p><p className="mt-1 text-xs text-muted-foreground">{customerQuery.error instanceof Error ? customerQuery.error.message : "The backend did not return this customer."}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void customerQuery.refetch()}>Retry</Button></div></div></WorkspacePage>;
  }

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Accounts · Customer"
        title={customer.name}
        description="Canonical customer account with lifetime activity metrics and the immutable ledger for the selected business period."
        backHref="/customers"
        icon={UserRound}
        meta={<Badge variant={customer.type === "BUSINESS" ? "default" : "secondary"} className="text-[9px]">{customer.type.replaceAll("_", " ")}</Badge>}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { void customerQuery.refetch(); void ledgerSummaryQuery.refetch(); void ledgerQuery.refetch(); }}><RefreshCw className="size-3.5" />Refresh</Button>}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Outstanding" value={formatINR(customer.outstandingAmount)} detail="Canonical receivable balance" icon={WalletCards} tone={Number(customer.outstandingAmount) > 0 ? "danger" : "neutral"} />
        <WorkspaceMetric label="Advance" value={formatINR(customer.advanceBalance)} detail="Canonical customer advance" icon={CreditCard} tone={Number(customer.advanceBalance) > 0 ? "success" : "neutral"} />
        <WorkspaceMetric label="Lifetime sales" value={formatINR(customer.activitySummary.totalSales)} detail={`${customer.activitySummary.totalOrders} non-cancelled sales`} icon={TrendingUp} tone="info" />
        <WorkspaceMetric label="Average sale" value={formatINR(customer.activitySummary.averageOrderValue)} detail={customer.activitySummary.lastPurchaseDate ? `Last purchase ${formatDate(customer.activitySummary.lastPurchaseDate)}` : "No completed purchase"} icon={FileText} />
      </WorkspaceMetricGrid>

      <div className="workspace-two-column">
        <WorkspacePanel title="Contact and billing" description="Customer master fields returned by the backend.">
          <div className="grid gap-[clamp(0.65rem,1vw,1rem)] p-[clamp(0.75rem,1vw,1rem)] sm:grid-cols-2">
            <InfoTile icon={Phone} label="Phone" value={customer.phone || "—"} />
            <InfoTile icon={UserRound} label="Contact person" value={customer.contactPerson || "—"} />
            <InfoTile icon={Building2} label="GSTIN" value={customer.gstin || "Non-GST customer"} mono />
            <InfoTile icon={MapPin} label="Address" value={[customer.address, customer.city].filter(Boolean).join(", ") || "No address on file"} />
          </div>
        </WorkspacePanel>

        <WorkspacePanel title="Ledger period summary" description={`${startDate} → ${endDate}. Positive closing balance is receivable; negative closing balance represents customer advance.`}>
          <div className="grid gap-2 p-[clamp(0.75rem,1vw,1rem)] sm:grid-cols-2">
            <LedgerMetric label="Opening balance" value={ledgerSummary?.openingBalance} loading={ledgerSummaryQuery.isLoading} />
            <LedgerMetric label="Period debits" value={ledgerSummary?.periodDebits} loading={ledgerSummaryQuery.isLoading} />
            <LedgerMetric label="Period credits" value={ledgerSummary?.periodCredits} loading={ledgerSummaryQuery.isLoading} />
            <LedgerMetric label="Closing balance" value={ledgerSummary?.closingBalance} loading={ledgerSummaryQuery.isLoading} strong />
          </div>
        </WorkspacePanel>
      </div>

      <WorkspacePanel
        title="Customer ledger"
        description="Immutable debit/credit entries are the accounting source of truth. The first 50 entries in the selected business period are shown."
        actions={ledgerQuery.data?.hasMore ? <Badge variant="outline" className="text-[9px]">More entries available</Badge> : undefined}
      >
        <OperationalDataTable
          data={ledgerQuery.data?.entries ?? []}
          columns={ledgerColumns}
          getRowId={(entry) => entry.id}
          isLoading={ledgerQuery.isLoading}
          isError={ledgerQuery.isError}
          onRetry={() => void ledgerQuery.refetch()}
          emptyTitle="No ledger entries"
          emptyDescription="No ledger entries were posted in the selected business period."
          renderMobileCard={(entry) => <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{entry.entryType.replaceAll("_", " ")}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(entry.effectiveAt)} · {entry.sourceType.replaceAll("_", " ")}</p></div>{directionBadge(entry.direction)}</div><div className="mt-3 flex items-end justify-between gap-3 border-t pt-2"><span className="text-[10px] text-muted-foreground">Balance {formatINR(Math.abs(entry.runningBalance))}{entry.runningBalance < 0 ? " Cr" : entry.runningBalance > 0 ? " Dr" : ""}</span><span className="numeric-cell text-sm font-semibold">{formatINR(entry.amount)}</span></div></div>}
        />
      </WorkspacePanel>
    </WorkspacePage>
  );
}

function InfoTile({ icon: Icon, label, value, mono = false }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl border bg-muted/20 p-3"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"><Icon className="size-3.5" />{label}</div><p className={`mt-2 text-xs font-semibold leading-5 ${mono ? "font-mono" : ""}`}>{value}</p></div>;
}

function LedgerMetric({ label, value, loading, strong = false }: { label: string; value?: number; loading: boolean; strong?: boolean }) {
  return <div className={`rounded-xl border p-3 ${strong ? "border-indigo-200 bg-indigo-50/40 dark:border-indigo-950 dark:bg-indigo-950/20" : "bg-muted/20"}`}><p className="workspace-kicker">{label}</p><p className="numeric-cell mt-1 text-lg font-semibold">{loading || value === undefined ? "…" : `${formatINR(Math.abs(value))}${value < 0 ? " Cr" : value > 0 ? " Dr" : ""}`}</p></div>;
}
