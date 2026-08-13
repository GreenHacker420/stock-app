"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BadgeCheck, Boxes, CreditCard, Loader2, PackageCheck, PackageOpen, ShoppingCart, Truck, UserRound, XCircle } from "lucide-react";

import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { MULTILINE_FORM_SCOPE } from "@/components/keyboard/KeyboardFormScope";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DecisionDialog } from "@/components/workspace/DecisionDialog";
import { WorkspacePanel } from "@/components/workspace/WorkspacePage";
import type { OrderDetail, OrderDetailItem } from "@/features/registers/lib/detail-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { createIdempotencyKey } from "@/lib/idempotency";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { formatINR } from "@/lib/utils";
import {
  assignOrderStaffAction,
  cancelOrderAction,
  confirmOrderAction,
  convertOrderToSaleAction,
  createDmFromOrderAction,
  fetchStaffOptions,
  markOrderItemPackedAction,
  reportOrderShortageAction,
  startOrderPackingAction,
  type OrderDispatchItem,
} from "../api/transaction-actions.api";


type Decision = "CONFIRM" | "CANCEL" | "CONVERT_SALE" | null;
type OrderAction =
  | { type: "confirm" }
  | { type: "assign"; staffId: string }
  | { type: "startPacking" }
  | { type: "pack"; item: OrderDetailItem; quantity: number }
  | { type: "shortage"; item: OrderDetailItem; availableQuantity: number; reason: string }
  | { type: "createDm"; items: OrderDispatchItem[]; expectedPaymentDate?: string; reason?: string }
  | { type: "convertSale"; items: OrderDispatchItem[] }
  | { type: "cancel"; reason?: string };

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function packedRemaining(item: OrderDetailItem): number {
  return Math.max(0, numeric(item.quantityPacked) - numeric(item.quantityDispatched));
}

function parseSerials(value: string): string[] {
  return value.split(/[\n,]+/).map((serial) => serial.trim().toUpperCase()).filter(Boolean);
}

function paymentHref(order: OrderDetail): string {
  const params = new URLSearchParams({
    orderId: order.id,
    customerId: order.customerId,
    customerName: order.customer?.name || "Customer",
    documentNumber: order.orderNumber,
    amount: String(Math.max(0, numeric(order.balanceAmount))),
  });
  return `/payments/new?${params.toString()}`;
}

