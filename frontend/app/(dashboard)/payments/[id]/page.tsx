"use client";

import { use, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleAlert, CreditCard, FileText, Loader2, PencilLine, RefreshCw, UserRound, WalletCards } from "lucide-react";

import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { MULTILINE_FORM_SCOPE } from "@/components/keyboard/KeyboardFormScope";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DecisionDialog } from "@/components/workspace/DecisionDialog";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { amendPaymentAmount, markPaymentMismatch, verifyPaymentDetail } from "@/features/registers/api/detail.mutations";
import { fetchPaymentDetail } from "@/features/registers/api/detail.queries";
import type { PaymentDetail } from "@/features/registers/lib/detail-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { drilldownStack } from "@/lib/navigation/drilldown-stack";
import { queueNavigationRestoration } from "@/lib/navigation/navigation-restoration";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDateTime, formatINR } from "@/lib/utils";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { token, user } = useAuthStore();
  const [decision, setDecision] = useState<Decision>(null);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendAmount, setAmendAmount] = useState("");
  const [amendReason, setAmendReason] = useState("");
  const [amendError, setAmendError] = useState<string | null>(null);
  const canVerify = hasPermission(user, PERMISSIONS.PAYMENT_VERIFY);

  const goBack = useCallback(() => {
    const frame = drilldownStack.pop();
    if (!frame) { router.push("/payments"); return; }
    queueNavigationRestoration(frame);
    router.push(`${frame.route}${frame.searchParams ? `?${frame.searchParams}` : ""}`);
  }, [router]);

  const backCommand = useMemo(() => ({ id: "payments.detail.back", title: "Back to Payment Register", execute: goBack }), [goBack]);
  useCommand(backCommand);
  useKeybinding(useMemo(() => ({ id: "payments-detail-escape", key: "esc", command: backCommand.id, when: "app.view == payments.detail && !dialog.open && !input.editable", priority: 80 }), [backCommand.id]));

  const query = useQuery({ queryKey: queryKeys.payments.detail(id), queryFn: () => fetchPaymentDetail(token ?? "", id), enabled: Boolean(token && id), staleTime: 20_000 });
  const paymentForActions = query.data;
  const canAmend = Boolean(
    canVerify
    && user?.role === "OWNER"
    && paymentForActions?.sale
    && ["RECORDED", "VERIFIED"].includes(paymentForActions.status),
  );

  const openAmend = useCallback(() => {
    if (!paymentForActions || !canAmend) return;
    setAmendAmount(String(paymentForActions.amount));
    setAmendReason("");
    setAmendError(null);
    setAmendOpen(true);
  }, [canAmend, paymentForActions]);

  const amendCommand = useMemo(() => ({
    id: "payments.detail.amendAmount",
    title: "Correct Payment Amount",
    category: "Payment",
    when: canAmend ? "app.view == payments.detail && !dialog.open" : "false",
    execute: openAmend,
  }), [canAmend, openAmend]);
  useCommand(amendCommand);

  const mutation = useMutation({
    mutationFn: async ({ action, note }: { action: Exclude<Decision, null>; note?: string }) => action === "VERIFY" ? verifyPaymentDetail(token ?? "", id, note) : markPaymentMismatch(token ?? "", id, note),
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

  const amendMutation = useMutation({
    mutationFn: ({ amount, reason, expectedUpdatedAt }: { amount: number; reason: string; expectedUpdatedAt: string }) => amendPaymentAmount(token ?? "", id, { amount, reason, expectedUpdatedAt }),
    onSuccess: async () => {
      setAmendOpen(false);
      setAmendError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.payments.detail(id) }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["cash-sessions"] }),
      ]);
    },
    onError: (cause) => setAmendError(cause instanceof Error ? cause.message : "Payment correction failed."),
  });

  const submitAmendment = useCallback(() => {
    if (!paymentForActions || !canAmend) return;
    const amount = Number(amendAmount);
    const reason = amendReason.trim();
    if (!Number.isFinite(amount) || amount <= 0) return setAmendError("Enter a payment amount greater than zero.");
    if (amount === Number(paymentForActions.amount)) return setAmendError("Enter a different payment amount.");
    if (reason.length < 3) return setAmendError("A correction reason of at least 3 characters is required.");
    setAmendError(null);
    amendMutation.mutate({ amount, reason, expectedUpdatedAt: paymentForActions.updatedAt });
  }, [amendAmount, amendMutation, amendReason, canAmend, paymentForActions]);

  const scope = JSON.stringify({
    "app.module": "payments",
    "app.view": "payments.detail",
    "entity.activeId": id,
    "detail.focused": true,
    "mutation.pending": mutation.isPending || amendMutation.isPending,
    "keyboard.scope": "detail",
  });

  if (query.isLoading) return <div data-keyboard-scope={scope}><WorkspacePage><div className="workspace-panel flex min-h-[54vh] items-center justify-center text-xs text-muted-foreground">Loading payment…</div></WorkspacePage></div>;
  if (query.isError || !query.data) return <div data-keyboard-scope={scope}><WorkspacePage><WorkspacePageHeader kicker="Records · Payments" title="Payment detail" description="The payment could not be loaded." backHref={null} onBack={goBack} icon={CreditCard}/><div className="workspace-panel flex min-h-[46vh] items-center justify-center p-6 text-center"><div><p className="text-sm font-semibold">Payment unavailable</p><p className="mt-1 text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : "The backend did not return this payment."}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void query.refetch()}>Retry</Button></div></div></WorkspacePage></div>;

  const payment = query.data;
  const link = linkedDocument(payment);
  const canAct = canVerify && payment.status === "RECORDED";
  const openLinked = () => {
    if (!link) return;
    drilldownStack.push({ route: pathname, searchParams: searchParams.toString(), module: "payments", view: "payments.detail", activePointer: null, selectedIds: [], scrollOffset: window.scrollY });
    router.push(link.href);
  };

  return (
    <div data-keyboard-scope={scope}>
      <WorkspacePage>
        <WorkspacePageHeader kicker="Records · Payment" title={formatINR(payment.amount)} description="Receipt detail with backend verification and audited correction semantics. Amount correction is limited to owner-controlled sale payments." backHref={null} onBack={goBack} icon={CreditCard} meta={statusBadge(payment.status)} actions={<><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button>{canAmend ? <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={amendMutation.isPending} onClick={openAmend}><PencilLine className="size-3.5" />Correct amount</Button> : null}{canAct ? <Button variant="outline" size="sm" className="h-9 gap-1.5 text-amber-700" disabled={mutation.isPending} onClick={() => setDecision("MISMATCH")}><CircleAlert className="size-3.5" />Mark mismatch</Button> : null}{canAct ? <Button size="sm" className="h-9 gap-1.5" disabled={mutation.isPending} onClick={() => setDecision("VERIFY")}><BadgeCheck className="size-3.5" />Verify payment</Button> : null}</>} />
        {mutation.isError ? <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription className="text-xs">{mutation.error instanceof Error ? mutation.error.message : "Payment update failed."}</AlertDescription></Alert> : null}
        <WorkspaceMetricGrid><WorkspaceMetric label="Amount" value={formatINR(payment.amount)} detail={payment.paymentMode.replaceAll("_", " ")} icon={WalletCards} /><WorkspaceMetric label="Status" value={payment.status} detail={payment.verifiedAt ? `Reviewed ${formatDateTime(payment.verifiedAt)}` : "Not owner-verified"} icon={BadgeCheck} tone={payment.status === "VERIFIED" ? "success" : payment.status === "RECORDED" ? "warning" : "danger"} /><WorkspaceMetric label="Customer" value={payment.customer?.name || "Unassigned / walk-in"} detail={payment.customer?.phone || "No phone"} icon={UserRound} /><WorkspaceMetric label="Linked document" value={link?.label || "Unlinked"} detail={link?.type || "No sale, delivery memo or order"} icon={FileText} tone={link ? "info" : "warning"} /></WorkspaceMetricGrid>

        <div className="workspace-two-column">
          <WorkspacePanel title="Receipt details" description="Fields returned by GET /payments/:id."><div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs"><InfoLine label="Payment mode" value={payment.paymentMode.replaceAll("_", " ")} /><InfoLine label="Received" value={formatDateTime(payment.receivedAt)} /><InfoLine label="Reference" value={payment.referenceNumber || "—"} mono /><InfoLine label="Notes" value={payment.notes || "—"} /><InfoLine label="Payment ID" value={payment.id} mono /></div></WorkspacePanel>
          <WorkspacePanel title="Linked account" description="The payment service enforces that a payment can target at most one invoice/order document."><div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs"><InfoLine label="Customer" value={payment.customer?.name || "—"} /><InfoLine label="Linked type" value={link?.type || "Unlinked"} /><InfoLine label="Linked number" value={link?.label || "—"} mono={Boolean(link)} /><InfoLine label="Created" value={formatDateTime(payment.createdAt)} /></div>{link ? <div className="border-t p-3"><Button type="button" variant="outline" size="sm" className="h-9 w-full" onClick={openLinked}>Open {link.type.toLowerCase()} · {link.label}</Button></div> : null}</WorkspacePanel>
        </div>

        <DecisionDialog open={Boolean(decision)} onOpenChange={(open) => !open && setDecision(null)} title={decision === "VERIFY" ? "Verify this payment?" : "Mark this payment as mismatch?"} description={decision === "VERIFY" ? "Verification is a real accounting action: the backend posts the customer ledger credit and recomputes the linked sale/DM/order payment state." : "This uses the backend mismatch handler. Include a note so the discrepancy is auditable."} confirmLabel={decision === "VERIFY" ? "Verify payment" : "Mark mismatch"} destructive={decision === "MISMATCH"} requireReason={decision === "MISMATCH"} reasonPlaceholder="Describe the payment mismatch…" pending={mutation.isPending} onConfirm={(note) => { if (decision) mutation.mutate({ action: decision, note: note || undefined }); }} />

        <Dialog open={amendOpen} onOpenChange={(open) => { if (!amendMutation.isPending) setAmendOpen(open); }}>
          <DialogContent className="w-[min(94vw,32rem)] sm:max-w-none">
            <DialogHeader><DialogTitle>Correct payment amount</DialogTitle><DialogDescription>This is available only for sale-linked RECORDED or VERIFIED payments. The backend uses optimistic concurrency, records a PaymentAmendment, updates the sale balance, adjusts cash-session expected cash when applicable, and posts a ledger delta for verified customer payments.</DialogDescription></DialogHeader>
            {amendError ? <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription className="text-xs">{amendError}</AlertDescription></Alert> : null}
            <div className="grid gap-3">
              <label><span className="workspace-kicker">Correct amount</span><Input autoFocus type="number" min="0.01" step="0.01" value={amendAmount} onChange={(event) => setAmendAmount(event.target.value)} className="mt-1 h-10 text-right font-mono text-sm" /></label>
              <label data-keyboard-scope={MULTILINE_FORM_SCOPE}><span className="workspace-kicker">Correction reason</span><Textarea value={amendReason} onChange={(event) => setAmendReason(event.target.value)} placeholder="Explain why the recorded amount is being corrected…" className="mt-1 min-h-24 text-xs" /></label>
              <div className="rounded-lg border bg-muted/20 p-3 text-[10px] leading-5 text-muted-foreground">Current amount: <strong className="text-foreground">{formatINR(payment.amount)}</strong>. If this payment changed on another device after this page loaded, the server rejects the correction and requires a refresh.</div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setAmendOpen(false)} disabled={amendMutation.isPending}>Cancel</Button><Button type="button" onClick={submitAmendment} disabled={amendMutation.isPending}>{amendMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <PencilLine className="size-4" />}Apply correction</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </WorkspacePage>
    </div>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex min-h-[clamp(2.6rem,5vh,3.15rem)] items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={`min-w-0 truncate text-right font-semibold ${mono ? "font-mono text-[10px]" : ""}`} title={value}>{value}</span></div>;
}
