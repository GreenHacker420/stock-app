"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, Loader2, PackagePlus, Save, ShoppingBag, UserRound } from "lucide-react";

import { KeyboardFormScope, MULTILINE_FORM_SCOPE } from "@/components/keyboard/KeyboardFormScope";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { createOrderApi } from "../api/transaction.api";
import type { CreateOrderPayload, OrderPriority, TransactionLine } from "../lib/transaction-types";
import { TransactionLineEditor } from "./TransactionLineEditor";

function dateKeyOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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

export function OrderCreateWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, activeShopId, shops, user } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const permitted = hasPermission(user, PERMISSIONS.ORDER_CREATE);
  const [customerQuery, setCustomerQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [lines, setLines] = useState<TransactionLine[]>([]);
  const [priority, setPriority] = useState<OrderPriority>("NORMAL");
  const [expectedDispatchDate, setExpectedDispatchDate] = useState(() => dateKeyOffset(1));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => createIdempotencyKey("ORDER"));

  const customers = useCustomerSearchQuery({ token, shopId, search: customerQuery, enabled: permitted });
  const items = useItemSearchQuery({ token, shopId, search: itemQuery, enabled: permitted });

  const orderValue = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.rate) || 0), 0), [lines]);
  const totalQuantity = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0), [lines]);

  const mutation = useMutation({
    mutationFn: (payload: CreateOrderPayload) => createOrderApi(token ?? "", payload, idempotencyKey),
    onSuccess: async (order) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
      ]);
      router.push(`/orders/${order.id}`);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Order creation failed."),
  });

  const updateLine = useCallback((key: string, patch: Partial<TransactionLine>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }, []);

  const submit = useCallback(() => {
    setError(null);
    if (!permitted) return setError("You do not have permission to create orders.");
    if (!token || !shopId) return setError("Select an active shop before creating an order.");
    if (!customer) return setError("Select a customer before creating the order.");
    if (lines.length === 0) return setError("Add at least one product to the order.");
    const invalidLine = lines.find((line) => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || !Number.isFinite(Number(line.rate)) || Number(line.rate) <= 0);
    if (invalidLine) return setError(`Enter a positive quantity and rate for ${invalidLine.name}.`);

    mutation.mutate({
      shopId,
      customerId: customer.id,
      expectedDispatchDate: expectedDispatchDate ? new Date(`${expectedDispatchDate}T12:00:00`).toISOString() : undefined,
      priority,
      ownerNotes: notes.trim() || undefined,
      items: lines.map((line) => ({ itemId: line.itemId, quantityOrdered: Number(line.quantity), rate: Number(line.rate) })),
    });
  }, [customer, expectedDispatchDate, lines, mutation, notes, permitted, priority, shopId, token]);

  if (!permitted) {
    return <WorkspacePage><WorkspacePageHeader kicker="Transactions · Orders" title="New customer order" description="Order creation requires order:create permission." icon={ShoppingBag} /><div className="workspace-panel p-6 text-sm text-muted-foreground">You do not have permission to create customer orders.</div></WorkspacePage>;
  }

  return (
    <KeyboardFormScope id="orders.create" onSubmit={submit} disabled={mutation.isPending}>
      <WorkspacePage>
        <WorkspacePageHeader kicker="Transactions · Orders" title="New customer order" description="Creates a backend DRAFT order. Stock reservation happens only when an owner confirms the order." icon={ShoppingBag} backHref="/orders" meta={<Badge variant="outline" className="text-[9px]">Ctrl+Enter to save</Badge>} />

        {error ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription className="text-xs">{error}</AlertDescription></Alert> : null}

        <WorkspaceMetricGrid>
          <WorkspaceMetric label="Order value" value={formatINR(orderValue)} detail="Calculated from current lines" icon={ShoppingBag} tone="info" />
          <WorkspaceMetric label="Quantity" value={totalQuantity.toLocaleString("en-IN")} detail={`${lines.length} product line${lines.length === 1 ? "" : "s"}`} icon={PackagePlus} />
          <WorkspaceMetric label="Customer" value={customer?.name || "Not selected"} detail={customer?.phone || "Named customer required"} icon={UserRound} />
          <WorkspaceMetric label="Expected dispatch" value={expectedDispatchDate || "Not set"} detail={`Priority · ${priority}`} icon={CalendarClock} />
        </WorkspaceMetricGrid>

        <div className="workspace-two-column">
          <WorkspacePanel title="Customer" description="Search is shop-scoped and excludes the walk-in account.">
            <div className="p-[clamp(0.75rem,1vw,1rem)]">
              <KernelSearchPicker
                id="orders.customer"
                label="Customer account"
                query={customerQuery}
                onQueryChange={setCustomerQuery}
                items={customers.data ?? []}
                getKey={(item) => item.id}
                getLabel={(item) => item.name}
                getMeta={(item) => item.phone || item.type}
                onSelect={(item) => { setCustomer(item); setCustomerQuery(""); }}
                selectedLabel={customer?.name}
                selectedMeta={customer ? `${customer.phone || "No phone"} · ${customer.type}` : null}
                onClear={() => setCustomer(null)}
                placeholder="Search customer name or phone…"
                loading={customers.isFetching}
              />
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="Order settings" description="Optional dispatch date, priority and fulfilment notes are persisted on the order.">
            <div className="grid gap-3 p-[clamp(0.75rem,1vw,1rem)] sm:grid-cols-2">
              <label><span className="workspace-kicker">Expected dispatch</span><input data-kernel-field type="date" value={expectedDispatchDate} onChange={(event) => setExpectedDispatchDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" /></label>
              <label><span className="workspace-kicker">Priority</span><select data-kernel-field value={priority} onChange={(event) => setPriority(event.target.value as OrderPriority)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
              <label className="sm:col-span-2" data-keyboard-scope={MULTILINE_FORM_SCOPE}><span className="workspace-kicker">Fulfilment notes</span><Textarea data-kernel-field value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Packaging, delivery or owner notes…" className="mt-1 min-h-20 text-xs" /></label>
            </div>
          </WorkspacePanel>
        </div>

        <WorkspacePanel title="Order items" description="Add products, then enter the ordered quantity and agreed rate. Confirmation—not this draft write—reserves stock.">
          <div className="border-b p-[clamp(0.75rem,1vw,1rem)]">
            <KernelSearchPicker
              id="orders.item"
              label="Add product"
              query={itemQuery}
              onQueryChange={setItemQuery}
              items={(items.data ?? []).filter((item) => !lines.some((line) => line.itemId === item.id))}
              getKey={(item) => item.id}
              getLabel={(item) => item.name}
              getMeta={(item) => `${item.sku || "No SKU"} · ${Number(item.availableStock ?? 0).toLocaleString("en-IN")} available`}
              onSelect={(item) => { setLines((current) => [...current, lineFromItem(item)]); setItemQuery(""); }}
              placeholder="Search product name or SKU…"
              loading={items.isFetching}
            />
          </div>
          <div className="p-[clamp(0.75rem,1vw,1rem)]"><TransactionLineEditor lines={lines} onChange={updateLine} onRemove={(key) => setLines((current) => current.filter((line) => line.key !== key))} /></div>
          <div className="flex flex-col gap-3 border-t bg-muted/20 p-[clamp(0.75rem,1vw,1rem)] sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold">Draft order · {formatINR(orderValue)}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Owner confirmation performs the stock-reservation check.</p></div><Button type="button" disabled={mutation.isPending} onClick={submit} className="h-10 gap-2 sm:min-w-40">{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Create draft order</Button></div>
        </WorkspacePanel>
      </WorkspacePage>
    </KeyboardFormScope>
  );
}
