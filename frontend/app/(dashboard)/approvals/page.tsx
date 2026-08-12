"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DecisionDialog } from "@/components/workspace/DecisionDialog";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { fetchApprovalRequests, respondApproval } from "@/features/control/api/control.api";
import type { ApprovalRequestRow, ApprovalStatus } from "@/features/control/lib/control-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { formatDate } from "@/lib/utils";

const FILTERS: Array<"ALL" | ApprovalStatus> = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"];

type Decision = { request: ApprovalRequestRow; status: "APPROVED" | "REJECTED" } | null;

function statusBadge(status: ApprovalStatus) {
  if (status === "APPROVED") return <Badge className="bg-emerald-600 text-[9px] text-white">Approved</Badge>;
  if (status === "PENDING") return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Pending</Badge>;
  if (status === "REJECTED") return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">Rejected</Badge>;
  return <Badge variant="secondary" className="text-[9px]">Cancelled</Badge>;
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const { token, shops, activeShopId } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const [filter, setFilter] = React.useState<"ALL" | ApprovalStatus>("PENDING");
  const [decision, setDecision] = React.useState<Decision>(null);

  const queryKey = ["approvals", "queue", shopId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => fetchApprovalRequests(token ?? "", { shopId }),
    enabled: Boolean(token && shopId),
    staleTime: 20_000,
  });

  const respondMutation = useMutation({
    mutationFn: ({ request, status, reason }: { request: ApprovalRequestRow; status: "APPROVED" | "REJECTED"; reason?: string }) => respondApproval(token ?? "", request.id, status, reason),
    onSuccess: async () => {
      setDecision(null);
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const data = query.data ?? [];
  const rows = filter === "ALL" ? data : data.filter((request) => request.status === filter);
  const pending = data.filter((request) => request.status === "PENDING");
  const pendingStock = pending.filter((request) => request.type === "STOCK_ENTRY").length;
  const specialized = pending.length - pendingStock;

  const columns = React.useMemo<ColumnDef<ApprovalRequestRow>[]>(() => [
    { accessorKey: "createdAt", header: "Requested", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.type.replaceAll("_", " ")}</Badge> },
    { id: "entity", header: "Target", cell: ({ row }) => <div><div className="text-[10px] font-semibold">{row.original.entityType.replaceAll("_", " ")}</div><div className="max-w-[18vw] truncate font-mono text-[9px] text-muted-foreground" title={row.original.entityId}>{row.original.entityId}</div></div> },
    { id: "requester", header: "Requested by", cell: ({ row }) => <span className="font-medium">{row.original.requestedBy?.name || "—"}</span> },
    { accessorKey: "reason", header: "Reason", cell: ({ row }) => <div className="w-[clamp(12rem,22vw,28rem)] truncate text-muted-foreground" title={row.original.reason || undefined}>{row.original.reason || "—"}</div> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right">{statusBadge(row.original.status)}</div> },
    { id: "actions", header: "Action", cell: ({ row }) => {
      if (row.original.status !== "PENDING") return <span className="block text-right text-[10px] text-muted-foreground">Processed</span>;
      if (row.original.type !== "STOCK_ENTRY") return <span className="block text-right text-[10px] text-muted-foreground">Specialized workflow</span>;
      return <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-emerald-700" onClick={(event) => { event.stopPropagation(); setDecision({ request: row.original, status: "APPROVED" }); }}>Approve</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-rose-700" onClick={(event) => { event.stopPropagation(); setDecision({ request: row.original, status: "REJECTED" }); }}>Reject</Button></div>;
    } },
  ], []);

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Control · Owner"
        title="Approval queue"
        description="Generic approval handling is intentionally limited to STOCK_ENTRY because the backend routes transaction corrections through specialized handlers."
        icon={ShieldCheck}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button>}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Pending" value={pending.length} detail="All pending approval types" icon={Clock3} tone={pending.length ? "warning" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Stock entry" value={pendingStock} detail="Can be processed here" icon={CheckCircle2} tone={pendingStock ? "info" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Specialized" value={specialized} detail="Must use its domain-specific review workflow" icon={ShieldCheck} tone={specialized ? "warning" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Rejected" value={data.filter((item) => item.status === "REJECTED").length} detail="Rejected requests in loaded queue" icon={XCircle} loading={query.isLoading} />
      </WorkspaceMetricGrid>

      <WorkspacePanel title="Approval requests" description="The entire owner/shop queue is fetched so the status tabs remain consistent without synthesizing totals.">
        <WorkspaceToolbar>{FILTERS.map((status) => <Button key={status} variant={filter === status ? "secondary" : "ghost"} size="sm" className="h-8 text-[10px]" onClick={() => setFilter(status)}>{status.replaceAll("_", " ")}</Button>)}</WorkspaceToolbar>
        <OperationalDataTable
          data={rows}
          columns={columns}
          getRowId={(request) => request.id}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          emptyTitle="No approval requests"
          emptyDescription="Nothing matches the selected approval status."
          renderMobileCard={(request) => <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{request.type.replaceAll("_", " ")}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{request.requestedBy?.name || "Unknown"} · {formatDate(request.createdAt)}</p></div>{statusBadge(request.status)}</div><p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">{request.reason || "No reason supplied"}</p></div>}
        />
      </WorkspacePanel>

      <DecisionDialog
        open={Boolean(decision)}
        onOpenChange={(open) => !open && setDecision(null)}
        title={decision?.status === "APPROVED" ? "Approve stock entry?" : "Reject stock entry?"}
        description={decision?.status === "APPROVED" ? "Approval will create the stock-ledger movements defined in this request. This is a real backend write." : "The request will be rejected and no stock movement will be created."}
        confirmLabel={decision?.status === "APPROVED" ? "Approve request" : "Reject request"}
        destructive={decision?.status === "REJECTED"}
        requireReason={decision?.status === "REJECTED"}
        pending={respondMutation.isPending}
        onConfirm={(reason) => { if (decision) respondMutation.mutate({ request: decision.request, status: decision.status, reason: reason || undefined }); }}
      />
    </WorkspacePage>
  );
}
