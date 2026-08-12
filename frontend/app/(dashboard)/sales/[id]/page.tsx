"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, CheckCircle2, MessageSquare, Printer, Receipt, RefreshCw, WalletCards } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { fetchSaleDetail, sendSaleWhatsAppReceipt } from "@/features/sales/api/sale-detail.query";
import type { SaleDetailItem, SaleDetailPayment } from "@/features/sales/lib/sale-detail-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { printInvoiceDocument } from "@/lib/pdf/invoice-print";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDate, formatDateTime, formatINR } from "@/lib/utils";

function paymentRecordBadge(status: SaleDetailPayment["status"]) {
  if (status === "VERIFIED") return <Badge className="bg-emerald-600 text-[9px] text-white">Verified</Badge>;
  if (status === "RECORDED") return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Recorded</Badge>;
  return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{status}</Badge>;
}

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, shops, activeShopId } = useAuthStore();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const selectedShop = shops.find((shop) => shop.id === activeShopId) || shops[0];

  const query = useQuery({
    queryKey: queryKeys.sales.detail(id),
    queryFn: () => fetchSaleDetail(token ?? "", id),
    enabled: Boolean(token && id),
    staleTime: 30_000,
  });

  const whatsappMutation = useMutation({
    mutationFn: () => sendSaleWhatsAppReceipt(token ?? "", id),
    onSuccess: () => setFeedback({ type: "success", message: "WhatsApp receipt request completed successfully." }),
    onError: (error) => setFeedback({ type: "error", message: error instanceof Error ? error.message : "WhatsApp receipt could not be sent." }),
  });

  const itemColumns: ColumnDef<SaleDetailItem>[] = [
    { id: "item", header: "Product", cell: ({ row }) => <div className="min-w-[clamp(11rem,20vw,24rem)]"><div className="font-semibold">{row.original.item?.name || "Product"}</div><div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{row.original.item?.sku || "No SKU"}{row.original.serialNumbers?.length ? ` · ${row.original.serialNumbers.length} serial(s)` : ""}</div></div> },
    { accessorKey: "quantity", header: "Qty", cell: ({ row }) => <span className="numeric-cell block text-right">{Number(row.original.quantity).toLocaleString("en-IN")}</span> },
    { accessorKey: "rate", header: "Rate", cell: ({ row }) => <span className="numeric-cell block text-right">{formatINR(row.original.rate)}</span> },
    { accessorKey: "discountAmount", header: "Discount", cell: ({ row }) => <span className="numeric-cell block text-right text-muted-foreground">{formatINR(row.original.discountAmount)}</span> },
    { accessorKey: "totalAmount", header: "Line total", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.totalAmount)}</span> },
  ];

  const paymentColumns: ColumnDef<SaleDetailPayment>[] = [
    { accessorKey: "receivedAt", header: "Received", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.receivedAt)}</span> },
    { accessorKey: "paymentMode", header: "Mode", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.paymentMode.replaceAll("_", " ")}</Badge> },
    { accessorKey: "referenceNumber", header: "Reference", cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.referenceNumber || "—"}</span> },
    { id: "receivedBy", header: "Recorded by", cell: ({ row }) => <span className="text-muted-foreground">{row.original.receivedBy?.name || "—"}</span> },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.amount)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right">{paymentRecordBadge(row.original.status)}</div> },
  ];

  if (query.isLoading) {
    return <WorkspacePage><div className="workspace-panel flex min-h-[54vh] items-center justify-center text-xs text-muted-foreground">Loading sale record…</div></WorkspacePage>;
  }

  if (query.isError || !query.data) {
    return <WorkspacePage><WorkspacePageHeader kicker="Records · Sales" title="Sale detail" description="The sale could not be loaded." backHref="/sales" icon={Receipt} /><div className="workspace-panel flex min-h-[46vh] items-center justify-center p-6 text-center"><div><AlertCircle className="mx-auto mb-3 size-7 text-destructive"/><p className="text-sm font-semibold">Sale unavailable</p><p className="mt-1 text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : "The backend did not return this sale."}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void query.refetch()}>Retry</Button></div></div></WorkspacePage>;
  }

  const sale = query.data;
  const gstLabel = !sale.gstRequired ? "Not required" : sale.gstInvoiceStatus.replaceAll("_", " ");

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Records · Sale"
        title={sale.saleNumber}
        description="Server-authoritative sale lines, payment verification and live receivable balance. No tax percentage or line total is recomputed in the browser."
        backHref="/sales"
        icon={Receipt}
        meta={<><Badge variant="secondary" className="text-[9px]">{sale.saleStatus.replaceAll("_", " ")}</Badge><Badge variant="outline" className="text-[9px]">{sale.paymentStatus.replaceAll("_", " ")}</Badge></>}
        actions={<><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5"/>Refresh</Button><Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={whatsappMutation.isPending} onClick={() => whatsappMutation.mutate()}><MessageSquare className="size-3.5"/>{whatsappMutation.isPending ? "Sending…" : "WhatsApp"}</Button><Button size="sm" className="h-9 gap-1.5" onClick={() => selectedShop && void printInvoiceDocument(sale, selectedShop)} disabled={!selectedShop}><Printer className="size-3.5"/>Print</Button></>}
      />

      {feedback ? <Alert variant={feedback.type === "error" ? "destructive" : "default"} className={feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-300" : undefined}>{feedback.type === "success" ? <CheckCircle2 className="size-4"/> : <AlertCircle className="size-4"/>}<AlertDescription className="text-xs">{feedback.message}</AlertDescription></Alert> : null}

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Total" value={formatINR(sale.totalAmount)} detail={`Subtotal ${formatINR(sale.subtotal)} · Discount ${formatINR(sale.discountAmount)}`} icon={Receipt} />
        <WorkspaceMetric label="Verified paid" value={formatINR(sale.verifiedPaidAmount)} detail="Only VERIFIED payment records" icon={WalletCards} tone="success" />
        <WorkspaceMetric label="Recorded, unverified" value={formatINR(sale.recordedPaymentAmount)} detail="RECORDED payment value awaiting verification" icon={WalletCards} tone={Number(sale.recordedPaymentAmount) > 0 ? "warning" : "neutral"} />
        <WorkspaceMetric label="Balance due" value={formatINR(sale.balanceAmount)} detail="Computed by backend from verified payments" icon={WalletCards} tone={Number(sale.balanceAmount) > 0 ? "danger" : "success"} />
      </WorkspaceMetricGrid>

      <div className="workspace-two-column">
        <WorkspacePanel title="Customer and document" description="Identity and GST document state stored on the sale.">
          <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
            <InfoLine label="Customer" value={sale.customer?.name || "Walk-in Customer"} />
            <InfoLine label="Phone" value={sale.customer?.phone || "—"} mono />
            <InfoLine label="Sale date" value={formatDate(sale.saleDate)} />
            <InfoLine label="GST state" value={gstLabel} />
            <InfoLine label="GST invoice number" value={sale.gstInvoiceNumber || "—"} mono />
          </div>
        </WorkspacePanel>

        <WorkspacePanel title="Operational metadata" description="Who recorded the sale and its persisted status/version.">
          <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
            <InfoLine label="Recorded by" value={`${sale.staff?.name || "—"} · ${sale.staff?.role || ""}`} />
            <InfoLine label="Created" value={formatDateTime(sale.createdAt)} />
            <InfoLine label="Sale status" value={sale.saleStatus.replaceAll("_", " ")} />
            <InfoLine label="Receivable origin" value={sale.receivableOrigin?.replaceAll("_", " ") || "Sale"} />
            <InfoLine label="Version" value={sale.version == null ? "—" : String(sale.version)} mono />
          </div>
        </WorkspacePanel>
      </div>

      <WorkspacePanel title="Sale items" description="Stored quantity, rate, discount and line totals from the backend sale record.">
        <OperationalDataTable data={sale.items} columns={itemColumns} getRowId={(item) => item.id} emptyTitle="No sale items" emptyDescription="The sale record contains no line items." renderMobileCard={(item) => <div className="rounded-xl border bg-card p-3"><p className="text-sm font-semibold">{item.item?.name || "Product"}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.item?.sku || "No SKU"}</p><div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-right"><div><p className="workspace-kicker">Qty</p><p className="numeric-cell mt-1 text-xs font-semibold">{Number(item.quantity)}</p></div><div><p className="workspace-kicker">Rate</p><p className="numeric-cell mt-1 text-xs font-semibold">{formatINR(item.rate)}</p></div><div><p className="workspace-kicker">Total</p><p className="numeric-cell mt-1 text-xs font-semibold">{formatINR(item.totalAmount)}</p></div></div></div>} />
      </WorkspacePanel>

      <WorkspacePanel title="Payment records" description="Verification state is preserved per receipt; RECORDED amounts do not reduce the backend verified balance until verified.">
        <OperationalDataTable data={sale.payments} columns={paymentColumns} getRowId={(payment) => payment.id} emptyTitle="No payment records" emptyDescription="This sale currently has no payment records." renderMobileCard={(payment) => <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{payment.paymentMode.replaceAll("_", " ")}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(payment.receivedAt)}</p></div>{paymentRecordBadge(payment.status)}</div><div className="mt-3 border-t pt-2 text-right numeric-cell text-base font-semibold">{formatINR(payment.amount)}</div></div>} />
      </WorkspacePanel>
    </WorkspacePage>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex min-h-[clamp(2.6rem,5vh,3.15rem)] items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={`min-w-0 truncate text-right font-semibold ${mono ? "font-mono text-[10px]" : ""}`} title={value}>{value}</span></div>;
}
