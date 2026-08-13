"use client";

import { use, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { PackageCheck, RefreshCw, Truck, WalletCards } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { fetchDeliveryMemoDetail } from "@/features/registers/api/detail.queries";
import type { DeliveryMemoDetail } from "@/features/registers/lib/detail-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { drilldownStack } from "@/lib/navigation/drilldown-stack";
import { queueNavigationRestoration } from "@/lib/navigation/navigation-restoration";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDate, formatDateTime, formatINR } from "@/lib/utils";

export default function DeliveryMemoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token } = useAuthStore();

  const goBack = useCallback(() => {
    const frame = drilldownStack.pop();
    if (!frame) { router.push("/delivery-memos"); return; }
    queueNavigationRestoration(frame);
    router.push(`${frame.route}${frame.searchParams ? `?${frame.searchParams}` : ""}`);
  }, [router]);

  const backCommand = useMemo(() => ({ id: "deliveryMemos.detail.back", title: "Back to Delivery Memo Register", execute: goBack }), [goBack]);
  useCommand(backCommand);
  useKeybinding(useMemo(() => ({ id: "delivery-memos-detail-escape", key: "esc", command: backCommand.id, when: "app.view == deliveryMemos.detail && !dialog.open && !input.editable", priority: 80 }), [backCommand.id]));

  const query = useQuery({ queryKey: queryKeys.deliveryMemos.detail(id), queryFn: () => fetchDeliveryMemoDetail(token ?? "", id), enabled: Boolean(token && id), staleTime: 20_000 });
  const scope = JSON.stringify({ "app.module": "deliveryMemos", "app.view": "deliveryMemos.detail", "entity.activeId": id, "detail.focused": true, "keyboard.scope": "detail" });

  if (query.isLoading) return <div data-keyboard-scope={scope}><WorkspacePage><div className="workspace-panel flex min-h-[54vh] items-center justify-center text-xs text-muted-foreground">Loading delivery memo…</div></WorkspacePage></div>;
  if (query.isError || !query.data) return <div data-keyboard-scope={scope}><WorkspacePage><WorkspacePageHeader kicker="Records · Delivery" title="Delivery memo detail" description="The delivery memo could not be loaded." backHref={null} onBack={goBack} icon={Truck}/><div className="workspace-panel flex min-h-[46vh] items-center justify-center p-6 text-center"><div><p className="text-sm font-semibold">Delivery memo unavailable</p><p className="mt-1 text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : "The backend did not return this delivery memo."}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void query.refetch()}>Retry</Button></div></div></WorkspacePage></div>;

  const memo = query.data;
  const invoicedSale = memo.sales[0];
  const openLinkedSale = () => {
    if (!invoicedSale) return;
    drilldownStack.push({ route: pathname, searchParams: searchParams.toString(), module: "deliveryMemos", view: "deliveryMemos.detail", activePointer: null, selectedIds: [], scrollOffset: window.scrollY });
    router.push(`/sales/${invoicedSale.id}`);
  };

  const itemColumns: ColumnDef<DeliveryMemoDetail["items"][number]>[] = [
    { id: "item", header: "Product", cell: ({ row }) => <div className="min-w-[clamp(11rem,20vw,24rem)]"><div className="font-semibold">{row.original.item?.name || "Product"}</div><div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{row.original.item?.sku || "No SKU"}</div></div> },
    { accessorKey: "quantity", header: "Qty", cell: ({ row }) => <span className="numeric-cell block text-right">{Number(row.original.quantity).toLocaleString("en-IN")}</span> },
    { accessorKey: "rate", header: "Rate", cell: ({ row }) => <span className="numeric-cell block text-right">{formatINR(row.original.rate)}</span> },
    { accessorKey: "totalAmount", header: "Line total", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.totalAmount)}</span> },
  ];
  const paymentColumns: ColumnDef<DeliveryMemoDetail["payments"][number]>[] = [
    { accessorKey: "createdAt", header: "Recorded", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.receivedAt || row.original.createdAt)}</span> },
    { accessorKey: "paymentMode", header: "Mode", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.paymentMode.replaceAll("_", " ")}</Badge> },
    { accessorKey: "referenceNumber", header: "Reference", cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.referenceNumber || "—"}</span> },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.amount)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right"><Badge variant="outline" className="text-[9px]">{row.original.status}</Badge></div> },
  ];

  return (
    <div data-keyboard-scope={scope}>
      <WorkspacePage>
        <WorkspacePageHeader kicker="Records · Delivery memo" title={memo.dmNumber} description="Credit-delivery document with separate lifecycle, payment, invoicing and return state from the backend domain model." backHref={null} onBack={goBack} icon={Truck} meta={<><Badge variant="secondary" className="text-[9px]">{memo.lifecycleStatus.replaceAll("_", " ")}</Badge><Badge variant="outline" className="text-[9px]">{memo.status.replaceAll("_", " ")}</Badge></>} actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5"/>Refresh</Button>} />
        <WorkspaceMetricGrid><WorkspaceMetric label="Memo value" value={formatINR(memo.estimatedAmount)} detail={`${memo.items.length} product lines`} icon={Truck} /><WorkspaceMetric label="Paid" value={formatINR(memo.paidAmount)} detail={`${memo.payments.length} payment records`} icon={WalletCards} tone={Number(memo.paidAmount) > 0 ? "success" : "neutral"} /><WorkspaceMetric label="Balance" value={formatINR(memo.balanceAmount)} detail={memo.expectedPaymentDate ? `Expected ${formatDate(memo.expectedPaymentDate)}` : "No expected payment date"} icon={WalletCards} tone={Number(memo.balanceAmount) > 0 ? "warning" : "success"} /><WorkspaceMetric label="Return state" value={(memo.returnStatus || "NO_RETURN").replaceAll("_", " ")} detail={`${memo.inventoryReturns.length} return records`} icon={PackageCheck} tone={memo.returnStatus && memo.returnStatus !== "NO_RETURN" ? "warning" : "neutral"} /></WorkspaceMetricGrid>

        <div className="workspace-two-column">
          <WorkspacePanel title="Customer and dispatch" description="Customer, staff, shop and related order context from GET /delivery-memos/:id."><div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs"><InfoLine label="Customer" value={memo.customer?.name || "—"} /><InfoLine label="Phone" value={memo.customer?.phone || "—"} mono /><InfoLine label="Recorded by" value={memo.staff?.name || "—"} /><InfoLine label="Shop" value={`${memo.shop?.name || "—"}${memo.shop?.city ? ` · ${memo.shop.city}` : ""}`} /><InfoLine label="Related order" value={memo.order?.orderNumber || "Direct delivery"} mono={Boolean(memo.order)} /></div></WorkspacePanel>
          <WorkspacePanel title="Document state" description="Each state dimension is displayed separately rather than collapsed into one badge."><div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs"><InfoLine label="Lifecycle" value={memo.lifecycleStatus.replaceAll("_", " ")} /><InfoLine label="Payment" value={memo.paymentStatus.replaceAll("_", " ")} /><InfoLine label="Invoicing" value={(memo.invoicingStatus || "NOT_INVOICED").replaceAll("_", " ")} /><InfoLine label="Return" value={(memo.returnStatus || "NO_RETURN").replaceAll("_", " ")} /><InfoLine label="Posted" value={memo.postedAt ? formatDateTime(memo.postedAt) : "Not posted"} /></div>{invoicedSale ? <div className="border-t p-3"><Button type="button" variant="outline" size="sm" className="h-9 w-full" onClick={openLinkedSale}>Open linked sale · {invoicedSale.saleNumber}</Button></div> : null}</WorkspacePanel>
        </div>

        <WorkspacePanel title="Delivery items" description="Stored item quantity, rate and line value from the memo."><OperationalDataTable id="deliveryMemos.detail.items" data={memo.items} columns={itemColumns} getRowId={(item) => item.id} emptyTitle="No delivery items" emptyDescription="The delivery memo contains no item lines." renderMobileCard={(item) => <div className="rounded-xl border bg-card p-3"><p className="text-sm font-semibold">{item.item?.name || "Product"}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.item?.sku || "No SKU"}</p><div className="mt-3 flex items-end justify-between border-t pt-2"><span className="text-[10px] text-muted-foreground">Qty {Number(item.quantity)}</span><span className="numeric-cell text-sm font-semibold">{formatINR(item.totalAmount)}</span></div></div>} /></WorkspacePanel>
        <WorkspacePanel title="Payment records" description="Payment records attached to this delivery memo preserve the backend verification state."><OperationalDataTable id="deliveryMemos.detail.payments" data={memo.payments} columns={paymentColumns} getRowId={(payment) => payment.id} emptyTitle="No payment records" emptyDescription="No payment is attached to this delivery memo." renderMobileCard={(payment) => <div className="rounded-xl border bg-card p-3"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold">{payment.paymentMode.replaceAll("_", " ")}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(payment.receivedAt || payment.createdAt)}</p></div><Badge variant="outline" className="text-[9px]">{payment.status}</Badge></div><div className="mt-3 border-t pt-2 text-right numeric-cell text-sm font-semibold">{formatINR(payment.amount)}</div></div>} /></WorkspacePanel>
      </WorkspacePage>
    </div>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex min-h-[clamp(2.6rem,5vh,3.15rem)] items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={`min-w-0 truncate text-right font-semibold ${mono ? "font-mono text-[10px]" : ""}`} title={value}>{value}</span></div>;
}
