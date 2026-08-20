"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Boxes, FileCheck2, Loader2, Save, Truck, UserRound, WalletCards } from "lucide-react";

import { KeyboardFormScope, MULTILINE_FORM_SCOPE } from "@/components/keyboard/KeyboardFormScope";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { KernelSearchPicker } from "@/components/workspace/KernelSearchPicker";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { useCustomerSearchQuery, useItemSearchQuery } from "@/features/sales/api/sale.queries";
import type { CustomerSearchResult, ItemWithStock } from "@/features/sales/lib/sale-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { createIdempotencyKey } from "@/lib/idempotency";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { formatINR } from "@/lib/utils";
import { createDeliveryMemoDraftApi, fetchDeliveryMemoDraftApi, postDeliveryMemoApi, updateDeliveryMemoDraftApi } from "../api/transaction.api";
import type { DeliveryMemoDraft, DeliveryMemoPayload, TransactionLine } from "../lib/transaction-types";
import { TransactionLineEditor } from "./TransactionLineEditor";

function lineFromItem(item: ItemWithStock): TransactionLine {
  return {
    key: createIdempotencyKey("LINE"),
    itemId: item.id,
    name: item.name,
    sku: item.sku || "",
    unit: item.unit,
    quantity: 1,
    rate: Number(item.defaultSellingPrice || 0),
    availableStock: item.availableStock == null ? null : Number(item.availableStock),
    minimumAllowedPrice: item.minimumAllowedPrice == null ? null : Number(item.minimumAllowedPrice),
    requiresSerialNumber: Boolean(item.requiresSerialNumber),
    serialNumbers: [],
    description: "",
  };
}

