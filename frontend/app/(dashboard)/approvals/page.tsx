"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCheck, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Tag, XCircle } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DecisionDialog } from "@/components/workspace/DecisionDialog";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { bulkRespondApprovals, fetchApprovalRequests, respondApproval } from "@/features/control/api/control.api";
import type { ApprovalRequestRow, ApprovalStatus } from "@/features/control/lib/control-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { formatDate } from "@/lib/utils";

const FILTERS: Array<"ALL" | ApprovalStatus> = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"];

type Decision = {
  request?: ApprovalRequestRow;
  ids?: string[];
  status: "APPROVED" | "REJECTED";
} | null;

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
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const queryKey = ["approvals", "queue", shopId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => fetchApprovalRequests(token ?? "", { shopId }),
    enabled: Boolean(token && shopId),
    staleTime: 20_000,
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: "APPROVED" | "REJECTED"; reason?: string }) =>
      respondApproval(token ?? "", id, status, reason),
    onSuccess: async () => {
      setDecision(null);
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, status, reason }: { ids: string[]; status: "APPROVED" | "REJECTED"; reason?: string }) =>
      bulkRespondApprovals(token ?? "", ids, status, reason),
    onSuccess: async () => {
      setDecision(null);
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const data = query.data ?? [];
  const rows = filter === "ALL" ? data : data.filter((request) => request.status === filter);
  const pending = data.filter((request) => request.status === "PENDING");
  const pendingStock = pending.filter((request) => request.type.includes("STOCK") || request.type.includes("DAMAGE")).length;
  const pendingRates = pending.filter((request) => request.type.includes("RATE") || request.type.includes("PRICE")).length;
  const pendingCorrections = pending.filter((request) => request.type.includes("CANCEL") || request.type.includes("CORRECTION")).length;

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmDecision = (reason: string) => {
    if (!decision) return;
    if (decision.ids && decision.ids.length > 0) {
      bulkMutation.mutate({
        ids: decision.ids,
        status: decision.status,
        reason: reason || undefined,
      });
    } else if (decision.request) {
      respondMutation.mutate({
        id: decision.request.id,
        status: decision.status,
        reason: reason || undefined,
      });
    }
  };

  const columns = React.useMemo<ColumnDef<ApprovalRequestRow>[]>(() => [
    {
      id: "select",
      header: () => (
        <input
          type="checkbox"
          className="size-3.5 rounded border-gray-300 text-primary focus:ring-primary"
          checked={rows.length > 0 && selectedIds.size === rows.length}
          onChange={toggleSelectAll}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="size-3.5 rounded border-gray-300 text-primary focus:ring-primary"
          checked={selectedIds.has(row.original.id)}
          onChange={(event) => {
            event.stopPropagation();
            toggleSelectRow(row.original.id);
          }}
          aria-label={`Select row ${row.original.id}`}
        />
      ),
    },
    { accessorKey: "createdAt", header: "Requested", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.type.replaceAll("_", " ")}</Badge> },
    { id: "entity", header: "Target", cell: ({ row }) => <div><div className="text-[10px] font-semibold">{row.original.entityType.replaceAll("_", " ")}</div><div className="max-w-[18vw] truncate font-mono text-[9px] text-muted-foreground" title={row.original.entityId}>{row.original.entityId}</div></div> },
    { id: "requester", header: "Requested by", cell: ({ row }) => <span className="font-medium">{row.original.requestedBy?.name || "—"}</span> },
    { accessorKey: "reason", header: "Reason", cell: ({ row }) => <div className="w-[clamp(12rem,22vw,28rem)] truncate text-muted-foreground" title={row.original.reason || undefined}>{row.original.reason || "—"}</div> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right">{statusBadge(row.original.status)}</div> },
    { id: "actions", header: "Action", cell: ({ row }) => {
      if (row.original.status !== "PENDING") return <span className="block text-right text-[10px] text-muted-foreground">Processed</span>;
      return (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={(event) => {
              event.stopPropagation();
              setDecision({ request: row.original, status: "APPROVED" });
            }}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] font-medium text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={(event) => {
              event.stopPropagation();
              setDecision({ request: row.original, status: "REJECTED" });
            }}
          >
            Reject
          </Button>
        </div>
      );
    } },
  ], [rows, selectedIds]);

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Control · Owner"
        title="Approval queue"
        description="Review and process staff requests for stock entries, rate changes, sale adjustments, and transaction corrections."
        icon={ShieldCheck}
        actions={
          <div className="flex items-center gap-2">
            {pending.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => setDecision({ ids: pending.map((p) => p.id), status: "APPROVED" })}
              >
                <CheckCheck className="size-3.5" />
                Approve all ({pending.length})
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Pending" value={pending.length} detail="All pending approval requests" icon={Clock3} tone={pending.length ? "warning" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Stock entries" value={pendingStock} detail="Stock restocks and damage entries" icon={CheckCircle2} tone={pendingStock ? "info" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Rate changes" value={pendingRates} detail="Item pricing and rate adjustments" icon={Tag} tone={pendingRates ? "info" : "neutral"} loading={query.isLoading} />
        <WorkspaceMetric label="Corrections" value={pendingCorrections} detail="Sale edits and cancellations" icon={ShieldCheck} tone={pendingCorrections ? "warning" : "neutral"} loading={query.isLoading} />
      </WorkspaceMetricGrid>

      <WorkspacePanel title="Approval requests" description="Owner queue with instant caching, multi-selection, and fast bulk response handling.">
        <WorkspaceToolbar>
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1">
              {FILTERS.map((status) => (
                <Button key={status} variant={filter === status ? "secondary" : "ghost"} size="sm" className="h-8 text-[10px]" onClick={() => setFilter(status)}>
                  {status.replaceAll("_", " ")}
                </Button>
              ))}
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">{selectedIds.size} selected</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-emerald-300 px-2 text-[10px] text-emerald-700 hover:bg-emerald-50"
                  onClick={() => setDecision({ ids: Array.from(selectedIds), status: "APPROVED" })}
                >
                  Approve selected ({selectedIds.size})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-rose-300 px-2 text-[10px] text-rose-700 hover:bg-rose-50"
                  onClick={() => setDecision({ ids: Array.from(selectedIds), status: "REJECTED" })}
                >
                  Reject selected ({selectedIds.size})
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            )}
          </div>
        </WorkspaceToolbar>
        <OperationalDataTable
          data={rows}
          columns={columns}
          getRowId={(request) => request.id}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          emptyTitle="No approval requests"
          emptyDescription="Nothing matches the selected approval status."
          renderMobileCard={(request) => (
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold">{request.type.replaceAll("_", " ")}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{request.requestedBy?.name || "Unknown"} · {formatDate(request.createdAt)}</p>
                </div>
                {statusBadge(request.status)}
              </div>
              <p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">{request.reason || "No reason supplied"}</p>
            </div>
          )}
        />
      </WorkspacePanel>

      <DecisionDialog
        open={Boolean(decision)}
        onOpenChange={(open) => !open && setDecision(null)}
        title={
          decision?.ids && decision.ids.length > 1
            ? `${decision.status === "APPROVED" ? "Approve" : "Reject"} ${decision.ids.length} requests?`
            : `${decision?.status === "APPROVED" ? "Approve" : "Reject"} request?`
        }
        description={
          decision?.status === "APPROVED"
            ? "Approving will apply the requested changes (stock movements, rate updates, or corrections) to the active business ledger."
            : "The request(s) will be rejected with an explanation note and no changes will be applied."
        }
        confirmLabel={decision?.status === "APPROVED" ? "Confirm approval" : "Confirm rejection"}
        destructive={decision?.status === "REJECTED"}
        requireReason={decision?.status === "REJECTED"}
        reasonPlaceholder="Specify reason for staff..."
        pending={respondMutation.isPending || bulkMutation.isPending}
        onConfirm={handleConfirmDecision}
      />
    </WorkspacePage>
  );
}
