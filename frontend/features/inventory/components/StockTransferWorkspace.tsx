"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Boxes, Loader2, Save, Store, Warehouse } from "lucide-react";

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
import { transferStock, type StockTransferPayload } from "../api/inventory.mutations";

function numberOrZero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function StockTransferWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, activeShopId, shops, user } = useAuthStore();
  const sourceShopId = activeShopId || shops[0]?.id || "";
  const sourceShop = shops.find((shop) => shop.id === sourceShopId);
  const targetShops = useMemo(() => shops.filter((shop) => shop.id !== sourceShopId), [shops, sourceShopId]);
  const permitted = hasPermission(user, PERMISSIONS.STOCK_CREATE_MOVEMENT);
  const [search, setSearch] = useState("");
  const [item, setItem] = useState<ItemWithStock | null>(null);
  const [targetShopId, setTargetShopId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => createIdempotencyKey("STOCK_TRANSFER"));
  const items = useItemSearchQuery({ token, shopId: sourceShopId, search, enabled: permitted });
  const availableStock = numberOrZero(item?.availableStock);
  const transferQuantity = Number(quantity);
  const targetShop = shops.find((shop) => shop.id === targetShopId);

  const mutation = useMutation({
    mutationFn: (payload: StockTransferPayload) => transferStock(token ?? "", payload, idempotencyKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["items"] }),
      ]);
      router.push("/inventory?view=movements");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Stock transfer failed."),
  });

  const submit = useCallback(() => {
    setError(null);
    if (!permitted) return setError("You do not have permission to transfer stock.");
    if (!token || !sourceShopId) return setError("Select the source shop before transferring stock.");
    if (!item) return setError("Select a source product.");
    if (!item.sku) return setError("The selected product has no SKU and cannot be transferred between shops.");
    if (!targetShopId || targetShopId === sourceShopId) return setError("Select a different target shop.");
    if (!Number.isFinite(transferQuantity) || transferQuantity <= 0) return setError("Enter a positive transfer quantity.");
    if (transferQuantity > availableStock) return setError(`Only ${availableStock} ${item.unit} is available. Reserved stock cannot be transferred.`);
    mutation.mutate({ sourceShopId, targetShopId, itemId: item.id, quantity: transferQuantity, reason: reason.trim() || undefined });
  }, [availableStock, item, mutation, permitted, reason, sourceShopId, targetShopId, token, transferQuantity]);

  if (!permitted) {
    return <WorkspacePage><WorkspacePageHeader kicker="Inventory · Transfer" title="Stock transfer" description="Stock transfer requires stock:create_movement permission." icon={Warehouse} backHref="/inventory" /><div className="workspace-panel p-6 text-sm text-muted-foreground">You do not have permission to transfer inventory.</div></WorkspacePage>;
  }

  return (
    <KeyboardFormScope id="inventory.stockTransfer" onSubmit={submit} disabled={mutation.isPending}>
      <WorkspacePage>
        <WorkspacePageHeader kicker="Inventory · Transfer" title="Inter-shop stock transfer" description="Transfers only available stock: physical stock minus active reservations. The backend atomically posts source OUT and target IN movements." icon={Warehouse} backHref="/inventory" meta={<Badge variant="outline" className="text-[9px]">Alt+F9 · Ctrl+Enter to transfer</Badge>} />
        {error ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription className="text-xs">{error}</AlertDescription></Alert> : null}

        <WorkspaceMetricGrid>
          <WorkspaceMetric label="Source" value={sourceShop?.name || "No active shop"} detail={sourceShop?.city || "Select active shop"} icon={Store} />
          <WorkspaceMetric label="Target" value={targetShop?.name || "Not selected"} detail={targetShop?.city || `${targetShops.length} accessible target shop${targetShops.length === 1 ? "" : "s"}`} icon={Store} />
          <WorkspaceMetric label="Available" value={item ? `${availableStock.toLocaleString("en-IN")} ${item.unit}` : "—"} detail={item ? `Physical ${numberOrZero(item.physicalStock)} · Reserved ${numberOrZero(item.reservedStock)}` : "Select product"} icon={Boxes} tone={item && availableStock <= 0 ? "warning" : "neutral"} />
          <WorkspaceMetric label="Transfer" value={Number.isFinite(transferQuantity) && transferQuantity > 0 ? `${transferQuantity} ${item?.unit || ""}` : "—"} detail="Cannot include reserved stock" icon={ArrowRight} tone="info" />
        </WorkspaceMetricGrid>

        <WorkspacePanel title="Transfer request" description="The target shop receives the existing SKU; if that SKU is absent there, the backend creates the target catalog item before posting stock in.">
          <div className="grid gap-4 p-[clamp(0.75rem,1vw,1rem)] lg:grid-cols-2">
            <KernelSearchPicker
              id="inventory.stockTransfer.item"
              label="Source product"
              query={search}
              onQueryChange={setSearch}
              items={items.data ?? []}
              getKey={(candidate) => candidate.id}
              getLabel={(candidate) => candidate.name}
              getMeta={(candidate) => `${candidate.sku || "No SKU"} · ${numberOrZero(candidate.availableStock).toLocaleString("en-IN")} available`}
              onSelect={(candidate) => { setItem(candidate); setSearch(""); setQuantity(""); }}
              selectedLabel={item?.name}
              selectedMeta={item ? `${item.sku || "No SKU"} · ${availableStock.toLocaleString("en-IN")} ${item.unit} available` : null}
              onClear={() => { setItem(null); setQuantity(""); }}
              placeholder="Search product name or SKU…"
              loading={items.isFetching}
            />

            <label><span className="workspace-kicker">Target shop</span><select data-kernel-field value={targetShopId} onChange={(event) => setTargetShopId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"><option value="">Select target shop…</option>{targetShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name} · {shop.city}</option>)}</select>{targetShops.length === 0 ? <span className="mt-1 block text-[9px] text-amber-700">No other accessible shop is available for transfer.</span> : null}</label>

            <label><span className="workspace-kicker">Quantity {item ? `(${item.unit})` : ""}</span><Input data-kernel-field type="number" min="0.001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" className="mt-1 h-10 text-right font-mono text-sm" /><span className="mt-1 block text-[9px] text-muted-foreground">Maximum available: {item ? availableStock.toLocaleString("en-IN") : "—"}</span></label>

            <label data-keyboard-scope={MULTILINE_FORM_SCOPE}><span className="workspace-kicker">Transfer reason</span><Textarea data-kernel-field value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional replenishment / relocation reason…" className="mt-1 min-h-20 text-xs" /></label>
          </div>
          <div className="flex flex-col gap-3 border-t bg-muted/20 p-[clamp(0.75rem,1vw,1rem)] sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold">{sourceShop?.name || "Source"} <ArrowRight className="mx-1 inline size-3" /> {targetShop?.name || "Target"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Reserved stock stays at the source shop and is never included.</p></div><Button type="button" className="h-10 gap-2 sm:min-w-44" disabled={mutation.isPending || targetShops.length === 0} onClick={submit}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Transfer stock</Button></div>
        </WorkspacePanel>
      </WorkspacePage>
    </KeyboardFormScope>
  );
}