export function OrderOperationsPanel({ order, onChanged }: { order: OrderDetail; onChanged: () => void | Promise<unknown> }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, user } = useAuthStore();
  const [decision, setDecision] = useState<Decision>(null);
  const [shortageItem, setShortageItem] = useState<OrderDetailItem | null>(null);
  const [shortageAvailable, setShortageAvailable] = useState("");
  const [shortageReason, setShortageReason] = useState("");
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchDate, setDispatchDate] = useState("");
  const [dispatchReason, setDispatchReason] = useState("");
  const [serialDrafts, setSerialDrafts] = useState<Record<string, string>>({});
  const [assignStaffId, setAssignStaffId] = useState(order.assignedStaffId || "");
  const [error, setError] = useState<string | null>(null);

  const isOwner = user?.role === "OWNER";
  const canAssign = isOwner && hasPermission(user, PERMISSIONS.ORDER_ASSIGN_STAFF) && !["DISPATCHED", "CANCELLED"].includes(order.status);
  const canPack = hasPermission(user, PERMISSIONS.PACKING_UPDATE) && ["PACKING", "PARTIALLY_PACKED"].includes(order.status);
  const canStartPacking = hasPermission(user, PERMISSIONS.PACKING_UPDATE) && order.status === "CONFIRMED" && Boolean(order.assignedStaffId);
  const canConfirm = isOwner && order.status === "DRAFT";
  const canCancel = isOwner && !["DISPATCHED", "CANCELLED"].includes(order.status);
  const canReceivePayment = hasPermission(user, PERMISSIONS.PAYMENT_CREATE) && order.status !== "CANCELLED" && numeric(order.balanceAmount) > 0;
  const dispatchableItems = useMemo(() => order.items.filter((item) => packedRemaining(item) > 0), [order.items]);
  const canCreateDm = hasPermission(user, PERMISSIONS.DM_CREATE)
    && ["PACKED", "PARTIALLY_PACKED", "PARTIALLY_DISPATCHED"].includes(order.status)
    && dispatchableItems.length > 0;
  const hasSerialTracked = order.items.some((item) => Boolean(item.item.requiresSerialNumber));
  const canConvertSale = hasPermission(user, PERMISSIONS.SALE_CREATE)
    && order.status === "PACKED"
    && order.dispatches.length === 0
    && numeric(order.paidAmount) === 0
    && !hasSerialTracked;

  const staffQuery = useQuery({
    queryKey: ["auth", "staff-options"],
    queryFn: () => fetchStaffOptions(token ?? ""),
    enabled: Boolean(token && canAssign),
    staleTime: 60_000,
  });
  const staffOptions = (staffQuery.data ?? []).filter((staff) => staff.status === "ACTIVE" && staff.role === "STAFF");

  const mutation = useMutation({
    mutationFn: async (action: OrderAction): Promise<{ href?: string }> => {
      if (!token) throw new Error("Authentication is required.");
      switch (action.type) {
        case "confirm":
          await confirmOrderAction(token, order.id);
          return {};
        case "assign":
          await assignOrderStaffAction(token, order.id, action.staffId);
          return {};
        case "startPacking":
          await startOrderPackingAction(token, order.id);
          return {};
        case "pack":
          await markOrderItemPackedAction(token, order.id, action.item.id, action.quantity);
          return {};
        case "shortage":
          await reportOrderShortageAction(token, order.id, action.item.id, action.availableQuantity, action.reason);
          return {};
        case "createDm": {
          const memo = await createDmFromOrderAction(token, order.id, {
            items: action.items,
            expectedPaymentDate: action.expectedPaymentDate,
            reason: action.reason,
          }, createIdempotencyKey("ORDER_DM"));
          return { href: `/delivery-memos/${memo.id}` };
        }
        case "convertSale": {
          const sale = await convertOrderToSaleAction(token, order.id, { items: action.items }, createIdempotencyKey("ORDER_SALE"));
          return { href: `/sales/${sale.id}` };
        }
        case "cancel":
          await cancelOrderAction(token, order.id, action.reason, createIdempotencyKey("ORDER_CANCEL"));
          return {};
      }
    },
    onSuccess: async (result) => {
      setError(null);
      setDecision(null);
      setShortageItem(null);
      setDispatchOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["delivery-memos"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      if (result.href) router.push(result.href);
      else await onChanged();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Order action failed."),
  });

  const openPayment = useCallback(() => {
    if (canReceivePayment) router.push(paymentHref(order));
  }, [canReceivePayment, order, router]);

  const commands = useMemo(() => ({
    receivePayment: {
      id: "orders.detail.receivePayment",
      title: "Receive Payment for Order",
      category: "Transactions",
      when: canReceivePayment ? "app.view == orders.detail && !dialog.open" : "false",
      execute: openPayment,
    },
    confirm: {
      id: "orders.detail.confirm",
      title: "Confirm Order",
      category: "Order",
      when: canConfirm ? "app.view == orders.detail && !dialog.open" : "false",
      execute: () => setDecision("CONFIRM"),
    },
    startPacking: {
      id: "orders.detail.startPacking",
      title: "Start Packing",
      category: "Order",
      when: canStartPacking ? "app.view == orders.detail && !dialog.open" : "false",
      execute: () => mutation.mutate({ type: "startPacking" }),
    },
    createDm: {
      id: "orders.detail.createDeliveryMemo",
      title: "Dispatch as Delivery Memo",
      category: "Order",
      when: canCreateDm ? "app.view == orders.detail && !dialog.open" : "false",
      execute: () => setDispatchOpen(true),
    },
    convertSale: {
      id: "orders.detail.convertToSale",
      title: "Convert Order to Sale",
      category: "Order",
      when: canConvertSale ? "app.view == orders.detail && !dialog.open" : "false",
      execute: () => setDecision("CONVERT_SALE"),
    },
    cancel: {
      id: "orders.detail.cancel",
      title: "Cancel Order",
      category: "Order",
      when: canCancel ? "app.view == orders.detail && !dialog.open" : "false",
      execute: () => setDecision("CANCEL"),
    },
  }), [canCancel, canConfirm, canConvertSale, canCreateDm, canReceivePayment, canStartPacking, mutation, openPayment]);

  useCommand(commands.receivePayment);
  useCommand(commands.confirm);
  useCommand(commands.startPacking);
  useCommand(commands.createDm);
  useCommand(commands.convertSale);
  useCommand(commands.cancel);
  useKeybinding(useMemo(() => ({
    id: "orders-detail-f6-linked-payment",
    key: "f6",
    command: commands.receivePayment.id,
    when: canReceivePayment ? "app.view == orders.detail && !dialog.open" : "false",
    priority: 220,
  }), [canReceivePayment, commands.receivePayment.id]));

  const submitShortage = () => {
    if (!shortageItem) return;
    const availableQuantity = Number(shortageAvailable);
    if (!Number.isFinite(availableQuantity) || availableQuantity < 0 || availableQuantity > numeric(shortageItem.quantityOrdered)) {
      setError(`Available quantity must be between 0 and ${numeric(shortageItem.quantityOrdered)}.`);
      return;
    }
    if (!shortageReason.trim()) {
      setError("A shortage reason is required.");
      return;
    }
    mutation.mutate({ type: "shortage", item: shortageItem, availableQuantity, reason: shortageReason.trim() });
  };

  const createDm = () => {
    const items: OrderDispatchItem[] = [];
    for (const item of dispatchableItems) {
      const quantity = packedRemaining(item);
      const serialNumbers = parseSerials(serialDrafts[item.id] || "");
      if (item.item.requiresSerialNumber && serialNumbers.length !== quantity) {
        setError(`${item.item.name} requires exactly ${quantity} serial number(s) for this dispatch.`);
        return;
      }
      items.push({
        orderItemId: item.id,
        itemId: item.itemId,
        quantity,
        rate: numeric(item.rate),
        discountAmount: numeric(item.discountAmount),
        serialNumbers: serialNumbers.length ? serialNumbers : undefined,
      });
    }
    if (items.length === 0) {
      setError("No packed quantity is available to dispatch.");
      return;
    }
    mutation.mutate({
      type: "createDm",
      items,
      expectedPaymentDate: dispatchDate ? new Date(`${dispatchDate}T12:00:00`).toISOString() : undefined,
      reason: dispatchReason.trim() || undefined,
    });
  };

  const convertItems = dispatchableItems.map((item) => ({
    orderItemId: item.id,
    itemId: item.itemId,
    quantity: packedRemaining(item),
    rate: numeric(item.rate),
    discountAmount: numeric(item.discountAmount),
  })).filter((item) => item.quantity > 0);

  return (
    <>
      <WorkspacePanel title="Order operations" description="Actions below map to dedicated backend transitions; there is no generic client-side status mutation.">
        {error ? <div className="p-3 pb-0"><Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription className="text-xs">{error}</AlertDescription></Alert></div> : null}
        <div className="grid gap-3 p-[clamp(0.75rem,1vw,1rem)] lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.45fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {canConfirm ? <Button type="button" className="h-9 gap-1.5" disabled={mutation.isPending} onClick={() => setDecision("CONFIRM")}><BadgeCheck className="size-3.5" />Confirm & reserve</Button> : null}
              {canStartPacking ? <Button type="button" className="h-9 gap-1.5" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: "startPacking" })}><PackageOpen className="size-3.5" />Start packing</Button> : null}
              {canCreateDm ? <Button type="button" className="h-9 gap-1.5" disabled={mutation.isPending} onClick={() => setDispatchOpen(true)}><Truck className="size-3.5" />Dispatch as DM</Button> : null}
              {canConvertSale ? <Button type="button" variant="outline" className="h-9 gap-1.5" disabled={mutation.isPending} onClick={() => setDecision("CONVERT_SALE")}><ShoppingCart className="size-3.5" />Convert to sale</Button> : null}
              {canReceivePayment ? <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={openPayment}><CreditCard className="size-3.5" />Receive payment <span className="font-mono text-[9px] text-muted-foreground">F6</span></Button> : null}
              {canCancel ? <Button type="button" variant="outline" className="h-9 gap-1.5 text-rose-700" disabled={mutation.isPending} onClick={() => setDecision("CANCEL")}><XCircle className="size-3.5" />Cancel order</Button> : null}
            </div>

            {canPack ? (
              <div className="space-y-2 rounded-xl border bg-muted/15 p-3">
                <div><p className="text-xs font-semibold">Packing lines</p><p className="mt-0.5 text-[10px] text-muted-foreground">Pack only the remaining quantity, or report the final available quantity when stock is short.</p></div>
                {order.items.map((item) => {
                  const ordered = numeric(item.quantityOrdered);
                  const packed = numeric(item.quantityPacked);
                  const remaining = Math.max(0, ordered - packed);
                  return <div key={item.id} className="flex flex-col gap-2 rounded-lg border bg-background p-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-xs font-semibold">{item.item.name}</p><p className="mt-0.5 text-[9px] text-muted-foreground">Ordered {ordered} · Packed {packed} · Remaining {remaining}</p></div><div className="flex gap-1.5">{remaining > 0 ? <Button type="button" size="sm" className="h-8 gap-1" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: "pack", item, quantity: remaining })}><PackageCheck className="size-3" />Pack remainder</Button> : <Badge variant="secondary" className="self-center text-[9px]">Packed</Badge>}{remaining > 0 ? <Button type="button" size="sm" variant="outline" className="h-8" disabled={mutation.isPending} onClick={() => { setShortageItem(item); setShortageAvailable(String(packed)); setShortageReason(""); setError(null); }}>Shortage</Button> : null}</div></div>;
                })}
              </div>
            ) : null}

            {!canConvertSale && order.status === "PACKED" && (hasSerialTracked || numeric(order.paidAmount) > 0) ? <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-[10px] leading-5 text-amber-800 dark:border-amber-950 dark:bg-amber-950/20 dark:text-amber-200">Direct order→sale conversion is withheld here when the order already has payments or contains serial-tracked products, because the current backend conversion does not migrate those document-level semantics safely. Dispatch through the serial-aware DM flow instead.</div> : null}
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="flex items-center gap-2"><UserRound className="size-4 text-muted-foreground" /><p className="text-xs font-semibold">Packing assignment</p></div>
            <p className="mt-1 text-[10px] text-muted-foreground">Packing cannot start until an assignable staff member is attached to the order.</p>
            {canAssign ? <div className="mt-3 space-y-2"><select value={assignStaffId} onChange={(event) => setAssignStaffId(event.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs"><option value="">Select staff…</option>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} · {staff.mobile}</option>)}</select><Button type="button" variant="outline" className="h-9 w-full" disabled={!assignStaffId || mutation.isPending || assignStaffId === order.assignedStaffId} onClick={() => mutation.mutate({ type: "assign", staffId: assignStaffId })}>{staffQuery.isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <UserRound className="size-3.5" />}Assign staff</Button></div> : <p className="mt-3 text-xs font-semibold">{order.assignedStaff?.name || "Unassigned"}</p>}
          </div>
        </div>
      </WorkspacePanel>

      <DecisionDialog open={decision === "CONFIRM"} onOpenChange={(open) => !open && setDecision(null)} title="Confirm this order?" description="Confirmation locks and validates stock reservations. The order cannot be confirmed if the requested stock is unavailable." confirmLabel="Confirm & reserve" pending={mutation.isPending} onConfirm={() => mutation.mutate({ type: "confirm" })} />
      <DecisionDialog open={decision === "CANCEL"} onOpenChange={(open) => !open && setDecision(null)} title="Cancel this order?" description="Cancellation releases active stock reservations and cancels pending packing tasks. Dispatched orders cannot be cancelled." confirmLabel="Cancel order" destructive requireReason reasonPlaceholder="Reason for cancellation…" pending={mutation.isPending} onConfirm={(reason) => mutation.mutate({ type: "cancel", reason: reason || undefined })} />
      <DecisionDialog open={decision === "CONVERT_SALE"} onOpenChange={(open) => !open && setDecision(null)} title="Convert packed order to sale?" description="This creates a sale, deducts stock, creates the customer receivable and dispatches the order. This action is only offered for fully packed orders with no prior dispatch, no serial-tracked lines and no existing order payment." confirmLabel="Convert to sale" pending={mutation.isPending} onConfirm={() => mutation.mutate({ type: "convertSale", items: convertItems })} />

      <Dialog open={Boolean(shortageItem)} onOpenChange={(open) => { if (!open) setShortageItem(null); }}>
        <DialogContent className="w-[min(94vw,30rem)] sm:max-w-none">
          <DialogHeader><DialogTitle>Report packing shortage</DialogTitle><DialogDescription>{shortageItem ? `${shortageItem.item.name} · ordered ${numeric(shortageItem.quantityOrdered)}` : "Record the final available quantity."}</DialogDescription></DialogHeader>
          <div className="grid gap-3"><label><span className="workspace-kicker">Final available / packed quantity</span><Input type="number" min="0" step="any" value={shortageAvailable} onChange={(event) => setShortageAvailable(event.target.value)} className="mt-1 h-10 text-right font-mono" /></label><label data-keyboard-scope={MULTILINE_FORM_SCOPE}><span className="workspace-kicker">Shortage reason</span><Textarea value={shortageReason} onChange={(event) => setShortageReason(event.target.value)} placeholder="Damaged, missing stock, count mismatch…" className="mt-1 min-h-20 text-xs" /></label></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setShortageItem(null)} disabled={mutation.isPending}>Cancel</Button><Button type="button" onClick={submitShortage} disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Boxes className="size-4" />}Record shortage</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <DialogContent className="w-[min(96vw,42rem)] sm:max-w-none">
          <DialogHeader><DialogTitle>Dispatch packed goods as Delivery Memo</DialogTitle><DialogDescription>Only packed-but-not-dispatched quantities are sent. The backend re-checks stock and serial uniqueness before posting the memo and customer receivable.</DialogDescription></DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">{dispatchableItems.map((item) => { const quantity = packedRemaining(item); return <div key={item.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">{item.item.name}</p><p className="mt-0.5 text-[9px] text-muted-foreground">Dispatch {quantity} {item.item.unit} · {formatINR(item.rate)} each</p></div>{item.item.requiresSerialNumber ? <Badge variant="outline" className="text-[9px]">Serial required</Badge> : null}</div>{item.item.requiresSerialNumber ? <label className="mt-2 block" data-keyboard-scope={MULTILINE_FORM_SCOPE}><span className="workspace-kicker">{quantity} serial number(s) · one per line</span><Textarea value={serialDrafts[item.id] || ""} onChange={(event) => setSerialDrafts((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1 min-h-20 font-mono text-xs" placeholder="SERIAL-001\nSERIAL-002" /></label> : null}</div>; })}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label><span className="workspace-kicker">Expected payment date</span><input type="date" value={dispatchDate} onChange={(event) => setDispatchDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs" /></label><label data-keyboard-scope={MULTILINE_FORM_SCOPE}><span className="workspace-kicker">Dispatch note</span><Textarea value={dispatchReason} onChange={(event) => setDispatchReason(event.target.value)} className="mt-1 min-h-16 text-xs" placeholder="Optional dispatch note…" /></label></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDispatchOpen(false)} disabled={mutation.isPending}>Continue packing</Button><Button type="button" onClick={createDm} disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}Post delivery memo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
