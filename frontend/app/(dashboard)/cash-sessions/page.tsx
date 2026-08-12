"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, CheckCircle2, Clock3, RefreshCw, Scale, ShieldCheck } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DecisionDialog } from "@/components/workspace/DecisionDialog";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { fetchCashSessions, reviewCashSession } from "@/features/control/api/control.api";
import type { CashSessionRow, CashSessionStatus } from "@/features/control/lib/control-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { formatDateTime, formatINR } from "@/lib/utils";

const STATUSES: CashSessionStatus[] = ["OPEN", "CLOSED", "REVIEWED", "LOCKED"];

function sessionBadge(status: CashSessionStatus) {
  if (status === "OPEN") return <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-[9px] text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">Open</Badge>;
  if (status === "CLOSED") return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Review required</Badge>;
  if (status === "REVIEWED") return <Badge className="bg-emerald-600 text-[9px] text-white">Reviewed</Badge>;
  return <Badge variant="secondary" className="text-[9px]">Locked</Badge>;
}

export default function CashSessionsPage() {
  const queryClient = useQueryClient();
  const { token, shops, activeShopId, user } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const [status, setStatus] = React.useState<CashSessionStatus | undefined>();
  const [reviewTarget, setReviewTarget] = React.useState<CashSessionRow | null>(null);
  const isOwner = user?.role === "OWNER";

  const queryKey = ["cash-sessions", "register", shopId, status || "all"] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => fetchCashSessions(token ?? "", { shopId, status }),
    enabled: Boolean(token && shopId),
    staleTime: 20_000,
  });

  const reviewMutation = useMutation({
    mutationFn: (sessionId: string) => reviewCashSession(token ?? "", sessionId),
    onSuccess: async () => {
      setReviewTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cash-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const data = query.data ?? [];
  const totals = React.useMemo(() => data.reduce((acc, session) => {
    acc.opening += Number(session.openingCash || 0);
    acc.expected += Number(session.expectedCash || 0);
    acc.difference += Number(session.difference || 0);
    if (session.status === "OPEN") acc.open += 1;
    if (session.status === "CLOSED") acc.reviewRequired += 1;
    return acc;
  }, { opening: 0, expected: 0, difference: 0, open: 0, reviewRequired: 0 }), [data]);

  const columns = React.useMemo<ColumnDef<CashSessionRow>[]>(() => [
    { accessorKey: "openedAt", header: "Opened", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.openedAt)}</span> },
    { id: "staff", header: "Staff", cell: ({ row }) => <div><div className="font-semibold">{row.original.staff?.name || "—"}</div><div className="font-mono text-[9px] text-muted-foreground">{row.original.staff?.mobile || ""}</div></div> },
    { accessorKey: "openingCash", header: "Opening", cell: ({ row }) => <span className="numeric-cell block text-right">{formatINR(row.original.openingCash)}</span> },
    { accessorKey: "expectedCash", header: "Expected", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.expectedCash)}</span> },
    { accessorKey: "actualCash", header: "Actual", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{row.original.actualCash == null ? "—" : formatINR(row.original.actualCash)}</span> },
    { accessorKey: "cashHandover", header: "Handover", cell: ({ row }) => <span className="numeric-cell block text-right text-muted-foreground">{row.original.cashHandover == null ? "—" : formatINR(row.original.cashHandover)}</span> },
    { accessorKey: "difference", header: "Difference", cell: ({ row }) => {
      const difference = Number(row.original.difference || 0);
      return <span className={`numeric-cell block text-right font-semibold ${difference < 0 ? "text-rose-600 dark:text-rose-300" : difference > 0 ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground"}`}>{row.original.difference == null ? "—" : formatINR(difference)}</span>;
    } },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right">{sessionBadge(row.original.status)}</div> },
    { id: "action", header: "Action", cell: ({ row }) => {
      if (row.original.status !== "CLOSED" || !isOwner) return <span className="block text-right text-[10px] text-muted-foreground">—</span>;
      return <div className="text-right"><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-emerald-700" onClick={(event) => { event.stopPropagation(); setReviewTarget(row.original); }}>Mark reviewed</Button></div>;
    } },
  ], [isOwner]);

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Control · Cash drawer"
        title="Cash sessions"
        description="Opening, expected, actual, handover and difference values come directly from the cash-session ledger. Expected cash is computed by the backend from cash receipts and non-rejected expenses."
        icon={Banknote}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button>}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Open sessions" value={totals.open} detail="Currently open cash drawers" icon={Clock3} tone={totals.open ? "info" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Review required" value={totals.reviewRequired} detail="CLOSED sessions awaiting owner review" icon={ShieldCheck} tone={totals.reviewRequired ? "warning" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Expected cash" value={formatINR(totals.expected)} detail="Total across the loaded filter" icon={Banknote} loading={query.isLoading} />
        <WorkspaceMetric label="Net difference" value={formatINR(totals.difference)} detail="Actual minus expected where sessions are closed" icon={Scale} tone={totals.difference !== 0 ? "warning" : "success"} loading={query.isLoading} />
      </WorkspaceMetricGrid>

      <WorkspacePanel title="Cash-session register" description="Status filtering is server-side. Session opening and closing remain in their existing dedicated mobile/staff workflows; this owner page focuses on review and audit visibility.">
        <WorkspaceToolbar>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">{status || "All statuses"}</DropdownMenuTrigger>
            <DropdownMenuContent align="start"><DropdownMenuLabel>Session status</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={() => setStatus(undefined)}>All statuses</DropdownMenuItem>{STATUSES.map((item) => <DropdownMenuItem key={item} onClick={() => setStatus(item)}>{item}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          {!isOwner ? <Badge variant="outline" className="h-8 text-[10px]">Owner review actions hidden</Badge> : null}
        </WorkspaceToolbar>

        <OperationalDataTable
          data={data}
          columns={columns}
          getRowId={(session) => session.id}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          emptyTitle="No cash sessions"
          emptyDescription="No session matches the selected server-side status filter."
          renderMobileCard={(session) => {
            const difference = Number(session.difference || 0);
            return <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{session.staff?.name || "Staff"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(session.openedAt)}</p></div>{sessionBadge(session.status)}</div><div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-right"><div><p className="workspace-kicker">Expected</p><p className="numeric-cell mt-1 text-xs font-semibold">{formatINR(session.expectedCash)}</p></div><div><p className="workspace-kicker">Actual</p><p className="numeric-cell mt-1 text-xs font-semibold">{session.actualCash == null ? "—" : formatINR(session.actualCash)}</p></div><div><p className="workspace-kicker">Difference</p><p className={`numeric-cell mt-1 text-xs font-semibold ${difference !== 0 ? "text-amber-600" : ""}`}>{session.difference == null ? "—" : formatINR(difference)}</p></div></div></div>;
          }}
        />
      </WorkspacePanel>

      <DecisionDialog
        open={Boolean(reviewTarget)}
        onOpenChange={(open) => !open && setReviewTarget(null)}
        title="Mark cash session reviewed?"
        description="This records an owner review in the backend and writes an audit/domain event. It does not change the counted cash values."
        confirmLabel="Mark reviewed"
        pending={reviewMutation.isPending}
        onConfirm={() => { if (reviewTarget) reviewMutation.mutate(reviewTarget.id); }}
      />
    </WorkspacePage>
  );
}
