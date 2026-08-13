"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CreditCard, FileText, Loader2, Save, UserRound, WalletCards } from "lucide-react";

import { KeyboardFormScope, MULTILINE_FORM_SCOPE } from "@/components/keyboard/KeyboardFormScope";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KernelSearchPicker } from "@/components/workspace/KernelSearchPicker";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { useCustomerSearchQuery } from "@/features/sales/api/sale.queries";
import type { CustomerSearchResult } from "@/features/sales/lib/sale-types";
import type { PaymentMode } from "@/features/registers/lib/register-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { createIdempotencyKey } from "@/lib/idempotency";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { formatINR } from "@/lib/utils";
import { createPaymentApi } from "../api/transaction.api";
import type { PaymentPayload } from "../lib/transaction-types";

const PAYMENT_MODES: Array<{ value: PaymentMode; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
];

function todayKey(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type CustomerMode = "walkin" | "customer";

type LinkedDocument = {
  type: "sale" | "dm" | "order";
  id: string;
  number: string;
};

export function PaymentCreateWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { token, activeShopId, shops, user } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const permitted = hasPermission(user, PERMISSIONS.PAYMENT_CREATE);

  const linkedRefs = useMemo(() => [
    searchParams.get("saleId") ? { type: "sale" as const, id: searchParams.get("saleId")! } : null,
    searchParams.get("dmId") ? { type: "dm" as const, id: searchParams.get("dmId")! } : null,
    searchParams.get("orderId") ? { type: "order" as const, id: searchParams.get("orderId")! } : null,
  ].filter((value): value is { type: "sale" | "dm" | "order"; id: string } => Boolean(value)), [searchParams]);
  const linked: LinkedDocument | null = linkedRefs.length === 1 ? { ...linkedRefs[0], number: searchParams.get("documentNumber") || linkedRefs[0].id.slice(0, 10) } : null;
  const invalidLink = linkedRefs.length > 1;
  const linkedCustomerId = searchParams.get("customerId") || undefined;
  const linkedCustomerName = searchParams.get("customerName") || undefined;

  const suggestedAmount = Number(searchParams.get("amount") || 0);
  const [customerMode, setCustomerMode] = useState<CustomerMode>(linkedCustomerId ? "customer" : "walkin");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [amount, setAmount] = useState(() => suggestedAmount > 0 ? String(suggestedAmount) : "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [paymentDate, setPaymentDate] = useState(todayKey);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeDate, setChequeDate] = useState(todayKey);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(invalidLink ? "Only one of saleId, dmId or orderId can be linked to a payment." : null);
  const [idempotencyKey] = useState(() => createIdempotencyKey("PAYMENT"));

  const customers = useCustomerSearchQuery({ token, shopId, search: customerQuery, enabled: permitted && !linked && customerMode === "customer" });
  const numericAmount = Number(amount);

  const mutation = useMutation({
    mutationFn: (payload: PaymentPayload) => createPaymentApi(token ?? "", payload, idempotencyKey),
    onSuccess: async (payment) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["delivery-memos"] }),
        queryClient.invalidateQueries({ queryKey: ["cash-sessions"] }),
      ]);
      router.push(`/payments/${payment.id}`);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Payment could not be recorded."),
  });

  const submit = useCallback(() => {
    setError(null);
    if (invalidLink) return setError("Only one linked document is allowed.");
    if (!permitted) return setError("You do not have permission to record payments.");
    if (!token || !shopId) return setError("Select an active shop before recording a payment.");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter a payment amount greater than zero.");
    if (!linked && customerMode === "customer" && !customer) return setError("Select a customer or switch to Walk-in / unlinked.");

    const customerId = linkedCustomerId || (customerMode === "customer" ? customer?.id : undefined);
    const details = paymentMode === "CHEQUE" ? {
      chequeNumber: referenceNumber.trim() || undefined,
      chequeBankName: bankName.trim() || undefined,
      chequeDate: chequeDate ? new Date(`${chequeDate}T12:00:00`).toISOString() : undefined,
    } : undefined;

    mutation.mutate({
      shopId,
      saleId: linked?.type === "sale" ? linked.id : undefined,
      dmId: linked?.type === "dm" ? linked.id : undefined,
      orderId: linked?.type === "order" ? linked.id : undefined,
      customerId,
      paymentMode,
      amount: numericAmount,
      paymentDate: paymentDate || undefined,
      referenceNumber: referenceNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      details,
    });
  }, [bankName, chequeDate, customer, customerMode, invalidLink, linked, linkedCustomerId, mutation, notes, numericAmount, paymentDate, paymentMode, permitted, referenceNumber, shopId, token]);

  if (!permitted) {
    return <WorkspacePage><WorkspacePageHeader kicker="Transactions · Collections" title="Receive payment" description="Payment entry requires payment:create permission." icon={CreditCard} /><div className="workspace-panel p-6 text-sm text-muted-foreground">You do not have permission to record payments.</div></WorkspacePage>;
  }

  return (
    <KeyboardFormScope id="payments.create" onSubmit={submit} disabled={mutation.isPending || invalidLink}>
      <WorkspacePage>
        <WorkspacePageHeader kicker="Transactions · Collections" title="Receive payment" description="Records a real backend payment receipt. Owner verification remains a separate accounting action." icon={CreditCard} backHref="/payments" meta={<Badge variant="outline" className="text-[9px]">F6 · Ctrl+Enter to save</Badge>} />
        {error ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription className="text-xs">{error}</AlertDescription></Alert> : null}

        <WorkspaceMetricGrid>
          <WorkspaceMetric label="Amount" value={Number.isFinite(numericAmount) && numericAmount > 0 ? formatINR(numericAmount) : "₹0"} detail={PAYMENT_MODES.find((mode) => mode.value === paymentMode)?.label || paymentMode} icon={WalletCards} tone="info" />
          <WorkspaceMetric label="Customer" value={linkedCustomerName || customer?.name || (customerMode === "walkin" ? "Walk-in" : "Not selected")} detail={linked ? "Customer is derived from linked document when available" : customerMode === "walkin" ? "Backend walk-in account" : customer?.phone || "Customer account"} icon={UserRound} />
          <WorkspaceMetric label="Linked document" value={linked ? linked.number : "Unlinked"} detail={linked ? linked.type.toUpperCase() : "May be attached later"} icon={FileText} tone={linked ? "success" : "neutral"} />
          <WorkspaceMetric label="Receipt state" value="RECORDED" detail="Verification is performed separately" icon={CreditCard} tone="warning" />
        </WorkspaceMetricGrid>

        <div className="workspace-two-column">
          <WorkspacePanel title="Receipt target" description="A payment can target at most one sale, delivery memo or order.">
            <div className="space-y-3 p-[clamp(0.75rem,1vw,1rem)]">
              {linked ? (
                <div className="rounded-xl border bg-muted/25 p-3"><p className="workspace-kicker">Linked {linked.type}</p><p className="mt-1 font-mono text-sm font-semibold">{linked.number}</p><p className="mt-1 text-[10px] text-muted-foreground">The backend validates that this document belongs to the active shop and derives its customer.</p></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2"><Button type="button" variant={customerMode === "walkin" ? "secondary" : "outline"} className="h-9" onClick={() => { setCustomerMode("walkin"); setCustomer(null); }}>Walk-in / unlinked</Button><Button type="button" variant={customerMode === "customer" ? "secondary" : "outline"} className="h-9" onClick={() => setCustomerMode("customer")}>Customer account</Button></div>
                  {customerMode === "customer" ? <KernelSearchPicker id="payments.customer" label="Customer" query={customerQuery} onQueryChange={setCustomerQuery} items={customers.data ?? []} getKey={(item) => item.id} getLabel={(item) => item.name} getMeta={(item) => item.phone || item.type} onSelect={(item) => { setCustomer(item); setCustomerQuery(""); }} selectedLabel={customer?.name} selectedMeta={customer?.phone || customer?.type} onClear={() => setCustomer(null)} placeholder="Search customer name or phone…" loading={customers.isFetching} /> : <div className="rounded-lg border border-dashed p-3 text-[10px] text-muted-foreground">No named customer is required. The backend assigns the shop walk-in account.</div>}
                </>
              )}
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="Payment details" description="Mode-specific receipt metadata is stored with the payment record.">
            <div className="grid gap-3 p-[clamp(0.75rem,1vw,1rem)] sm:grid-cols-2">
              <label><span className="workspace-kicker">Amount</span><Input data-kernel-field autoFocus type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" className="mt-1 h-10 text-right font-mono text-sm" /></label>
              <label><span className="workspace-kicker">Payment mode</span><select data-kernel-field value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">{PAYMENT_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
              <label><span className="workspace-kicker">Payment date</span><input data-kernel-field type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" /></label>
              <label><span className="workspace-kicker">{paymentMode === "CHEQUE" ? "Cheque number" : "Reference"}</span><Input data-kernel-field value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder={paymentMode === "UPI" ? "UTR / transaction ID" : paymentMode === "CHEQUE" ? "Cheque number" : "Optional reference"} className="mt-1 h-10 text-xs" /></label>
              {paymentMode === "CHEQUE" ? <><label><span className="workspace-kicker">Bank name</span><Input data-kernel-field value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Issuing bank" className="mt-1 h-10 text-xs" /></label><label><span className="workspace-kicker">Cheque date</span><input data-kernel-field type="date" value={chequeDate} onChange={(event) => setChequeDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" /></label></> : null}
              <label className="sm:col-span-2" data-keyboard-scope={MULTILINE_FORM_SCOPE}><span className="workspace-kicker">Notes</span><Textarea data-kernel-field value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional collection note…" className="mt-1 min-h-20 text-xs" /></label>
            </div>
          </WorkspacePanel>
        </div>

        <div className="workspace-panel flex flex-col gap-3 p-[clamp(0.75rem,1vw,1rem)] sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold">Record {Number.isFinite(numericAmount) && numericAmount > 0 ? formatINR(numericAmount) : "payment"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">The receipt is recorded first; owner verification posts the accounting credit.</p></div><Button type="button" className="h-10 gap-2 sm:min-w-40" disabled={mutation.isPending || invalidLink} onClick={submit}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Record payment</Button></div>
      </WorkspacePage>
    </KeyboardFormScope>
  );
}
