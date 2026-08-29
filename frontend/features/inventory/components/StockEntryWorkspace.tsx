"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Boxes, Loader2, Minus, Plus, Save, Warehouse, X } from "lucide-react";

import { KeyboardFormScope, MULTILINE_FORM_SCOPE } from "@/components/keyboard/KeyboardFormScope";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KernelSearchPicker } from "@/components/workspace/KernelSearchPicker";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { useItemSearchQuery } from "@/features/sales/api/sale.queries";
import type { ItemWithStock } from "@/features/sales/lib/sale-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { createIdempotencyKey } from "@/lib/idempotency";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";
import { createStockEntry, type StockEntryPayload } from "../api/inventory.mutations";

type EntryLine = {
  item: ItemWithStock;
  quantity: string;
};

function numberOrZero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function StockEntryWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, activeShopId, shops, user } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const permitted = hasPermission(user, PERMISSIONS.STOCK_CREATE_MOVEMENT);
  const isStaff = user?.role === "STAFF";
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => createIdempotencyKey("STOCK_ENTRY"));

  const items = useItemSearchQuery({ token, shopId, search, enabled: permitted });
  const nonZeroLines = useMemo(() => lines.filter((line) => numberOrZero(line.quantity) !== 0), [lines]);
  const netAdjustment = useMemo(() => nonZeroLines.reduce((sum, line) => sum + numberOrZero(line.quantity), 0), [nonZeroLines]);
  const additions = useMemo(() => nonZeroLines.filter((line) => numberOrZero(line.quantity) > 0).length, [nonZeroLines]);
  const deductions = nonZeroLines.length - additions;

  const mutation = useMutation({
    mutationFn: (payload: StockEntryPayload) => createStockEntry(token ?? "", payload, idempotencyKey),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["approvals"] }),
      ]);
      if (!Array.isArray(result) && result.isRequest) router.push("/inventory");
      else router.push("/inventory?view=movements");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Stock entry could not be submitted."),
  });

  const submit = useCallback(() => {
    setError(null);
    if (!permitted) return setError("You do not have permission to submit stock movements.");
    if (!token || !shopId) return setError("Select an active shop before submitting stock entry.");
    if (nonZeroLines.length === 0) return setError("Add at least one non-zero stock adjustment.");
    mutation.mutate({
      shopId,
      entries: nonZeroLines.map((line) => ({ itemId: line.item.id, quantity: numberOrZero(line.quantity) })),
      notes: notes.trim() || undefined,
    });
  }, [mutation, nonZeroLines, notes, permitted, shopId, token]);

  if (!permitted) {
    return <WorkspacePage><WorkspacePageHeader kicker="Inventory · Write" title="Stock entry" description="Stock entry requires stock:create_movement permission." icon={Warehouse} backHref="/inventory" /><div className="workspace-panel p-6 text-sm text-muted-foreground">You do not have permission to submit stock movements.</div></WorkspacePage>;
  }

  return (
    <KeyboardFormScope id="inventory.stockEntry" onSubmit={submit} disabled={mutation.isPending}>
      <WorkspacePage>
        <WorkspacePageHeader kicker="Inventory · Write" title="Stock entry" description={isStaff ? "Staff submissions become owner approval requests; inventory is not changed until approval." : "Owner stock entry posts signed inventory adjustments directly to the stock ledger."} icon={Warehouse} backHref="/inventory" meta={<Badge variant="outline" className="text-[9px]">F9 · Ctrl+Enter to submit</Badge>} />
        {error ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription className="text-xs">{error}</AlertDescription></Alert> : null}

        <WorkspaceMetricGrid>
          <WorkspaceMetric label="Changed products" value={nonZeroLines.length} detail={`${additions} additions · ${deductions} deductions`} icon={Boxes} />
          <WorkspaceMetric label="Net units" value={netAdjustment > 0 ? `+${netAdjustment}` : netAdjustment} detail="Signed sum across current entry" icon={Warehouse} tone={netAdjustment < 0 ? "warning" : "success"} />
          <WorkspaceMetric label="Write mode" value={isStaff ? "Approval request" : "Direct ledger"} detail={isStaff ? "Owner approval required" : "Posts immediately"} icon={Save} tone={isStaff ? "warning" : "success"} />
        </WorkspaceMetricGrid>

        <WorkspacePanel title="Inventory adjustments" description="Positive quantity adds stock. Negative quantity records a manual reduction. Virtual bundle products are rejected by the backend; adjust their component items instead.">
          <div className="border-b p-[clamp(0.75rem,1vw,1rem)]">
            <KernelSearchPicker
              id="inventory.stockEntry.item"
              label="Add product"
              query={search}
              onQueryChange={setSearch}
              items={(items.data ?? []).filter((item) => !lines.some((line) => line.item.id === item.id))}
              getKey={(item) => item.id}
              getLabel={(item) => item.name}
              getMeta={(item) => `${item.sku || "No SKU"} · ${numberOrZero(item.physicalStock).toLocaleString("en-IN")} physical`}
              onSelect={(item) => { setLines((current) => [...current, { item, quantity: "" }]); setSearch(""); }}
              placeholder="Search product name or SKU…"
              loading={items.isFetching}
            />
          </div>

          <div className="space-y-2 p-[clamp(0.75rem,1vw,1rem)]">
            {lines.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">Add products to create a stock entry.</div> : lines.map((line, index) => {
              const adjustment = numberOrZero(line.quantity);
              const physical = numberOrZero(line.item.physicalStock);
              const proposed = physical + adjustment;
              return <div key={line.item.id} className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[9px]">{index + 1}</span><p className="truncate text-xs font-semibold">{line.item.name}</p></div><p className="mt-1 font-mono text-[9px] text-muted-foreground">{line.item.sku || "No SKU"} · Current physical {physical.toLocaleString("en-IN")} {line.item.unit}</p></div><div className="flex items-center gap-1"><Button type="button" variant="outline" size="icon-sm" aria-label={`Decrease ${line.item.name}`} onClick={() => setLines((current) => current.map((entry) => entry.item.id === line.item.id ? { ...entry, quantity: String(numberOrZero(entry.quantity) - 1) } : entry))}><Minus className="size-3.5" /></Button><Input data-kernel-field type="number" step="any" value={line.quantity} onChange={(event) => setLines((current) => current.map((entry) => entry.item.id === line.item.id ? { ...entry, quantity: event.target.value } : entry))} placeholder="0" className={cn("h-9 w-24 text-right font-mono text-xs", adjustment > 0 && "text-emerald-700", adjustment < 0 && "text-rose-700")} /><Button type="button" variant="outline" size="icon-sm" aria-label={`Increase ${line.item.name}`} onClick={() => setLines((current) => current.map((entry) => entry.item.id === line.item.id ? { ...entry, quantity: String(numberOrZero(entry.quantity) + 1) } : entry))}><Plus className="size-3.5" /></Button></div><div className="flex items-center justify-between gap-3 sm:min-w-28 sm:justify-end"><div className="text-right"><p className="workspace-kicker">Proposed</p><p className={cn("numeric-cell mt-0.5 text-xs font-semibold", proposed < 0 && "text-rose-700")}>{proposed.toLocaleString("en-IN")}</p></div><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${line.item.name}`} onClick={() => setLines((current) => current.filter((entry) => entry.item.id !== line.item.id))}><X className="size-3.5" /></Button></div></div>;
            })}
          </div>

          <div className="grid gap-3 border-t bg-muted/20 p-[clamp(0.75rem,1vw,1rem)] lg:grid-cols-[1fr_auto] lg:items-end"><label data-keyboard-scope={MULTILINE_FORM_SCOPE}><span className="workspace-kicker">Entry note</span><Textarea data-kernel-field value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={isStaff ? "Why is this stock change requested?" : "Optional stock-entry note…"} className="mt-1 min-h-20 text-xs" /></label><Button type="button" className="h-10 gap-2 lg:min-w-48" disabled={mutation.isPending} onClick={submit}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{isStaff ? "Submit for approval" : "Post stock entry"}</Button></div>
        </WorkspacePanel>
      </WorkspacePage>
    </KeyboardFormScope>
  );
}
