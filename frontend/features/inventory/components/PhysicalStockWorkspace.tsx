"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { KeyboardFormScope } from "@/components/keyboard/KeyboardFormScope";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KernelSearchPicker } from "@/components/workspace/KernelSearchPicker";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import {
  WorkspacePage,
  WorkspacePageHeader,
  WorkspacePanel,
} from "@/components/workspace/WorkspacePage";
import {
  useItemSearchQuery,
  useItemStockQuery,
} from "@/features/sales/api/sale.queries";
import type { ItemWithStock } from "@/features/sales/lib/sale-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { createIdempotencyKey } from "@/lib/idempotency";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";
import {
  reconcilePhysicalStock,
  type PhysicalStockCountPayload,
  type PhysicalStockCountResult,
} from "../api/inventory.mutations";

function numberOrZero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function signed(value: number): string {
  if (value > 0) return `+${value.toLocaleString("en-IN")}`;
  return value.toLocaleString("en-IN");
}

export function PhysicalStockWorkspace() {
  const queryClient = useQueryClient();
  const { token, activeShopId, shops, user } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const permitted = hasPermission(user, PERMISSIONS.STOCK_CREATE_MOVEMENT);
  const isStaff = user?.role === "STAFF";

  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<ItemWithStock | null>(null);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("Physical stock count");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PhysicalStockCountResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createIdempotencyKey("PHYSICAL_STOCK"),
  );

  const items = useItemSearchQuery({
    token,
    shopId,
    search,
    enabled: permitted,
  });
  const stock = useItemStockQuery({
    token,
    itemId: selectedItem?.id ?? null,
    enabled: permitted && Boolean(selectedItem),
  });

  const physical = numberOrZero(
    stock.data?.physicalStock ?? selectedItem?.physicalStock,
  );
  const reserved = numberOrZero(
    stock.data?.reservedStock ?? selectedItem?.reservedStock,
  );
  const available = numberOrZero(
    stock.data?.availableStock ?? selectedItem?.availableStock,
  );

  const parsedCount = counted.trim() === "" ? null : Number(counted);
  const countIsValid =
    parsedCount !== null && Number.isFinite(parsedCount) && parsedCount >= 0;
  const variance = countIsValid ? parsedCount - physical : 0;
  const resultingAvailable = countIsValid
    ? Math.max(0, parsedCount - reserved)
    : available;
  const reservationShortage = countIsValid
    ? Math.max(0, reserved - parsedCount)
    : 0;

  const mutation = useMutation({
    mutationFn: (payload: PhysicalStockCountPayload) =>
      reconcilePhysicalStock(token ?? "", payload, idempotencyKey),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["items"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["approvals"] }),
      ]);

      setLastResult(result);
      setSuccess(
        result.isRequest
          ? "Count submitted for owner approval. Stock is unchanged until approval."
          : result.variance === 0
            ? "Count matched the ledger. No stock movement was needed."
            : `Physical stock reconciled by ${signed(result.variance)} units.`,
      );
      setError(null);
      setSelectedItem(null);
      setSearch("");
      setCounted("");
      setReason("Physical stock count");
      setIdempotencyKey(createIdempotencyKey("PHYSICAL_STOCK"));
    },
    onError: (cause) => {
      setSuccess(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Physical stock count could not be submitted.",
      );
    },
  });

  const submit = useCallback(() => {
    setError(null);
    setSuccess(null);

    if (!permitted) {
      setError("You do not have permission to submit stock movements.");
      return;
    }
    if (!token || !shopId) {
      setError("Select an active shop before submitting a physical count.");
      return;
    }
    if (!selectedItem) {
      setError("Select a product to count.");
      return;
    }
    if (!countIsValid || parsedCount === null) {
      setError("Enter the actual physical quantity counted. It cannot be negative.");
      return;
    }
    if (!reason.trim()) {
      setError("Add a reason for the physical stock count.");
      return;
    }

    mutation.mutate({
      shopId,
      itemId: selectedItem.id,
      countedPhysical: parsedCount,
      reason: reason.trim(),
    });
  }, [
    countIsValid,
    mutation,
    parsedCount,
    permitted,
    reason,
    selectedItem,
    shopId,
    token,
  ]);

  const selectedStockLabel = useMemo(() => {
    if (!selectedItem) return null;
    if (stock.isFetching) return "Refreshing ledger stock…";
    return `${physical.toLocaleString("en-IN")} physical · ${reserved.toLocaleString("en-IN")} reserved · ${available.toLocaleString("en-IN")} available`;
  }, [available, physical, reserved, selectedItem, stock.isFetching]);

  if (!permitted) {
    return (
      <WorkspacePage>
        <WorkspacePageHeader
          kicker="Inventory · Count"
          title="Physical stock count"
          description="Physical stock count requires stock:create_movement permission."
          icon={Scale}
          backHref="/inventory"
        />
        <div className="workspace-panel p-6 text-sm text-muted-foreground">
          You do not have permission to submit physical stock counts.
        </div>
      </WorkspacePage>
    );
  }

  return (
    <KeyboardFormScope
      id="inventory.physicalStock"
      onSubmit={submit}
      disabled={mutation.isPending}
    >
      <WorkspacePage>
        <WorkspacePageHeader
          kicker="Inventory · Cycle count"
          title="Physical stock count"
          description={
            isStaff
              ? "Count the actual units on hand. Staff variances are sent to the owner for approval."
              : "Enter the actual units on hand. The ledger records only the difference from system physical stock."
          }
          icon={Scale}
          backHref="/inventory"
          meta={
            <Badge variant="outline" className="text-[9px]">
              Ctrl+F7 · Ctrl+Enter to submit
            </Badge>
          }
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertDescription className="text-xs">
              {success}
              {lastResult && lastResult.reservationShortage > 0
                ? ` ${lastResult.reservationShortage.toLocaleString("en-IN")} reserved units are currently short.`
                : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        <WorkspaceMetricGrid>
          <WorkspaceMetric
            label="System physical"
            value={selectedItem ? physical.toLocaleString("en-IN") : "—"}
            detail="Ledger IN minus OUT"
            icon={PackageCheck}
          />
          <WorkspaceMetric
            label="Reserved"
            value={selectedItem ? reserved.toLocaleString("en-IN") : "—"}
            detail="Active order reservations"
            icon={ShieldCheck}
          />
          <WorkspaceMetric
            label="Available"
            value={selectedItem ? available.toLocaleString("en-IN") : "—"}
            detail="Physical minus reserved, clamped at zero"
            icon={ClipboardCheck}
          />
          <WorkspaceMetric
            label="Difference"
            value={selectedItem && countIsValid ? signed(variance) : "—"}
            detail="Counted minus system physical"
            icon={Scale}
            tone={
              selectedItem && countIsValid && variance !== 0
                ? "warning"
                : "success"
            }
          />
        </WorkspaceMetricGrid>

        <WorkspacePanel
          title="Count one product"
          description="This is a cycle count: only the product you submit is changed. Products you do not count are left untouched."
        >
          <div className="grid gap-4 p-[clamp(0.75rem,1vw,1rem)] lg:grid-cols-[minmax(0,1.3fr)_minmax(12rem,0.7fr)]">
            <KernelSearchPicker
              id="inventory.physicalStock.item"
              label="Product"
              query={search}
              onQueryChange={setSearch}
              items={items.data ?? []}
              getKey={(item) => item.id}
              getLabel={(item) => item.name}
              getMeta={(item) =>
                `${item.sku || "No SKU"} · ${numberOrZero(item.physicalStock).toLocaleString("en-IN")} physical`
              }
              onSelect={(item) => {
                setSelectedItem(item);
                setSearch(item.name);
                setCounted("");
                setError(null);
                setSuccess(null);
              }}
              placeholder="Search product name or SKU…"
              loading={items.isFetching}
            />

            <label>
              <span className="workspace-kicker">Counted physical</span>
              <Input
                data-kernel-field
                type="number"
                min={0}
                step="any"
                value={counted}
                onChange={(event) => setCounted(event.target.value)}
                placeholder="Actual units counted"
                className="mt-1 h-10 text-right font-mono"
                disabled={!selectedItem || stock.isFetching}
              />
            </label>
          </div>

          {selectedItem ? (
            <div className="mx-[clamp(0.75rem,1vw,1rem)] mb-4 rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{selectedItem.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {selectedItem.sku || "No SKU"} · {selectedStockLabel}
                  </p>
                </div>
                <Badge variant="outline">
                  {selectedItem.unit}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ["System", physical],
                  ["Reserved", reserved],
                  ["Available", available],
                  ["Counted", countIsValid ? parsedCount : null],
                  ["Difference", countIsValid ? variance : null],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border bg-background p-3">
                    <p className="workspace-kicker">{label}</p>
                    <p
                      className={cn(
                        "numeric-cell mt-1 text-sm font-semibold",
                        label === "Difference" &&
                          typeof value === "number" &&
                          value < 0 &&
                          "text-rose-700 dark:text-rose-300",
                        label === "Difference" &&
                          typeof value === "number" &&
                          value > 0 &&
                          "text-emerald-700 dark:text-emerald-300",
                      )}
                    >
                      {typeof value === "number"
                        ? label === "Difference"
                          ? signed(value)
                          : value.toLocaleString("en-IN")
                        : "—"}
                    </p>
                  </div>
                ))}
              </div>

              {reservationShortage > 0 ? (
                <Alert className="mt-4">
                  <AlertTriangle className="size-4" />
                  <AlertDescription className="text-xs">
                    The physical count is below active reservations by{" "}
                    {reservationShortage.toLocaleString("en-IN")} units. The count
                    will still be accepted; reservations are not changed and resulting
                    available stock will be 0.
                  </AlertDescription>
                </Alert>
              ) : countIsValid ? (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Resulting available stock:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {resultingAvailable.toLocaleString("en-IN")}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 border-t bg-muted/20 p-[clamp(0.75rem,1vw,1rem)] lg:grid-cols-[1fr_auto] lg:items-end">
            <label>
              <span className="workspace-kicker">Reason</span>
              <Input
                data-kernel-field
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Physical stock count"
                className="mt-1 h-10 text-xs"
              />
            </label>

            <Button
              type="button"
              className="h-10 gap-2 lg:min-w-52"
              disabled={
                mutation.isPending ||
                stock.isFetching ||
                !selectedItem ||
                !countIsValid
              }
              onClick={submit}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Scale className="size-4" />
              )}
              {isStaff ? "Submit count for approval" : "Apply physical count"}
            </Button>
          </div>
        </WorkspacePanel>
      </WorkspacePage>
    </KeyboardFormScope>
  );
}