export function DeliveryMemoCreateWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { token, activeShopId, shops, user } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const permitted = hasPermission(user, PERMISSIONS.DM_CREATE);
  const draftIdFromRoute = searchParams.get("draftId") || "";
  const hydratedDraftRef = useRef<string | null>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [lines, setLines] = useState<TransactionLine[]>([]);
  const [expectedPaymentDate, setExpectedPaymentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<Pick<DeliveryMemoDraft, "id" | "version"> | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftIdempotencyKey] = useState(() => createIdempotencyKey("DM_DRAFT"));
  const [postIdempotencyKey] = useState(() => createIdempotencyKey("DM_POST"));

  const draftQuery = useQuery({
    queryKey: ["delivery-memos", "draft-edit", draftIdFromRoute],
    queryFn: () => fetchDeliveryMemoDraftApi(token ?? "", draftIdFromRoute),
    enabled: Boolean(token && draftIdFromRoute && permitted),
    staleTime: 10_000,
  });
  const customers = useCustomerSearchQuery({ token, shopId, search: customerQuery, enabled: permitted });
  const items = useItemSearchQuery({ token, shopId, search: itemQuery, enabled: permitted });

  useEffect(() => {
    const loaded = draftQuery.data;
    if (!loaded || hydratedDraftRef.current === loaded.id) return;
    hydratedDraftRef.current = loaded.id;
    setDraft({ id: loaded.id, version: loaded.version });
    setCustomer({
      id: loaded.customer.id,
      name: loaded.customer.name,
      phone: loaded.customer.phone || null,
      type: loaded.customer.type === "BUSINESS" ? "BUSINESS" : "REGULAR",
      outstandingAmount: null,
      status: "ACTIVE",
    });
    setExpectedPaymentDate(loaded.expectedPaymentDate ? loaded.expectedPaymentDate.slice(0, 10) : "");
    setNotes(loaded.deliveryNotes || "");
    setLines(loaded.items.map((entry) => ({
      key: createIdempotencyKey("LINE"),
      itemId: entry.itemId,
      name: entry.item.name,
      sku: entry.item.sku || "",
      unit: entry.item.unit,
      quantity: Number(entry.quantity),
      rate: Number(entry.rate),
      availableStock: entry.item.availableStock == null ? null : Number(entry.item.availableStock),
      minimumAllowedPrice: entry.item.minimumAllowedPrice == null ? null : Number(entry.item.minimumAllowedPrice),
      requiresSerialNumber: Boolean(entry.item.requiresSerialNumber),
      serialNumbers: Array.isArray(entry.serialNumbers) ? entry.serialNumbers : [],
      description: entry.description || "",
    })));
  }, [draftQuery.data]);

  const totalValue = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.rate) || 0), 0), [lines]);
  const serialRequired = useMemo(() => lines.filter((line) => line.requiresSerialNumber).length, [lines]);

  const updateLine = useCallback((key: string, patch: Partial<TransactionLine>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }, []);

  const buildPayload = useCallback((): DeliveryMemoPayload | null => {
    if (!customer || !shopId) return null;
    return {
      shopId,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      expectedPaymentDate: expectedPaymentDate ? new Date(`${expectedPaymentDate}T12:00:00`).toISOString() : undefined,
      documentPurpose: "CREDIT_DELIVERY",
      deliveryNotes: notes.trim() || undefined,
      items: lines.map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
        serialNumbers: line.serialNumbers,
        description: line.description.trim() || undefined,
      })),
    };
  }, [customer, expectedPaymentDate, lines, notes, shopId]);

  const validate = useCallback((forPosting: boolean): string | null => {
    if (!customer) return "Select a named customer before creating the delivery memo.";
    if (customer.type === "WALK_IN") return "Credit delivery requires a named customer account.";
    if (lines.length === 0) return "Add at least one product to the delivery memo.";
    for (const line of lines) {
      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) return `Enter a positive quantity for ${line.name}.`;
      if (!Number.isFinite(Number(line.rate)) || Number(line.rate) <= 0) return `Enter a positive rate for ${line.name}.`;
      if (!forPosting) continue;
      if (line.availableStock !== null && Number(line.quantity) > line.availableStock) return `${line.name} has only ${line.availableStock} ${line.unit} available.`;
      if (line.requiresSerialNumber && line.serialNumbers.length !== Number(line.quantity)) return `${line.name} requires exactly ${line.quantity} serial number(s).`;
      if (user?.role === "STAFF" && line.minimumAllowedPrice !== null && Number(line.rate) < line.minimumAllowedPrice) return `${line.name} cannot be dispatched below ${formatINR(line.minimumAllowedPrice)}.`;
    }
    return null;
  }, [customer, lines, user?.role]);

  const persistDraftMutation = useMutation({
    mutationFn: async (payload: DeliveryMemoPayload) => {
      if (!draft) return createDeliveryMemoDraftApi(token ?? "", payload, draftIdempotencyKey);
      const { shopId: _shopId, customerName: _customerName, ...updatePayload } = payload;
      return updateDeliveryMemoDraftApi(token ?? "", draft.id, { ...updatePayload, version: draft.version });
    },
    onSuccess: (saved) => {
      setDraft({ id: saved.id, version: saved.version });
      if (searchParams.get("draftId") !== saved.id) router.replace(`/delivery-memos/new?draftId=${encodeURIComponent(saved.id)}`, { scroll: false });
      queryClient.setQueryData(["delivery-memos", "draft-edit", saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ["delivery-memos"] });
    },
  });

  const postMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version?: number }) => postDeliveryMemoApi(token ?? "", id, version, postIdempotencyKey),
    onSuccess: async (posted) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["delivery-memos"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      router.push(`/delivery-memos/${posted.id}`);
    },
  });

  const saveDraft = useCallback(async () => {
    setError(null);
    const validation = validate(false);
    if (validation) return setError(validation);
    const payload = buildPayload();
    if (!payload || !token) return setError("Select an active shop and customer before saving.");
    try {
      await persistDraftMutation.mutateAsync(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delivery memo draft could not be saved.");
    }
  }, [buildPayload, persistDraftMutation, token, validate]);

  const review = useCallback(() => {
    setError(null);
    const validation = validate(true);
    if (validation) return setError(validation);
    setReviewOpen(true);
  }, [validate]);

  const confirmPost = useCallback(async () => {
    const payload = buildPayload();
    if (!payload || !token) return;
    setError(null);
    try {
      const saved = await persistDraftMutation.mutateAsync(payload);
      setReviewOpen(false);
      await postMutation.mutateAsync({ id: saved.id, version: saved.version });
    } catch (cause) {
      setReviewOpen(false);
      setError(cause instanceof Error ? cause.message : "Delivery memo could not be posted. The draft remains available for review.");
    }
  }, [buildPayload, persistDraftMutation, postMutation, token]);

  const pending = persistDraftMutation.isPending || postMutation.isPending;

  if (!permitted) {
    return <WorkspacePage><WorkspacePageHeader kicker="Transactions · Delivery" title="New delivery memo" description="Delivery memo creation requires dm:create permission." icon={Truck} /><div className="workspace-panel p-6 text-sm text-muted-foreground">You do not have permission to create delivery memos.</div></WorkspacePage>;
  }

  if (draftIdFromRoute && draftQuery.isLoading) return <WorkspacePage><div className="workspace-panel flex min-h-[50vh] items-center justify-center text-xs text-muted-foreground">Loading delivery memo draft…</div></WorkspacePage>;
  if (draftIdFromRoute && draftQuery.isError) return <WorkspacePage><WorkspacePageHeader kicker="Transactions · Delivery" title="Edit delivery memo draft" description="The requested draft could not be loaded." icon={Truck} backHref="/delivery-memos" /><Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription className="text-xs">{draftQuery.error instanceof Error ? draftQuery.error.message : "Draft unavailable"}</AlertDescription></Alert></WorkspacePage>;

  return (
    <KeyboardFormScope id="deliveryMemos.create" onSubmit={review} disabled={pending}>
      <WorkspacePage>
        <WorkspacePageHeader kicker="Transactions · Delivery" title={draft ? "Edit delivery memo draft" : "New delivery memo"} description="Draft first, then explicitly post. Posting validates serials and stock, deducts inventory and creates the customer receivable." icon={Truck} backHref="/delivery-memos" meta={<><Badge variant="outline" className="text-[9px]">Alt+F8</Badge>{draft ? <Badge variant="secondary" className="text-[9px]">Draft saved</Badge> : null}</>} />
        {error ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription className="text-xs">{error}</AlertDescription></Alert> : null}

        <WorkspaceMetricGrid>
          <WorkspaceMetric label="Memo value" value={formatINR(totalValue)} detail={`${lines.length} product line${lines.length === 1 ? "" : "s"}`} icon={WalletCards} tone="info" />
          <WorkspaceMetric label="Customer" value={customer?.name || "Not selected"} detail={customer?.phone || "Named credit customer required"} icon={UserRound} />
          <WorkspaceMetric label="Serial-tracked lines" value={serialRequired} detail="Exact serial count required at posting" icon={Boxes} tone={serialRequired > 0 ? "warning" : "neutral"} />
          <WorkspaceMetric label="Posting model" value="Draft → Post" detail="Stock and receivable change only at Post" icon={FileCheck2} tone="success" />
        </WorkspaceMetricGrid>

        <div className="workspace-two-column">
          <WorkspacePanel title="Credit customer" description="Walk-in accounts are intentionally excluded because CREDIT_DELIVERY creates a receivable.">
            <div className="p-[clamp(0.75rem,1vw,1rem)]"><KernelSearchPicker id="deliveryMemos.customer" label="Customer account" query={customerQuery} onQueryChange={setCustomerQuery} items={(customers.data ?? []).filter((item) => item.type !== "WALK_IN")} getKey={(item) => item.id} getLabel={(item) => item.name} getMeta={(item) => item.phone || item.type} onSelect={(item) => { setCustomer(item); setCustomerQuery(""); }} selectedLabel={customer?.name} selectedMeta={customer ? `${customer.phone || "No phone"} · ${customer.type}` : null} onClear={() => setCustomer(null)} placeholder="Search named customer…" loading={customers.isFetching} /></div>
          </WorkspacePanel>
          <WorkspacePanel title="Delivery terms" description="Expected payment date and delivery notes are stored with the memo.">
            <div className="grid gap-3 p-[clamp(0.75rem,1vw,1rem)]">
              <label><span className="workspace-kicker">Expected payment date</span><input data-kernel-field type="date" value={expectedPaymentDate} onChange={(event) => setExpectedPaymentDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" /></label>
              <label data-keyboard-scope={MULTILINE_FORM_SCOPE}><span className="workspace-kicker">Delivery notes</span><Textarea data-kernel-field value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Dispatch instructions or document note…" className="mt-1 min-h-20 text-xs" /></label>
            </div>
          </WorkspacePanel>
        </div>

        <WorkspacePanel title="Delivery items" description="Serial-tracked products require exactly one serial number per dispatched unit before posting.">
          <div className="border-b p-[clamp(0.75rem,1vw,1rem)]"><KernelSearchPicker id="deliveryMemos.item" label="Add product" query={itemQuery} onQueryChange={setItemQuery} items={(items.data ?? []).filter((item) => !lines.some((line) => line.itemId === item.id))} getKey={(item) => item.id} getLabel={(item) => item.name} getMeta={(item) => `${item.sku || "No SKU"} · ${Number(item.availableStock ?? 0).toLocaleString("en-IN")} available`} onSelect={(item) => { setLines((current) => [...current, lineFromItem(item)]); setItemQuery(""); }} placeholder="Search product name or SKU…" loading={items.isFetching} /></div>
          <div className="p-[clamp(0.75rem,1vw,1rem)]"><TransactionLineEditor lines={lines} onChange={updateLine} onRemove={(key) => setLines((current) => current.filter((line) => line.key !== key))} serialMode /></div>
          <div className="flex flex-col gap-3 border-t bg-muted/20 p-[clamp(0.75rem,1vw,1rem)] sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold">{formatINR(totalValue)} credit delivery</p><p className="mt-0.5 text-[10px] text-muted-foreground">Save Draft is non-destructive. Review & Post performs the stock/credit write.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" className="h-10 gap-2" disabled={pending} onClick={() => void saveDraft()}>{persistDraftMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{draft ? "Update draft" : "Save draft"}</Button><Button type="button" className="h-10 gap-2" disabled={pending} onClick={review}><FileCheck2 className="size-4" />Review & post</Button></div></div>
        </WorkspacePanel>

        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent className="w-[min(94vw,38rem)] sm:max-w-none">
            <DialogHeader><DialogTitle>Post delivery memo?</DialogTitle><DialogDescription>Posting is the accounting and inventory boundary. The server will re-check stock, serial allocation, staff minimum pricing and customer credit before committing.</DialogDescription></DialogHeader>
            <div className="grid gap-2 sm:grid-cols-3"><ReviewValue label="Customer" value={customer?.name || "—"} /><ReviewValue label="Lines" value={String(lines.length)} /><ReviewValue label="Value" value={formatINR(totalValue)} /></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-[10px] leading-5 text-amber-800 dark:border-amber-950 dark:bg-amber-950/20 dark:text-amber-200">This can deduct stock and create customer receivable. If posting fails after the draft is saved, the draft remains recoverable and can be retried with the same document.</div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setReviewOpen(false)} disabled={pending}>Continue editing</Button><Button type="button" onClick={() => void confirmPost()} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}Post dispatch</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </WorkspacePage>
    </KeyboardFormScope>
  );
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 p-3"><p className="workspace-kicker">{label}</p><p className="mt-1 truncate text-xs font-semibold">{value}</p></div>;
}
