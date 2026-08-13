"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, FilePenLine, Loader2, ReceiptText } from "lucide-react";

import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkspacePanel } from "@/components/workspace/WorkspacePage";
import type { DeliveryMemoDetail } from "@/features/registers/lib/detail-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { createIdempotencyKey } from "@/lib/idempotency";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { formatINR } from "@/lib/utils";
import { convertDeliveryMemoToSaleAction } from "../api/transaction-actions.api";

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function paymentHref(memo: DeliveryMemoDetail): string {
  const params = new URLSearchParams({
    dmId: memo.id,
    customerId: memo.customerId,
    customerName: memo.customer?.name || "Customer",
    documentNumber: memo.dmNumber,
    amount: String(Math.max(0, numeric(memo.balanceAmount))),
  });
  return `/payments/new?${params.toString()}`;
}

export function DeliveryMemoOperationsPanel({ memo }: { memo: DeliveryMemoDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, user } = useAuthStore();
  const [convertOpen, setConvertOpen] = useState(false);
  const [gstRequired, setGstRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEditDraft = hasPermission(user, PERMISSIONS.DM_CREATE) && memo.lifecycleStatus === "DRAFT";
  const canReceivePayment = hasPermission(user, PERMISSIONS.PAYMENT_CREATE)
    && memo.lifecycleStatus === "DISPATCHED"
    && numeric(memo.balanceAmount) > 0;
  const canConvertSale = hasPermission(user, PERMISSIONS.SALE_CREATE)
    && memo.lifecycleStatus === "DISPATCHED"
    && (memo.invoicingStatus || "NOT_INVOICED") === "NOT_INVOICED"
    && (memo.returnStatus || "NO_RETURN") === "NO_RETURN"
    && memo.documentPurpose === "CREDIT_DELIVERY";

  const convertMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Authentication is required.");
      return convertDeliveryMemoToSaleAction(token, memo.id, gstRequired, createIdempotencyKey("DM_SALE"));
    },
    onSuccess: async (sale) => {
      setError(null);
      setConvertOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["delivery-memos"] }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      router.push(`/sales/${sale.id}`);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Delivery memo conversion failed."),
  });

  const openPayment = useCallback(() => {
    if (canReceivePayment) router.push(paymentHref(memo));
  }, [canReceivePayment, memo, router]);

  const editDraft = useCallback(() => {
    if (canEditDraft) router.push(`/delivery-memos/new?draftId=${encodeURIComponent(memo.id)}`);
  }, [canEditDraft, memo.id, router]);

  const commands = useMemo(() => ({
    editDraft: {
      id: "deliveryMemos.detail.editDraft",
      title: "Edit Delivery Memo Draft",
      category: "Delivery Memo",
      when: canEditDraft ? "app.view == deliveryMemos.detail && !dialog.open" : "false",
      execute: editDraft,
    },
    receivePayment: {
      id: "deliveryMemos.detail.receivePayment",
      title: "Receive Payment for Delivery Memo",
      category: "Transactions",
      when: canReceivePayment ? "app.view == deliveryMemos.detail && !dialog.open" : "false",
      execute: openPayment,
    },
    convertSale: {
      id: "deliveryMemos.detail.convertToSale",
      title: "Convert Delivery Memo to Sale",
      category: "Delivery Memo",
      when: canConvertSale ? "app.view == deliveryMemos.detail && !dialog.open" : "false",
      execute: () => setConvertOpen(true),
    },
  }), [canConvertSale, canEditDraft, canReceivePayment, editDraft, openPayment]);

  useCommand(commands.editDraft);
  useCommand(commands.receivePayment);
  useCommand(commands.convertSale);
  useKeybinding(useMemo(() => ({
    id: "delivery-memos-detail-f6-linked-payment",
    key: "f6",
    command: commands.receivePayment.id,
    when: canReceivePayment ? "app.view == deliveryMemos.detail && !dialog.open" : "false",
    priority: 220,
  }), [canReceivePayment, commands.receivePayment.id]));

  if (!canEditDraft && !canReceivePayment && !canConvertSale && !error) return null;

  return (
    <>
      <WorkspacePanel title="Delivery memo operations" description="Draft editing, collection and invoicing use the backend document lifecycle instead of local status changes.">
        <div className="flex flex-col gap-3 p-[clamp(0.75rem,1vw,1rem)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold">Current lifecycle · {memo.lifecycleStatus.replaceAll("_", " ")}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{error || (memo.lifecycleStatus === "DRAFT" ? "Draft is non-destructive until posting." : `Balance ${formatINR(memo.balanceAmount)} · ${(memo.invoicingStatus || "NOT_INVOICED").replaceAll("_", " ")}`)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEditDraft ? <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={editDraft}><FilePenLine className="size-3.5" />Edit / post draft</Button> : null}
            {canReceivePayment ? <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={openPayment}><CreditCard className="size-3.5" />Receive payment <span className="font-mono text-[9px] text-muted-foreground">F6</span></Button> : null}
            {canConvertSale ? <Button type="button" className="h-9 gap-1.5" onClick={() => setConvertOpen(true)}><ReceiptText className="size-3.5" />Generate sale invoice</Button> : null}
          </div>
        </div>
      </WorkspacePanel>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="w-[min(94vw,32rem)] sm:max-w-none">
          <DialogHeader><DialogTitle>Convert {memo.dmNumber} to sale?</DialogTitle><DialogDescription>The backend carries the memo items, current payments and remaining balance into the sale, then marks this delivery memo fully invoiced. No additional stock deduction occurs during this conversion.</DialogDescription></DialogHeader>
          <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3"><input type="checkbox" checked={gstRequired} onChange={(event) => setGstRequired(event.target.checked)} className="mt-0.5 size-4" /><span><span className="block text-xs font-semibold">GST invoice required</span><span className="mt-0.5 block text-[10px] text-muted-foreground">When enabled, the created sale starts with GST invoice status PENDING.</span></span></label>
          <div className="grid grid-cols-3 gap-2"><Value label="Memo value" value={formatINR(memo.estimatedAmount)} /><Value label="Paid" value={formatINR(memo.paidAmount)} /><Value label="Balance" value={formatINR(memo.balanceAmount)} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setConvertOpen(false)} disabled={convertMutation.isPending}>Keep delivery memo</Button><Button type="button" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>{convertMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />}Create sale invoice</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 p-3 text-right"><p className="workspace-kicker">{label}</p><p className="numeric-cell mt-1 text-xs font-semibold">{value}</p></div>;
}
