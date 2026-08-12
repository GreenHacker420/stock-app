"use client";

import Link from "next/link";
import { use } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleAlert, CreditCard, FileText, RefreshCw, UserRound, WalletCards } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DecisionDialog } from "@/components/workspace/DecisionDialog";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { markPaymentMismatch, verifyPaymentDetail } from "@/features/registers/api/detail.mutations";
import { fetchPaymentDetail } from "@/features/registers/api/detail.queries";
import type { PaymentDetail } from "@/features/registers/lib/detail-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { cn, formatDateTime, formatINR } from "@/lib/utils";

type Decision = "VERIFY" | "MISMATCH" | null;

function statusBadge(status: PaymentDetail["status"]) {
  if (status === "VERIFIED") return <Badge className="bg-emerald-600 text-[9px] text-white">Verified</Badge>;
  if (status === "RECORDED") return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Recorded</Badge>;
  return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{status}</Badge>;
}

function linkedDocument(payment: PaymentDetail) {
  if (payment.sale) return { label: payment.sale.saleNumber, href: `/sales/${payment.sale.id}`, type: "Sale" };
  if (payment.deliveryMemo) return { label: payment.deliveryMemo.dmNumber, href: `/delivery-memos/${payment.deliveryMemo.id}`, type: "Delivery memo" };
  if (payment.order) return { label: payment.order.orderNumber, href: `/orders/${payment.order.id}`, type: "Order" };
  return null;
}

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { token, user } = useAuthStore();
  const [decision, setDecision] = React.useState<Decision>(null);
  const canVerify = hasPermission(user, PERMISSIONS.PAYMENT_VERIFY);

  const query = useQuery({
    queryKey: queryKeys.payments.detail(id),
    queryFn: () => fetchPaymentDetail(token ?? "", id),
    enabled: Boolean(token && id),
    staleTime: 20_000,
  });

  const mutation = useMutation({
    mutationFn: async ({ action, note }: { action: Exclude<Decision, null>; note?: string }) => {
      if (action === "VERIFY") return verifyPaymentDetail(token ?? "", id, note);
      return markPaymentMismatch(token ?? "", id, note);
    },
    onSuccess: async () => {
      setDecision(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.payments.detail(id) }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["delivery-memos"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
      ]);
    },
  });

  if (query.isLoading) return <WorkspacePage><div className="workspace-panel flex min-h-[54vh] items-center justify-center text-xs text-muted-foreground">Loading payment…</div></WorkspacePage>;
  if (query.isError || !query.data) return <WorkspacePage><WorkspacePageHeader kicker="Records · Payments" title="Payment detail" description="The payment could not be loaded." backHref="/payments" icon={CreditCard}/><div className="workspace-panel flex min-h-[46vh] items-center justify-center p-6 text-center"><div><p className="text-sm font-semibold">Payment unavailable</p><p className="mt-1 text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : "The backend did not return this payment."}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void query.refetch()}>Retry</Button></div></div></WorkspacePage>;

  const payment = query.data;
  const link = linkedDocument(payment);
  const canAct = canVerify && payment.status === "RECORDED";

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Records · Payment"
        title={formatINR(payment.amount)}
        description="Receipt detail with the backend verification state and actual linked transaction. Owner verification is available only for RECORDED payments."
        backHref="/payments"
        icon={CreditCard}
        meta={statusBadge(payment.status)}
        actions={(
          <>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button>
            {canAct ? <Button variant="outline" size="sm" className="h-9 gap-1.5 text-amber-700" onClick={() => setDecision("MISMATCH")}><CircleAlert className="size-3.5" />Mark mismatch</Button> : null}
            {canAct ? <Button size="sm" className="h-9 gap-1.5" onClick={() => setDecision("VERIFY")}><BadgeCheck className="size-3.5" />Verify payment</Button> : null}
          </>
        )}
      />

      {mutation.isError ? <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription className="text-xs">{mutation.error instanceof Error ? mutation.error.message : "Payment update failed."}</AlertDescription></Alert> : null}

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Amount" value={formatINR(payment.amount)} detail={payment.paymentMode.replaceAll("_", " ")} icon={WalletCards} />
        <WorkspaceMetric label="Status" value={payment.status} detail={payment.verifiedAt ? `Reviewed ${formatDateTime(payment.verifiedAt)}` : "Not owner-verified"} icon={BadgeCheck} tone={payment.status === "VERIFIED" ? "success" : payment.status === "RECORDED" ? "warning" : "danger"} />
        <WorkspaceMetric label="Customer" value={payment.customer?.name || "Unassigned / walk-in"} detail={payment.customer?.phone || "No phone"} icon={UserRound} />
        <WorkspaceMetric label="Linked document" value={link?.label || "Unlinked"} detail={link?.type || "No sale, delivery memo or order"} icon={FileText} tone={link ? "info" : "warning"} />
      </WorkspaceMetricGrid>

      <div className="workspace-two-column">
        <WorkspacePanel title="Receipt details" description="Fields returned by GET /payments/:id.">
          <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
            <InfoLine label="Payment mode" value={payment.paymentMode.replaceAll("_", " ")} />
            <InfoLine label="Received" value={formatDateTime(payment.receivedAt)} />
            <InfoLine label="Reference" value={payment.referenceNumber || "—"} mono />
            <InfoLine label="Notes" value={payment.notes || "—"} />
            <InfoLine label="Payment ID" value={payment.id} mono />
          </div>
        </WorkspacePanel>

        <WorkspacePanel title="Linked account" description="The payment service enforces that a payment can target at most one invoice/order document.">
          <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
            <InfoLine label="Customer" value={payment.customer?.name || "—"} />
            <InfoLine label="Linked type" value={link?.type || "Unlinked"} />
            <InfoLine label="Linked number" value={link?.label || "—"} mono={Boolean(link)} />
            <InfoLine label="Created" value={formatDateTime(payment.createdAt)} />
          </div>
          {link ? <div className="border-t p-3"><Link href={link.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 w-full")}>Open {link.type.toLowerCase()} · {link.label}</Link></div> : null}
        </WorkspacePanel>
      </div>

      <DecisionDialog
        open={Boolean(decision)}
        onOpenChange={(open) => !open && setDecision(null)}
        title={decision === "VERIFY" ? "Verify this payment?" : "Mark this payment as mismatch?"}
        description={decision === "VERIFY" ? "Verification is a real accounting action: the backend posts the customer ledger credit and recomputes the linked sale/DM/order payment state." : "This uses the backend mismatch handler. Include a note so the discrepancy is auditable."}
        confirmLabel={decision === "VERIFY" ? "Verify payment" : "Mark mismatch"}
        destructive={decision === "MISMATCH"}
        requireReason={decision === "MISMATCH"}
        reasonPlaceholder="Describe the payment mismatch…"
        pending={mutation.isPending}
        onConfirm={(note) => { if (decision) mutation.mutate({ action: decision, note: note || undefined }); }}
      />
    </WorkspacePage>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex min-h-[clamp(2.6rem,5vh,3.15rem)] items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={`min-w-0 truncate text-right font-semibold ${mono ? "font-mono text-[10px]" : ""}`} title={value}>{value}</span></div>;
}
