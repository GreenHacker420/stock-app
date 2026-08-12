"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, ClipboardCheck, Landmark, RefreshCw, Settings2, ShieldCheck, Store, Users } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { apiRequest, type Shop } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { queryKeys } from "@/lib/query/query-keys";

type StaffAccount = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
  role: "OWNER" | "STAFF";
};

export default function AdministrationPage() {
  const { token, shops } = useAuthStore();

  const staffQuery = useQuery({
    queryKey: queryKeys.staff.all(),
    queryFn: () => apiRequest<StaffAccount[]>("/auth/staff", { token }),
    enabled: Boolean(token),
    staleTime: 60_000,
  });

  const activeStaff = (staffQuery.data ?? []).filter((staff) => staff.status === "ACTIVE").length;
  const lockedShops = shops.filter((shop) => shop.openingStockLocked).length;

  const staffColumns: ColumnDef<StaffAccount>[] = [
    { accessorKey: "name", header: "Staff", cell: ({ row }) => <div><div className="font-semibold">{row.original.name}</div><div className="text-[10px] text-muted-foreground">{row.original.email || "No email"}</div></div> },
    { accessorKey: "mobile", header: "Mobile", cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{row.original.mobile}</span> },
    { accessorKey: "role", header: "Role", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.role}</Badge> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right"><Badge variant="outline" className={row.original.status === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-[9px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "text-[9px] text-muted-foreground"}>{row.original.status}</Badge></div> },
  ];

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Control · Administration"
        title="Business administration"
        description="Owner-scoped shop configuration, staff directory and operational control queues. Staff data comes directly from the owner-only /auth/staff contract."
        icon={Settings2}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void staffQuery.refetch()}><RefreshCw className="size-3.5" />Refresh</Button>}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Configured shops" value={shops.length} detail={`${lockedShops} with opening stock locked`} icon={Store} />
        <WorkspaceMetric label="Staff accounts" value={(staffQuery.data ?? []).length} detail={`${activeStaff} active`} icon={Users} loading={staffQuery.isLoading} />
        <WorkspaceMetric label="Access model" value="Owner scoped" detail="Backend owner/staff authorization remains authoritative" icon={ShieldCheck} tone="info" />
        <WorkspaceMetric label="Control queues" value="3" detail="Approvals · Corrections · Cash sessions" icon={ClipboardCheck} />
      </WorkspaceMetricGrid>

      <div className="workspace-two-column">
        <WorkspacePanel title="Configured shops" description="No invented Active status is shown; the UI displays only fields present in the Shop contract.">
          <div className="divide-y">
            {shops.length ? shops.map((shop: Shop) => (
              <div key={shop.id} className="flex min-h-[clamp(4rem,8vh,5rem)] items-center justify-between gap-4 px-[clamp(0.75rem,1vw,1rem)] py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{shop.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{shop.city || "No city"} · Code {shop.code}</p>
                  {shop.gstin ? <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">GSTIN {shop.gstin}</p> : null}
                </div>
                <Badge variant="outline" className={shop.openingStockLocked ? "border-emerald-200 bg-emerald-50 text-[9px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "text-[9px]"}>{shop.openingStockLocked ? "Opening locked" : "Opening editable"}</Badge>
              </div>
            )) : <div className="p-6 text-center text-xs text-muted-foreground">No shops are available in the authenticated session.</div>}
          </div>
        </WorkspacePanel>

        <WorkspacePanel title="Operational control" description="Open the real control queues instead of exposing placeholder administration actions.">
          <div className="grid gap-2 p-[clamp(0.7rem,1vw,1rem)]">
            <ControlLink href="/approvals" icon={CheckCircle2} title="Approvals" description="Review pending approval requests." />
            <ControlLink href="/corrections" icon={ClipboardCheck} title="Correction requests" description="Review requested transaction corrections." />
            <ControlLink href="/cash-sessions" icon={Landmark} title="Cash sessions" description="Review opening, expected, actual and mismatch values." />
          </div>
        </WorkspacePanel>
      </div>

      <WorkspacePanel title="Staff directory" description="Owner is intentionally not synthesized into the staff list; an empty backend response remains an empty staff list.">
        <OperationalDataTable
          data={staffQuery.data ?? []}
          columns={staffColumns}
          getRowId={(staff) => staff.id}
          isLoading={staffQuery.isLoading}
          isError={staffQuery.isError}
          onRetry={() => void staffQuery.refetch()}
          emptyTitle="No staff accounts found"
          emptyDescription="Create or assign staff through the supported owner workflow before they appear here."
          renderMobileCard={(staff) => <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{staff.name}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{staff.mobile}</p><p className="mt-1 text-[10px] text-muted-foreground">{staff.email || "No email"}</p></div><Badge variant="secondary" className="text-[9px]">{staff.role}</Badge></div><div className="mt-3 border-t pt-2 text-right text-[10px] text-muted-foreground">{staff.status}</div></div>}
        />
      </WorkspacePanel>
    </WorkspacePage>
  );
}

function ControlLink({ href, icon: Icon, title, description }: { href: string; icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return <Link href={href} className="group flex min-h-[clamp(4rem,8vh,5rem)] items-center gap-3 rounded-xl border bg-muted/20 p-3 transition-colors hover:border-foreground/15 hover:bg-muted/50"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground group-hover:text-foreground"><Icon className="size-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{description}</span></span></Link>;
}
