"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Clock3, FilePenLine, RefreshCw, ShieldAlert, XCircle } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DecisionDialog } from "@/components/workspace/DecisionDialog";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { approveCorrection, fetchCorrectionRequests, rejectCorrection } from "@/features/control/api/control.api";
import type { ApprovalStatus, CorrectionRequestRow } from "@/features/control/lib/control-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { formatDate } from "@/lib/utils";

const REPORT_ID = "control.corrections";
const FILTERS: Array<"ALL" | ApprovalStatus> = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"];
type Decision = { request: CorrectionRequestRow; status: "APPROVED" | "REJECTED" } | null;

function statusBadge(status: ApprovalStatus) {
  if (status === "APPROVED") return <Badge className="bg-emerald-600 text-[9px] text-white">Approved</Badge>;
  if (status === "PENDING") return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Pending</Badge>;
  if (status === "REJECTED") return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">Rejected</Badge>;
  return <Badge variant="secondary" className="text-[9px]">Cancelled</Badge>;
}

function describeChange(value: Record<string, unknown>) {
  const entries = Object.entries(value);
  if (entries.length === 0) return "No structured change payload";
  return entries.slice(0, 3).map(([key, item]) => `${key}: ${typeof item === "object" ? "…" : String(item)}`).join(" · ");
}

export default function CorrectionsPage() {
  const queryClient = useQueryClient();
  const { token, shops, activeShopId, user } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const [filter, setFilter] = useState<"ALL" | ApprovalStatus>("PENDING");
  const [decision, setDecision] = useState<Decision>(null);
  const canReview = user?.role === "OWNER";

  const queryKey = ["corrections", "queue", shopId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => fetchCorrectionRequests(token ?? "", { shopId }),
    enabled: Boolean(token && shopId),
    staleTime: 20_000,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ request, status, reason }: { request: CorrectionRequestRow; status: "APPROVED" | "REJECTED"; reason?: string }) => {
      if (status === "APPROVED") return approveCorrection(token ?? "", request.id);
      return rejectCorrection(token ?? "", request.id, reason || "Rejected by owner");
    },
    onSuccess: async () => {
      setDecision(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["delivery-memos"] }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
      ]);
    },
  });

  const data = query.data ?? [];
  const rows = filter === "ALL" ? data : data.filter((request) => request.status === filter);
  const pending = data.filter((request) => request.status === "PENDING");

  const columns = useMemo<ColumnDef<CorrectionRequestRow>[]>(() => [
    { accessorKey: "createdAt", header: "Requested", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    { accessorKey: "entityType", header: "Entity", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.entityType.replaceAll("_", " ")}</Badge> },
    { accessorKey: "entityId", header: "Target ID", cell: ({ row }) => <span className="block w-[clamp(8rem,13vw,14rem)] truncate font-mono text-[9px] text-muted-foreground" title={row.original.entityId}>{row.original.entityId}</span> },
    { accessorKey: "reason", header: "Reason", cell: ({ row }) => <div className="w-[clamp(11rem,20vw,26rem)] truncate text-muted-foreground" title={row.original.reason || undefined}>{row.original.reason || "—"}</div> },
    { id: "change", header: "Requested change", cell: ({ row }) => <div className="w-[clamp(11rem,21vw,28rem)] truncate text-[10px] text-muted-foreground" title={JSON.stringify(row.original.requestedChangeJson)}>{describeChange(row.original.requestedChangeJson)}</div> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right">{statusBadge(row.original.status)}</div> },
    { id: "actions", header: "Action", cell: ({ row }) => {
      if (!canReview) return <span className="block text-right text-[10px] text-muted-foreground">Owner review required</span>;
      if (row.original.status !== "PENDING") return <span className="block text-right text-[10px] text-muted-foreground">Processed</span>;
      return <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-emerald-700" onClick={(event) => { event.stopPropagation(); setDecision({ request: row.original, status: "APPROVED" }); }}>Approve</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-rose-700" onClick={(event) => { event.stopPropagation(); setDecision({ request: row.original, status: "REJECTED" }); }}>Reject</Button></div>;
    } },
  ], [canReview]);

  const workspaceScope = JSON.stringify({
    "app.module": "control",
    "app.view": REPORT_ID,
    "control.corrections": true,
    "mutation.pending": reviewMutation.isPending,
    "keyboard.scope": "workspace",
  });

  return (
    <div data-keyboard-scope={workspaceScope}>
      <WorkspacePage>
        <WorkspacePageHeader kicker="Control · Corrections" title="Correction requests" description="Specialized transaction corrections and cancellations. Approval can reverse ledger entries, restore stock, or mutate transaction state, so every decision uses the dedicated backend handler." icon={FilePenLine} actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button>} />

        <WorkspaceMetricGrid>
          <WorkspaceMetric label="Pending" value={pending.length} detail="Awaiting owner decision" icon={Clock3} tone={pending.length ? "warning" : "neutral"} loading={query.isLoading} />
          <WorkspaceMetric label="Approved" value={data.filter((item) => item.status === "APPROVED").length} detail="Processed through specialized backend handlers" icon={CheckCircle2} tone="success" loading={query.isLoading} />
          <WorkspaceMetric label="Rejected" value={data.filter((item) => item.status === "REJECTED").length} detail="Rejected correction requests" icon={XCircle} loading={query.isLoading} />
          <WorkspaceMetric label="Review authority" value={canReview ? "Owner" : "Read only"} detail="Backend remains final authorization layer" icon={ShieldAlert} tone="info" />
        </WorkspaceMetricGrid>

        <WorkspacePanel title="Correction queue" description="This queue is shop-scoped. Approve and reject actions call /correction-requests/:id/approve and /reject directly.">
          <WorkspaceToolbar>{FILTERS.map((status) => <Button key={status} variant={filter === status ? "secondary" : "ghost"} size="sm" className="h-8 text-[10px]" onClick={() => setFilter(status)}>{status.replaceAll("_", " ")}</Button>)}</WorkspaceToolbar>
          <OperationalDataTable id={REPORT_ID} data={rows} columns={columns} getRowId={(request) => request.id} isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()} autoFocus emptyTitle="No correction requests" emptyDescription="Nothing matches the selected correction status." renderMobileCard={(request) => <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{request.entityType.replaceAll("_", " ")}</p><p className="mt-0.5 font-mono text-[9px] text-muted-foreground">{request.entityId}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(request.createdAt)}</p></div>{statusBadge(request.status)}</div><p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">{request.reason || "No reason supplied"}</p></div>} />
        </WorkspacePanel>

        <DecisionDialog open={Boolean(decision)} onOpenChange={(open) => !open && setDecision(null)} title={decision?.status === "APPROVED" ? "Approve correction?" : "Reject correction?"} description={decision?.status === "APPROVED" ? "This is a real accounting/stock write. The backend may reverse ledger entries, restore stock, or change transaction state according to the correction type." : "The correction request will be rejected without applying its requested transaction change."} confirmLabel={decision?.status === "APPROVED" ? "Approve correction" : "Reject correction"} destructive={decision?.status === "REJECTED"} requireReason={decision?.status === "REJECTED"} reasonPlaceholder="Why is this correction being rejected?" pending={reviewMutation.isPending} onConfirm={(reason) => { if (decision) reviewMutation.mutate({ request: decision.request, status: decision.status, reason: reason || undefined }); }} />
      </WorkspacePage>
    </div>
  );
}
