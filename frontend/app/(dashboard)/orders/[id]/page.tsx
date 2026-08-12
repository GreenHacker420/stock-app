"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock3, PackageCheck, RefreshCw, ShoppingBag, Truck, UserRound, WalletCards } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { fetchOrderDetail } from "@/features/registers/api/detail.queries";
import type { OrderDetail } from "@/features/registers/lib/detail-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDate, formatDateTime, formatINR } from "@/lib/utils";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuthStore();

  const query = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: () => fetchOrderDetail(token ?? "", id),
    enabled: Boolean(token && id),
    staleTime: 20_000,
  });

  if (query.isLoading) return <WorkspacePage><div className="workspace-panel flex min-h-[54vh] items-center justify-center text-xs text-muted-foreground">Loading order…</div></WorkspacePage>;
  if (query.isError || !query.data) return <WorkspacePage><WorkspacePageHeader kicker="Records · Orders" title="Order detail" description="The order could not be loaded." backHref="/orders" icon={ShoppingBag}/><div className="workspace-panel flex min-h-[46vh] items-center justify-center p-6 text-center"><div><p className="text-sm font-semibold">Order unavailable</p><p className="mt-1 text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : "The backend did not return this order."}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void query.refetch()}>Retry</Button></div></div></WorkspacePage>;

  const order = query.data;
  const paid = Number(order.paidAmount || 0);
  const balance = Number(order.balanceAmount || 0);
  const pendingLines = order.items.filter((item) => Number(item.quantityPending || 0) > 0).length;

  const itemColumns: ColumnDef<OrderDetail["items"][number]>[] = [
    { id: "item", header: "Product", cell: ({ row }) => <div className="min-w-[clamp(11rem,20vw,24rem)]"><div className="font-semibold">{row.original.item?.name || "Product"}</div><div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{row.original.item?.sku || "No SKU"}</div></div> },
    { accessorKey: "quantityOrdered", header: "Ordered", cell: ({ row }) => <span className="numeric-cell block text-right">{Number(row.original.quantityOrdered).toLocaleString("en-IN")}</span> },
    { accessorKey: "quantityPending", header: "Pending", cell: ({ row }) => <span className={`numeric-cell block text-right font-semibold ${Number(row.original.quantityPending) > 0 ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground"}`}>{Number(row.original.quantityPending).toLocaleString("en-IN")}</span> },
    { accessorKey: "rate", header: "Rate", cell: ({ row }) => <span className="numeric-cell block text-right">{formatINR(row.original.rate)}</span> },
    { accessorKey: "lineTotal", header: "Line total", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.lineTotal)}</span> },
  ];

  const eventColumns: ColumnDef<OrderDetail["events"][number]>[] = [
    { accessorKey: "createdAt", header: "Time", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
    { accessorKey: "eventType", header: "Event", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.eventType.replaceAll("_", " ")}</Badge> },
    { id: "transition", header: "Status change", cell: ({ row }) => <span className="text-[10px] text-muted-foreground">{row.original.oldStatus || "—"} → {row.original.newStatus || "—"}</span> },
    { accessorKey: "note", header: "Note", cell: ({ row }) => <div className="w-[clamp(11rem,22vw,28rem)] truncate text-muted-foreground" title={row.original.note || undefined}>{row.original.note || "—"}</div> },
  ];

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Records · Order"
        title={order.orderNumber}
        description="Backend order state, line quantities, payment position and fulfilment timeline. No UI-only status is synthesized."
        backHref="/orders"
        icon={ShoppingBag}
        meta={<><Badge variant="secondary" className="text-[9px]">{order.status.replaceAll("_", " ")}</Badge><Badge variant="outline" className="text-[9px]">{order.priority}</Badge></>}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5"/>Refresh</Button>}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Order value" value={formatINR(order.totalAmount)} detail={`Subtotal ${formatINR(order.subtotal)} · Discount ${formatINR(order.discountAmount)}`} icon={ShoppingBag} />
        <WorkspaceMetric label="Paid" value={formatINR(paid)} detail="Payment value persisted on order" icon={WalletCards} tone={paid > 0 ? "success" : "neutral"} />
        <WorkspaceMetric label="Balance" value={formatINR(balance)} detail="Remaining order balance" icon={WalletCards} tone={balance > 0 ? "warning" : "success"} />
        <WorkspaceMetric label="Pending lines" value={pendingLines} detail={`${order.items.length} total product lines`} icon={PackageCheck} tone={pendingLines > 0 ? "warning" : "success"} />
      </WorkspaceMetricGrid>

      <div className="workspace-two-column">
        <WorkspacePanel title="Customer and assignment" description="Customer and staff assignment returned by GET /orders/:id.">
          <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
            <InfoLine label="Customer" value={order.customer?.name || "—"} />
            <InfoLine label="Phone" value={order.customer?.phone || "—"} mono />
            <InfoLine label="Assigned staff" value={order.assignedStaff?.name || "Unassigned"} />
            <InfoLine label="Expected dispatch" value={order.expectedDispatchDate ? formatDate(order.expectedDispatchDate) : "Not set"} />
          </div>
        </WorkspacePanel>

        <WorkspacePanel title="Fulfilment state" description="Current backend status and recorded dispatch/payment activity.">
          <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
            <InfoLine label="Status" value={order.status.replaceAll("_", " ")} />
            <InfoLine label="Priority" value={order.priority} />
            <InfoLine label="Dispatch records" value={String(order.dispatches.length)} />
            <InfoLine label="Payment records" value={String(order.payments.length)} />
            <InfoLine label="Created" value={formatDateTime(order.createdAt)} />
          </div>
        </WorkspacePanel>
      </div>

      <WorkspacePanel title="Order lines" description="Ordered and pending quantities are stored by the backend and shown independently.">
        <OperationalDataTable data={order.items} columns={itemColumns} getRowId={(item) => item.id} emptyTitle="No order lines" emptyDescription="The order does not contain product lines." renderMobileCard={(item) => <div className="rounded-xl border bg-card p-3"><p className="text-sm font-semibold">{item.item?.name || "Product"}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.item?.sku || "No SKU"}</p><div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-right"><div><p className="workspace-kicker">Ordered</p><p className="numeric-cell mt-1 text-xs font-semibold">{Number(item.quantityOrdered)}</p></div><div><p className="workspace-kicker">Pending</p><p className="numeric-cell mt-1 text-xs font-semibold">{Number(item.quantityPending)}</p></div><div><p className="workspace-kicker">Total</p><p className="numeric-cell mt-1 text-xs font-semibold">{formatINR(item.lineTotal)}</p></div></div></div>} />
      </WorkspacePanel>

      <WorkspacePanel title="Order timeline" description="Events returned in chronological order by the order service.">
        <OperationalDataTable data={order.events} columns={eventColumns} getRowId={(event) => event.id} emptyTitle="No order events" emptyDescription="No order events were returned." renderMobileCard={(event) => <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{event.eventType.replaceAll("_", " ")}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(event.createdAt)}</p></div><Clock3 className="size-4 text-muted-foreground"/></div>{event.note ? <p className="mt-2 text-[10px] text-muted-foreground">{event.note}</p> : null}</div>} />
      </WorkspacePanel>
    </WorkspacePage>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex min-h-[clamp(2.6rem,5vh,3.15rem)] items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={`min-w-0 truncate text-right font-semibold ${mono ? "font-mono text-[10px]" : ""}`} title={value}>{value}</span></div>;
}
