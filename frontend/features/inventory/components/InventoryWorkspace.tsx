"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Filter,
  History,
  Layers3,
  PackageCheck,
  PackageMinus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tags,
  Warehouse,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthStore } from "@/lib/auth/auth-store";
import { getFeature } from "@/lib/features/feature-availability";
import { hasPermission } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { cn, formatINR } from "@/lib/utils";
import {
  fetchInventoryBrands,
  fetchInventoryCatalog,
  fetchInventoryCategories,
  fetchInventoryMovements,
  fetchInventorySummary,
  fetchStockPosition,
} from "@/features/inventory/api/inventory.queries";
import type {
  InventoryCatalogItem,
  InventoryView,
  StockFilter,
  StockMovement,
  StockMovementType,
  StockPosition,
} from "@/features/inventory/lib/inventory-types";

const PAGE_SIZE = 50;

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  OPENING_STOCK: "Opening Stock",
  STOCK_IN: "Stock In",
  STOCK_OUT: "Stock Out",
  SALE: "Sale",
  DM: "Delivery Memo",
  ORDER_DISPATCH: "Order Dispatch",
  RETURN: "Return",
  DAMAGE_LOSS: "Damage / Loss",
  MANUAL_ADJUSTMENT: "Manual Adjustment",
};

const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABELS) as StockMovementType[];

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stockState(row: Pick<StockPosition, "physicalStock" | "reservedStock" | "availableStock"> & { item: { minimumStock: number | string } }) {
  const physical = numberValue(row.physicalStock);
  const reserved = numberValue(row.reservedStock);
  const available = numberValue(row.availableStock);
  const minimum = numberValue(row.item.minimumStock);

  if (physical < 0) return { label: "Negative", tone: "danger" as const };
  if (available <= 0 && reserved > 0) return { label: "Reserved only", tone: "warning" as const };
  if (available <= 0) return { label: "Out of stock", tone: "danger" as const };
  if (minimum > 0 && available <= minimum) return { label: "Low stock", tone: "warning" as const };
  return { label: "Available", tone: "success" as const };
}

function statusBadge(tone: "success" | "warning" | "danger", label: string) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-md px-1.5 text-[9px] font-semibold",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
        tone === "danger" && "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300",
      )}
    >
      {label}
    </Badge>
  );
}

type SelectedItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  category?: string | null;
  brand?: string | null;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  minimumStock: number;
  sellingPrice?: number | null;
  mrp?: number | null;
  serialTracked?: boolean;
};

export function InventoryWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, shops, activeShopId, user } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";

  const requestedView = searchParams.get("view");
  const view: InventoryView = requestedView === "catalog" || requestedView === "movements" ? requestedView : "stock";
  const requestedStockFilter = searchParams.get("stock");
  const stockFilter: StockFilter = ["available", "low", "out", "reserved", "negative"].includes(requestedStockFilter ?? "")
    ? (requestedStockFilter as StockFilter)
    : "all";
  const categoryId = searchParams.get("categoryId") || "";
  const brandId = searchParams.get("brandId") || "";
  const movementType = (searchParams.get("movementType") || "") as StockMovementType | "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);

  const [searchDraft, setSearchDraft] = React.useState(searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = React.useState(searchDraft);
  const [selectedItem, setSelectedItem] = React.useState<SelectedItem | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = React.useState(0);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchDraft.trim()), 280);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  React.useEffect(() => {
    const existing = searchParams.get("search") || "";
    if (existing === debouncedSearch) return;
    const next = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) next.set("search", debouncedSearch);
    else next.delete("search");
    next.set("page", "1");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [debouncedSearch, pathname, router, searchParams]);

  React.useEffect(() => {
    setFocusedRowIndex(0);
  }, [view, page, stockFilter, categoryId, brandId, movementType, debouncedSearch]);

  const setParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (!value) next.delete(key);
        else next.set(key, value);
      });
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const summaryQuery = useQuery({
    queryKey: queryKeys.inventory.summary(shopId),
    queryFn: () => fetchInventorySummary(token ?? "", shopId),
    enabled: Boolean(token && shopId),
    staleTime: 30_000,
  });

  const stockQuery = useQuery({
    queryKey: queryKeys.inventory.stock(shopId),
    queryFn: () => fetchStockPosition(token ?? "", shopId),
    enabled: Boolean(token && shopId && view === "stock"),
    staleTime: 15_000,
  });

  const catalogQuery = useQuery({
    queryKey: queryKeys.inventory.catalog({
      shopId,
      search: debouncedSearch || undefined,
      categoryId: categoryId || undefined,
      brandId: brandId || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    queryFn: () =>
      fetchInventoryCatalog(token ?? "", {
        shopId,
        search: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(token && shopId && view === "catalog"),
    placeholderData: (previous) => previous,
    staleTime: 90_000,
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.inventory.categories(shopId),
    queryFn: () => fetchInventoryCategories(token ?? "", shopId),
    enabled: Boolean(token && shopId),
    staleTime: 5 * 60_000,
  });

  const brandsQuery = useQuery({
    queryKey: queryKeys.inventory.brands(shopId),
    queryFn: () => fetchInventoryBrands(token ?? "", shopId),
    enabled: Boolean(token && shopId),
    staleTime: 5 * 60_000,
  });

  const movementQuery = useQuery({
    queryKey: queryKeys.inventory.movements({
      shopId,
      movementType: movementType || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    queryFn: () =>
      fetchInventoryMovements(token ?? "", {
        shopId,
        movementType: movementType || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(token && shopId && view === "movements"),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const stockRows = React.useMemo(() => {
    const rows = stockQuery.data ?? [];
    const query = debouncedSearch.toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !query || row.item.name.toLowerCase().includes(query) || row.item.sku?.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      const physical = numberValue(row.physicalStock);
      const reserved = numberValue(row.reservedStock);
      const available = numberValue(row.availableStock);
      const minimum = numberValue(row.item.minimumStock);

      if (stockFilter === "available") return available > 0;
      if (stockFilter === "low") return available > 0 && minimum > 0 && available <= minimum;
      if (stockFilter === "out") return available <= 0 && physical >= 0;
      if (stockFilter === "reserved") return reserved > 0;
      if (stockFilter === "negative") return physical < 0;
      return true;
    });
  }, [debouncedSearch, stockFilter, stockQuery.data]);

  const stockTotals = React.useMemo(() => {
    return (stockQuery.data ?? []).reduce(
      (acc, row) => {
        acc.physical += numberValue(row.physicalStock);
        acc.reserved += numberValue(row.reservedStock);
        acc.available += numberValue(row.availableStock);
        if (numberValue(row.physicalStock) < 0) acc.negative += 1;
        return acc;
      },
      { physical: 0, reserved: 0, available: 0, negative: 0 },
    );
  }, [stockQuery.data]);

  const stockEntryFeature = getFeature("STOCK_ENTRY");
  const canUseStockEntry = stockEntryFeature.status === "ENABLED" && hasPermission(user, stockEntryFeature.requiredPermission);

  const refreshActive = () => {
    void summaryQuery.refetch();
    if (view === "stock") void stockQuery.refetch();
    if (view === "catalog") void catalogQuery.refetch();
    if (view === "movements") void movementQuery.refetch();
  };

  const focusRow = (nextIndex: number, total: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, Math.max(total - 1, 0)));
    setFocusedRowIndex(clamped);
    window.requestAnimationFrame(() => document.getElementById(`inventory-row-${clamped}`)?.focus());
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLElement>, index: number, total: number, onOpen?: () => void) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(index + 1, total);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(index - 1, total);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRow(0, total);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRow(total - 1, total);
    } else if (event.key === "Enter" && onOpen) {
      event.preventDefault();
      onOpen();
    }
  };

  const openStockItem = (row: StockPosition) => {
    setSelectedItem({
      id: row.item.id,
      name: row.item.name,
      sku: row.item.sku,
      unit: row.item.unit,
      physicalStock: numberValue(row.physicalStock),
      reservedStock: numberValue(row.reservedStock),
      availableStock: numberValue(row.availableStock),
      minimumStock: numberValue(row.item.minimumStock),
    });
  };

  const openCatalogItem = (item: InventoryCatalogItem) => {
    setSelectedItem({
      id: item.id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      category: item.category?.name,
      brand: item.brand?.name,
      physicalStock: numberValue(item.physicalStock),
      reservedStock: numberValue(item.reservedStock),
      availableStock: numberValue(item.availableStock),
      minimumStock: numberValue(item.minimumStock),
      sellingPrice: numberValue(item.defaultSellingPrice),
      mrp: item.mrp == null ? null : numberValue(item.mrp),
      serialTracked: Boolean(item.requiresSerialNumber),
    });
  };

  const summary = summaryQuery.data;
  const catalog = catalogQuery.data;
  const movements = movementQuery.data ?? [];
  const totalCatalogPages = catalog ? Math.max(1, Math.ceil(catalog.total / catalog.limit)) : 1;

  if (!shopId) {
    return (
      <div className="workspace-surface flex min-h-72 items-center justify-center p-8 text-center">
        <div>
          <Warehouse className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-semibold">Select a shop to view inventory</p>
          <p className="mt-1 text-xs text-muted-foreground">Inventory data is always scoped to the active shop.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="workspace-kicker mb-1">Records · Inventory</div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Inventory workspace</h1>
            <Badge variant="secondary" className="h-5 text-[9px]">Live stock ledger</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Review sellable stock, reservations, catalogue pricing and movement history without mixing physical and available quantities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={refreshActive}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5"
            disabled={!canUseStockEntry}
            title={!canUseStockEntry ? stockEntryFeature.disabledReason : undefined}
            onClick={canUseStockEntry ? () => router.push(stockEntryFeature.route) : undefined}
          >
            <ArrowDownToLine className="size-3.5" />
            Stock Entry
            <kbd className="ml-1 rounded border border-white/20 bg-white/10 px-1 font-mono text-[9px]">F9</kbd>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <SummaryMetric
          label="Products"
          value={summaryQuery.isLoading ? undefined : summary?.totalItems ?? 0}
          detail={`${summary?.totalCategories ?? 0} categories · ${summary?.totalBrands ?? 0} brands`}
          icon={Boxes}
          active={view === "catalog"}
          onClick={() => setParams({ view: "catalog", page: "1", stock: null })}
        />
        <SummaryMetric
          label="Physical units"
          value={stockQuery.data ? stockTotals.physical : undefined}
          detail="Ledger balance"
          icon={Layers3}
          active={view === "stock" && stockFilter === "all"}
          onClick={() => setParams({ view: "stock", stock: null, page: "1" })}
        />
        <SummaryMetric
          label="Reserved units"
          value={stockQuery.data ? stockTotals.reserved : undefined}
          detail="Active reservations"
          icon={PackageMinus}
          active={view === "stock" && stockFilter === "reserved"}
          onClick={() => setParams({ view: "stock", stock: "reserved", page: "1" })}
        />
        <SummaryMetric
          label="Low stock"
          value={summaryQuery.isLoading ? undefined : summary?.lowStockCount ?? 0}
          detail="At or below minimum"
          icon={CircleAlert}
          active={view === "stock" && stockFilter === "low"}
          onClick={() => setParams({ view: "stock", stock: "low", page: "1" })}
        />
        <SummaryMetric
          label="Out of stock"
          value={summaryQuery.isLoading ? undefined : summary?.outOfStockCount ?? 0}
          detail={stockTotals.negative ? `${stockTotals.negative} negative balances` : "No sellable stock"}
          icon={PackageCheck}
          active={view === "stock" && stockFilter === "out"}
          onClick={() => setParams({ view: "stock", stock: "out", page: "1" })}
        />
      </div>

      <Card className="overflow-hidden rounded-xl shadow-none">
        <div className="flex flex-col gap-3 border-b bg-card px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-fit items-center rounded-lg bg-muted p-1">
            <ViewButton active={view === "stock"} onClick={() => setParams({ view: "stock", page: "1" })} icon={Warehouse}>
              Stock Position
            </ViewButton>
            <ViewButton active={view === "catalog"} onClick={() => setParams({ view: "catalog", page: "1" })} icon={Tags}>
              Product Catalog
            </ViewButton>
            <ViewButton active={view === "movements"} onClick={() => setParams({ view: "movements", page: "1" })} icon={History}>
              Movements
            </ViewButton>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder={view === "movements" ? "Filter loaded movements…" : "Search product name or SKU…"}
                className="h-9 rounded-lg bg-background pl-9 text-xs"
                aria-label="Search inventory"
              />
            </div>

            {view === "stock" ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">
                  <Filter className="size-3.5 text-muted-foreground" />
                  {stockFilter === "all" ? "All stock" : stockFilter.replace("_", " ")}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Stock condition</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(["all", "available", "low", "out", "reserved", "negative"] as StockFilter[]).map((filter) => (
                    <DropdownMenuItem key={filter} onClick={() => setParams({ stock: filter === "all" ? null : filter, page: "1" })}>
                      <span className={cn("capitalize", stockFilter === filter && "font-semibold")}>{filter.replace("_", " ")}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {view === "catalog" ? (
              <>
                <FilterMenu
                  label="Category"
                  activeLabel={categoriesQuery.data?.find((category) => category.id === categoryId)?.name}
                  items={(categoriesQuery.data ?? []).map((category) => ({ id: category.id, label: category.name }))}
                  onSelect={(id) => setParams({ categoryId: id || null, page: "1" })}
                />
                <FilterMenu
                  label="Brand"
                  activeLabel={brandsQuery.data?.find((brand) => brand.id === brandId)?.name}
                  items={(brandsQuery.data ?? []).map((brand) => ({ id: brand.id, label: brand.name }))}
                  onSelect={(id) => setParams({ brandId: id || null, page: "1" })}
                />
              </>
            ) : null}

            {view === "movements" ? (
              <FilterMenu
                label="Movement type"
                activeLabel={movementType ? MOVEMENT_LABELS[movementType] : undefined}
                items={MOVEMENT_TYPES.map((type) => ({ id: type, label: MOVEMENT_LABELS[type] }))}
                onSelect={(id) => setParams({ movementType: id || null, page: "1" })}
              />
            ) : null}
          </div>
        </div>

        <CardContent className="p-0">
          {view === "stock" ? (
            <StockPositionTable
              rows={stockRows}
              isLoading={stockQuery.isLoading}
              isError={stockQuery.isError}
              focusedRowIndex={focusedRowIndex}
              onFocusedRowChange={setFocusedRowIndex}
              onKeyDown={handleRowKeyDown}
              onOpen={openStockItem}
              onRetry={() => void stockQuery.refetch()}
            />
          ) : null}

          {view === "catalog" ? (
            <CatalogTable
              rows={catalog?.items ?? []}
              isLoading={catalogQuery.isLoading}
              isError={catalogQuery.isError}
              focusedRowIndex={focusedRowIndex}
              onFocusedRowChange={setFocusedRowIndex}
              onKeyDown={handleRowKeyDown}
              onOpen={openCatalogItem}
              onRetry={() => void catalogQuery.refetch()}
            />
          ) : null}

          {view === "movements" ? (
            <MovementTable rows={movements} search={debouncedSearch} isLoading={movementQuery.isLoading} isError={movementQuery.isError} onRetry={() => void movementQuery.refetch()} />
          ) : null}
        </CardContent>

        {view === "catalog" && catalog ? (
          <PaginationBar
            page={catalog.page}
            totalPages={totalCatalogPages}
            detail={`${catalog.total.toLocaleString("en-IN")} products`}
            onPrevious={() => setParams({ page: String(Math.max(1, page - 1)) })}
            onNext={() => setParams({ page: String(Math.min(totalCatalogPages, page + 1)) })}
          />
        ) : null}

        {view === "movements" && movementQuery.data ? (
          <PaginationBar
            page={page}
            totalPages={undefined}
            detail={`${movementQuery.data.length} movements on this page`}
            disableNext={movementQuery.data.length < PAGE_SIZE}
            onPrevious={() => setParams({ page: String(Math.max(1, page - 1)) })}
            onNext={() => setParams({ page: String(page + 1) })}
          />
        ) : null}
      </Card>

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selectedItem ? (
            <>
              <DialogHeader>
                <div className="workspace-kicker">Stock query</div>
                <DialogTitle className="text-lg font-semibold">{selectedItem.name}</DialogTitle>
                <DialogDescription>
                  {selectedItem.sku || "No SKU"} · {selectedItem.unit}
                  {selectedItem.category ? ` · ${selectedItem.category}` : ""}
                  {selectedItem.brand ? ` · ${selectedItem.brand}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <DetailMetric label="Physical" value={selectedItem.physicalStock} />
                <DetailMetric label="Reserved" value={selectedItem.reservedStock} />
                <DetailMetric label="Available" value={selectedItem.availableStock} strong />
                <DetailMetric label="Minimum" value={selectedItem.minimumStock} />
              </div>
              {selectedItem.sellingPrice !== undefined ? (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="workspace-kicker">Selling price</p>
                      <p className="mt-1 text-sm font-semibold">{selectedItem.sellingPrice > 0 ? formatINR(selectedItem.sellingPrice) : "Not priced"}</p>
                    </div>
                    <div>
                      <p className="workspace-kicker">MRP</p>
                      <p className="mt-1 text-sm font-semibold">{selectedItem.mrp && selectedItem.mrp > 0 ? formatINR(selectedItem.mrp) : "—"}</p>
                    </div>
                    <div>
                      <p className="workspace-kicker">Serial tracking</p>
                      <p className="mt-1 text-sm font-semibold">{selectedItem.serialTracked ? "Required" : "No"}</p>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setSelectedItem(null)}>Close</Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value?: number;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-xl border bg-card p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.025)] transition-colors hover:border-foreground/20 hover:bg-muted/30",
        active && "border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          {value === undefined ? <Skeleton className="mt-2 h-6 w-14" /> : <p className="numeric-cell mt-1 text-xl font-semibold tracking-tight">{value.toLocaleString("en-IN")}</p>}
        </div>
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-[10px] text-muted-foreground">{detail}</p>
    </button>
  );
}

function ViewButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

function FilterMenu({ label, activeLabel, items, onSelect }: { label: string; activeLabel?: string; items: Array<{ id: string; label: string }>; onSelect: (id: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">
        <SlidersHorizontal className="size-3.5 text-muted-foreground" />
        <span className="max-w-28 truncate">{activeLabel || label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onSelect("")}>
          <span className={!activeLabel ? "font-semibold" : undefined}>All</span>
        </DropdownMenuItem>
        {items.map((item) => (
          <DropdownMenuItem key={item.id} onClick={() => onSelect(item.id)}>
            <span className={activeLabel === item.label ? "font-semibold" : undefined}>{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StockPositionTable({
  rows,
  isLoading,
  isError,
  focusedRowIndex,
  onFocusedRowChange,
  onKeyDown,
  onOpen,
  onRetry,
}: {
  rows: StockPosition[];
  isLoading: boolean;
  isError: boolean;
  focusedRowIndex: number;
  onFocusedRowChange: (index: number) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>, index: number, total: number, onOpen?: () => void) => void;
  onOpen: (row: StockPosition) => void;
  onRetry: () => void;
}) {
  if (isLoading) return <TableSkeleton columns={8} />;
  if (isError) return <TableError onRetry={onRetry} />;
  if (rows.length === 0) return <TableEmpty title="No stock rows match the current filters" detail="Clear the filter or try a different product search." />;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="min-w-64">Product</TableHead>
            <TableHead className="min-w-32">SKU</TableHead>
            <TableHead className="text-right">Physical</TableHead>
            <TableHead className="text-right">Reserved</TableHead>
            <TableHead className="text-right">Available</TableHead>
            <TableHead className="text-right">Minimum</TableHead>
            <TableHead className="text-right">Shortfall</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const state = stockState(row);
            const minimum = numberValue(row.item.minimumStock);
            const shortfall = Math.max(0, minimum - numberValue(row.availableStock));
            return (
              <TableRow
                id={`inventory-row-${index}`}
                key={row.item.id}
                tabIndex={focusedRowIndex === index ? 0 : -1}
                onFocus={() => onFocusedRowChange(index)}
                onKeyDown={(event) => onKeyDown(event, index, rows.length, () => onOpen(row))}
                onDoubleClick={() => onOpen(row)}
                className="cursor-default text-xs focus-visible:bg-indigo-50/70 focus-visible:outline-none dark:focus-visible:bg-indigo-950/30"
              >
                <TableCell>
                  <button type="button" onClick={() => onOpen(row)} className="text-left font-semibold hover:underline hover:underline-offset-4">
                    {row.item.name}
                  </button>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{row.item.unit}</div>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{row.item.sku || "—"}</TableCell>
                <TableCell className="numeric-cell text-right font-medium">{numberValue(row.physicalStock).toLocaleString("en-IN")}</TableCell>
                <TableCell className="numeric-cell text-right text-muted-foreground">{numberValue(row.reservedStock).toLocaleString("en-IN")}</TableCell>
                <TableCell className="numeric-cell text-right font-semibold">{numberValue(row.availableStock).toLocaleString("en-IN")}</TableCell>
                <TableCell className="numeric-cell text-right text-muted-foreground">{minimum.toLocaleString("en-IN")}</TableCell>
                <TableCell className={cn("numeric-cell text-right", shortfall > 0 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{shortfall || "—"}</TableCell>
                <TableCell className="text-right">{statusBadge(state.tone, state.label)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CatalogTable({
  rows,
  isLoading,
  isError,
  focusedRowIndex,
  onFocusedRowChange,
  onKeyDown,
  onOpen,
  onRetry,
}: {
  rows: InventoryCatalogItem[];
  isLoading: boolean;
  isError: boolean;
  focusedRowIndex: number;
  onFocusedRowChange: (index: number) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>, index: number, total: number, onOpen?: () => void) => void;
  onOpen: (item: InventoryCatalogItem) => void;
  onRetry: () => void;
}) {
  if (isLoading) return <TableSkeleton columns={8} />;
  if (isError) return <TableError onRetry={onRetry} />;
  if (rows.length === 0) return <TableEmpty title="No products found" detail="Try removing category or brand filters, or search for another SKU." />;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="min-w-64">Product</TableHead>
            <TableHead className="min-w-32">SKU</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead className="text-right">Selling price</TableHead>
            <TableHead className="text-right">Physical</TableHead>
            <TableHead className="text-right">Available</TableHead>
            <TableHead className="text-right">Minimum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item, index) => {
            const price = numberValue(item.defaultSellingPrice);
            return (
              <TableRow
                id={`inventory-row-${index}`}
                key={item.id}
                tabIndex={focusedRowIndex === index ? 0 : -1}
                onFocus={() => onFocusedRowChange(index)}
                onKeyDown={(event) => onKeyDown(event, index, rows.length, () => onOpen(item))}
                onDoubleClick={() => onOpen(item)}
                className="text-xs focus-visible:bg-indigo-50/70 focus-visible:outline-none dark:focus-visible:bg-indigo-950/30"
              >
                <TableCell>
                  <button type="button" onClick={() => onOpen(item)} className="text-left font-semibold hover:underline hover:underline-offset-4">
                    {item.name}
                  </button>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{item.unit}{item.requiresSerialNumber ? " · Serial tracked" : ""}</div>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{item.sku || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{item.category?.name || "Uncategorised"}</TableCell>
                <TableCell className="text-muted-foreground">{item.brand?.name || "Unbranded"}</TableCell>
                <TableCell className="numeric-cell text-right font-medium">
                  {price > 0 ? formatINR(price) : <span className="text-amber-700 dark:text-amber-300">Not priced</span>}
                </TableCell>
                <TableCell className="numeric-cell text-right">{numberValue(item.physicalStock).toLocaleString("en-IN")}</TableCell>
                <TableCell className="numeric-cell text-right font-semibold">{numberValue(item.availableStock).toLocaleString("en-IN")}</TableCell>
                <TableCell className="numeric-cell text-right text-muted-foreground">{numberValue(item.minimumStock).toLocaleString("en-IN")}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MovementTable({ rows, search, isLoading, isError, onRetry }: { rows: StockMovement[]; search: string; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  if (isLoading) return <TableSkeleton columns={7} />;
  if (isError) return <TableError onRetry={onRetry} />;

  const normalized = search.toLowerCase();
  const filtered = normalized
    ? rows.filter((row) => row.item.name.toLowerCase().includes(normalized) || row.item.sku?.toLowerCase().includes(normalized) || row.reason?.toLowerCase().includes(normalized))
    : rows;

  if (filtered.length === 0) return <TableEmpty title="No stock movements found" detail="Try another movement type or move to a different page." />;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="min-w-52">Product</TableHead>
            <TableHead>Movement</TableHead>
            <TableHead className="text-right">In</TableHead>
            <TableHead className="text-right">Out</TableHead>
            <TableHead className="min-w-48">Reference / reason</TableHead>
            <TableHead>By</TableHead>
            <TableHead className="text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((movement) => {
            const reference = movement.sale?.saleNumber || movement.deliveryMemo?.dmNumber || movement.order?.orderNumber || movement.reason || "—";
            return (
              <TableRow key={movement.id} className="text-xs">
                <TableCell>
                  <div className="font-semibold">{movement.item.name}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{movement.item.sku || "—"}</div>
                </TableCell>
                <TableCell><Badge variant="secondary" className="text-[9px]">{MOVEMENT_LABELS[movement.movementType]}</Badge></TableCell>
                <TableCell className="numeric-cell text-right font-medium text-emerald-700 dark:text-emerald-300">{numberValue(movement.quantityIn) || "—"}</TableCell>
                <TableCell className="numeric-cell text-right font-medium text-rose-700 dark:text-rose-300">{numberValue(movement.quantityOut) || "—"}</TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground" title={reference}>{reference}</TableCell>
                <TableCell className="text-muted-foreground">{movement.createdBy?.name || "System"}</TableCell>
                <TableCell className="whitespace-nowrap text-right text-muted-foreground">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(movement.createdAt))}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function PaginationBar({ page, totalPages, detail, disableNext, onPrevious, onNext }: { page: number; totalPages?: number; detail: string; disableNext?: boolean; onPrevious: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-2.5">
      <div className="text-[10px] text-muted-foreground">
        Page <span className="font-semibold text-foreground">{page}</span>{totalPages ? ` of ${totalPages}` : ""} · {detail}
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-8 px-2" disabled={page <= 1} onClick={onPrevious}>
          <ChevronLeft className="size-3.5" />
          <span className="sr-only">Previous page</span>
        </Button>
        <Button variant="outline" size="sm" className="h-8 px-2" disabled={disableNext || (totalPages !== undefined && page >= totalPages)} onClick={onNext}>
          <ChevronRight className="size-3.5" />
          <span className="sr-only">Next page</span>
        </Button>
      </div>
    </div>
  );
}

function DetailMetric({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-muted/25 p-3", strong && "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/30")}>
      <p className="workspace-kicker">{label}</p>
      <p className="numeric-cell mt-1 text-lg font-semibold">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 8 }).map((_, row) => (
        <div key={row} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, column) => <Skeleton key={column} className="h-8" />)}
        </div>
      ))}
    </div>
  );
}

function TableError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-64 items-center justify-center p-8 text-center">
      <div>
        <CircleAlert className="mx-auto mb-3 size-7 text-rose-500" />
        <p className="text-sm font-semibold">Inventory data could not be loaded</p>
        <p className="mt-1 text-xs text-muted-foreground">The current view is unavailable. Existing data has not been replaced with zeroes.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Retry</Button>
      </div>
    </div>
  );
}

function TableEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center p-8 text-center">
      <div>
        <Warehouse className="mx-auto mb-3 size-7 text-muted-foreground" />
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
