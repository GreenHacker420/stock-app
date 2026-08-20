"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Boxes,
  CircleAlert,
  History,
  Layers3,
  PackageCheck,
  PackageMinus,
  RefreshCw,
  Search,
  Tags,
  Warehouse,
} from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { FeatureActionButton } from "@/components/workspace/FeatureActionButton";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import {
  WorkspacePage,
  WorkspacePageHeader,
  WorkspacePanel,
  WorkspaceToolbar,
} from "@/components/workspace/WorkspacePage";
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
import { useAuthStore } from "@/lib/auth/auth-store";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { queryKeys } from "@/lib/query/query-keys";
import { cn, formatDateTime, formatINR } from "@/lib/utils";

const PAGE_SIZE = 50;
const REPORT_IDS: Record<InventoryView, string> = {
  stock: "inventory.stock",
  catalog: "inventory.catalog",
  movements: "inventory.movements",
};

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

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stockCondition(row: StockPosition) {
  const physical = asNumber(row.physicalStock);
  const reserved = asNumber(row.reservedStock);
  const available = asNumber(row.availableStock);
  const minimum = asNumber(row.item.minimumStock);

  if (physical < 0) return { label: "Negative stock", tone: "danger" as const };
  if (available <= 0 && reserved > 0) return { label: "Reserved only", tone: "warning" as const };
  if (available <= 0) return { label: "Out of stock", tone: "danger" as const };
  if (minimum > 0 && available <= minimum) return { label: "Low stock", tone: "warning" as const };
  return { label: "Available", tone: "success" as const };
}

function stockBadge(row: StockPosition) {
  const state = stockCondition(row);
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px]",
        state.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-300",
        state.tone === "warning" && "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-300",
        state.tone === "danger" && "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-950 dark:bg-rose-950/30 dark:text-rose-300",
      )}
    >
      {state.label}
    </Badge>
  );
}

type SelectedItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  category?: string;
  brand?: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  minimumStock: number;
  sellingPrice?: number;
  mrp?: number;
  serialTracked?: boolean;
};

export function InventoryWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, shops, activeShopId } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";

  const requestedView = searchParams.get("view");
  const view: InventoryView = requestedView === "catalog" || requestedView === "movements" ? requestedView : "stock";
  const reportId = REPORT_IDS[view];
  const requestedStock = searchParams.get("stock");
  const stockFilter: StockFilter = ["available", "low", "out", "reserved", "negative"].includes(requestedStock || "")
    ? requestedStock as StockFilter
    : "all";
  const categoryId = searchParams.get("categoryId") || "";
  const brandId = searchParams.get("brandId") || "";
  const movementParam = searchParams.get("movementType");
  const movementType = MOVEMENT_TYPES.includes(movementParam as StockMovementType)
    ? movementParam as StockMovementType
    : undefined;
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const initialSearch = searchParams.get("search") || "";

  const [searchDraft, setSearchDraft] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const normalized = searchDraft.trim();
      setDebouncedSearch(normalized);
      const existing = searchParams.get("search") || "";
      if (normalized !== existing) setParams({ search: normalized || null, page: null });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchDraft, searchParams, setParams]);

  const summaryQuery = useQuery({
    queryKey: queryKeys.inventory.summary(shopId),
    queryFn: () => fetchInventorySummary(token ?? "", shopId),
    enabled: Boolean(token && shopId),
    staleTime: 30_000,
  });

  const stockQuery = useQuery({
    queryKey: queryKeys.inventory.stock(shopId),
    queryFn: () => fetchStockPosition(token ?? "", shopId),
    enabled: Boolean(token && shopId),
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
    queryFn: () => fetchInventoryCatalog(token ?? "", {
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
    enabled: Boolean(token && shopId && view === "catalog"),
    staleTime: 5 * 60_000,
  });

  const brandsQuery = useQuery({
    queryKey: queryKeys.inventory.brands(shopId),
    queryFn: () => fetchInventoryBrands(token ?? "", shopId),
    enabled: Boolean(token && shopId && view === "catalog"),
    staleTime: 5 * 60_000,
  });

  const movementQuery = useQuery({
    queryKey: queryKeys.inventory.movements({ shopId, movementType, page, limit: PAGE_SIZE }),
    queryFn: () => fetchInventoryMovements(token ?? "", { shopId, movementType, page, limit: PAGE_SIZE }),
    enabled: Boolean(token && shopId && view === "movements"),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const stockRows = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    return (stockQuery.data ?? []).filter((row) => {
      const searchMatch = !query || row.item.name.toLowerCase().includes(query) || row.item.sku?.toLowerCase().includes(query);
      if (!searchMatch) return false;

      const physical = asNumber(row.physicalStock);
      const reserved = asNumber(row.reservedStock);
      const available = asNumber(row.availableStock);
      const minimum = asNumber(row.item.minimumStock);

      if (stockFilter === "available") return available > 0;
      if (stockFilter === "low") return available > 0 && minimum > 0 && available <= minimum;
      if (stockFilter === "out") return physical >= 0 && available <= 0;
      if (stockFilter === "reserved") return reserved > 0;
      if (stockFilter === "negative") return physical < 0;
      return true;
    });
  }, [debouncedSearch, stockFilter, stockQuery.data]);

  const movementRows = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    if (!query) return movementQuery.data ?? [];
    return (movementQuery.data ?? []).filter((row) =>
      row.item.name.toLowerCase().includes(query) ||
      row.item.sku?.toLowerCase().includes(query) ||
      row.reason?.toLowerCase().includes(query),
    );
  }, [debouncedSearch, movementQuery.data]);

  const stockTotals = useMemo(() => (stockQuery.data ?? []).reduce((acc, row) => {
    acc.physical += asNumber(row.physicalStock);
    acc.reserved += asNumber(row.reservedStock);
    acc.available += asNumber(row.availableStock);
    if (asNumber(row.physicalStock) < 0) acc.negative += 1;
    return acc;
  }, { physical: 0, reserved: 0, available: 0, negative: 0 }), [stockQuery.data]);

  const stockColumns = useMemo<ColumnDef<StockPosition>[]>(() => [
    { id: "product", header: "Product", cell: ({ row }) => <div className="min-w-[clamp(11rem,20vw,24rem)]"><div className="truncate font-semibold">{row.original.item.name}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{row.original.item.unit}</div></div> },
    { id: "sku", header: "SKU", cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.item.sku || "—"}</span> },
    { id: "physical", header: "Physical", cell: ({ row }) => <span className="numeric-cell block text-right font-medium">{asNumber(row.original.physicalStock).toLocaleString("en-IN")}</span> },
    { id: "reserved", header: "Reserved", cell: ({ row }) => <span className="numeric-cell block text-right text-muted-foreground">{asNumber(row.original.reservedStock).toLocaleString("en-IN")}</span> },
    { id: "available", header: "Available", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{asNumber(row.original.availableStock).toLocaleString("en-IN")}</span> },
    { id: "minimum", header: "Minimum", cell: ({ row }) => <span className="numeric-cell block text-right text-muted-foreground">{asNumber(row.original.item.minimumStock).toLocaleString("en-IN")}</span> },
    { id: "shortfall", header: "Shortfall", cell: ({ row }) => {
      const shortfall = Math.max(0, asNumber(row.original.item.minimumStock) - asNumber(row.original.availableStock));
      return <span className={cn("numeric-cell block text-right", shortfall > 0 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{shortfall || "—"}</span>;
    } },
    { id: "status", header: "Status", cell: ({ row }) => <div className="text-right">{stockBadge(row.original)}</div> },
  ], []);

  const catalogColumns = useMemo<ColumnDef<InventoryCatalogItem>[]>(() => [
    { id: "product", header: "Product", cell: ({ row }) => <div className="min-w-[clamp(11rem,20vw,24rem)]"><div className="truncate font-semibold">{row.original.name}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{row.original.unit}{row.original.requiresSerialNumber ? " · Serial tracked" : ""}</div></div> },
    { accessorKey: "sku", header: "SKU", cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.sku || "—"}</span> },
    { id: "category", header: "Category", cell: ({ row }) => <span className="text-muted-foreground">{row.original.category?.name || "Uncategorised"}</span> },
    { id: "brand", header: "Brand", cell: ({ row }) => <span className="text-muted-foreground">{row.original.brand?.name || "Unbranded"}</span> },
    { id: "price", header: "Selling price", cell: ({ row }) => { const price = asNumber(row.original.defaultSellingPrice); return <span className="numeric-cell block text-right font-medium">{price > 0 ? formatINR(price) : <span className="text-amber-700 dark:text-amber-300">Not priced</span>}</span>; } },
    { id: "physical", header: "Physical", cell: ({ row }) => <span className="numeric-cell block text-right">{asNumber(row.original.physicalStock).toLocaleString("en-IN")}</span> },
    { id: "reserved", header: "Reserved", cell: ({ row }) => <span className="numeric-cell block text-right text-muted-foreground">{asNumber(row.original.reservedStock).toLocaleString("en-IN")}</span> },
    { id: "available", header: "Available", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{asNumber(row.original.availableStock).toLocaleString("en-IN")}</span> },
  ], []);

  const movementColumns = useMemo<ColumnDef<StockMovement>[]>(() => [
    { id: "product", header: "Product", cell: ({ row }) => <div className="min-w-[clamp(10rem,18vw,22rem)]"><div className="font-semibold">{row.original.item.name}</div><div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{row.original.item.sku || "—"}</div></div> },
    { accessorKey: "movementType", header: "Movement", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{MOVEMENT_LABELS[row.original.movementType]}</Badge> },
    { accessorKey: "quantityIn", header: "In", cell: ({ row }) => <span className="numeric-cell block text-right font-medium text-emerald-700 dark:text-emerald-300">{asNumber(row.original.quantityIn) || "—"}</span> },
    { accessorKey: "quantityOut", header: "Out", cell: ({ row }) => <span className="numeric-cell block text-right font-medium text-rose-700 dark:text-rose-300">{asNumber(row.original.quantityOut) || "—"}</span> },
    { id: "reference", header: "Reference / reason", cell: ({ row }) => { const reference = row.original.sale?.saleNumber || row.original.deliveryMemo?.dmNumber || row.original.order?.orderNumber || row.original.reason || "—"; return <div className="w-[clamp(11rem,22vw,28rem)] truncate text-muted-foreground" title={reference}>{reference}</div>; } },
    { id: "createdBy", header: "By", cell: ({ row }) => <span className="text-muted-foreground">{row.original.createdBy?.name || "System"}</span> },
    { accessorKey: "createdAt", header: "Time", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
  ], []);

  const focusActiveRow = useCallback(() => {
    const pointer = activePointerStore.getPointer();
    const zoneId = `${reportId}.rows`;
    const index = pointer?.zoneId === zoneId ? pointer.index : 0;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-operational-report="${reportId}"] [data-operational-row="${index}"]`)?.focus();
    });
  }, [reportId]);

  const closeSelectedItem = useCallback(() => {
    setSelectedItem(null);
    focusActiveRow();
  }, [focusActiveRow, setSelectedItem]);

  const openStockItem = useCallback((row: StockPosition) => setSelectedItem({
    id: row.item.id,
    name: row.item.name,
    sku: row.item.sku,
    unit: row.item.unit,
    physicalStock: asNumber(row.physicalStock),
    reservedStock: asNumber(row.reservedStock),
    availableStock: asNumber(row.availableStock),
    minimumStock: asNumber(row.item.minimumStock),
  }), [setSelectedItem]);

  const openCatalogItem = useCallback((item: InventoryCatalogItem) => setSelectedItem({
    id: item.id,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    category: item.category?.name || undefined,
    brand: item.brand?.name || undefined,
    physicalStock: asNumber(item.physicalStock),
    reservedStock: asNumber(item.reservedStock),
    availableStock: asNumber(item.availableStock),
    minimumStock: asNumber(item.minimumStock),
    sellingPrice: asNumber(item.defaultSellingPrice),
    mrp: item.mrp == null ? undefined : asNumber(item.mrp),
    serialTracked: Boolean(item.requiresSerialNumber),
  }), [setSelectedItem]);

  const searchEscapeCommand = useMemo(() => ({
    id: "inventory.search.close",
    title: "Return to Inventory Report",
    execute: ({ target }: { target?: EventTarget | null }) => {
      if (target instanceof HTMLElement) target.blur();
      focusActiveRow();
    },
  }), [focusActiveRow]);
  const itemCloseCommand = useMemo(() => ({
    id: "inventory.item.close",
    title: "Close Item View",
    execute: closeSelectedItem,
  }), [closeSelectedItem]);

  useCommand(searchEscapeCommand);
  useCommand(itemCloseCommand);
  useKeybinding(useMemo(() => ({ id: "inventory-search-escape", key: "esc", command: searchEscapeCommand.id, when: "inventory.search && input.editable && !dialog.open", priority: 170 }), [searchEscapeCommand.id]));
  useKeybinding(useMemo(() => ({ id: "inventory-item-escape", key: "esc", command: itemCloseCommand.id, when: "inventory.itemDialog && dialog.open", priority: 420 }), [itemCloseCommand.id]));

  const refresh = () => {
    void summaryQuery.refetch();
    void stockQuery.refetch();
    if (view === "catalog") void catalogQuery.refetch();
    if (view === "movements") void movementQuery.refetch();
  };

  if (!shopId) {
    return <WorkspacePage><div className="workspace-panel flex min-h-[50vh] items-center justify-center p-6 text-center"><div><Warehouse className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="text-sm font-semibold">Select a shop to view inventory</p><p className="mt-1 text-xs text-muted-foreground">Inventory data is always scoped to the active shop.</p></div></div></WorkspacePage>;
  }

  const summary = summaryQuery.data;
  const catalog = catalogQuery.data;
  const workspaceScope = JSON.stringify({ "app.module": "inventory", "app.view": reportId, "inventory.focused": true, "keyboard.scope": "workspace" });
  const searchScope = JSON.stringify({ "report.focused": true, "report.id": reportId, "report.search": true, "inventory.search": true, "keyboard.scope": "report.search" });
  const itemDialogScope = JSON.stringify({ "app.module": "inventory", "app.view": "inventory.item", "dialog.open": true, "inventory.itemDialog": true, "entity.activeId": selectedItem?.id, "keyboard.scope": "dialog.inventory-item" });
  const focusSearch = () => { searchRef.current?.focus(); searchRef.current?.select(); };

  return (
    <div data-keyboard-scope={workspaceScope}>
      <WorkspacePage>
        <WorkspacePageHeader
          kicker="Records · Inventory"
          title="Inventory workspace"
          description="Physical stock, active reservations, sellable availability, product pricing and immutable stock movements from the backend source of truth."
          icon={Warehouse}
          actions={<><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={refresh}><RefreshCw className="size-3.5" />Refresh</Button><FeatureActionButton featureId="STOCK_ENTRY" icon={Warehouse} /></>}
        />

        <WorkspaceMetricGrid>
          <WorkspaceMetric label="Products" value={summary?.totalItems ?? 0} detail={`${summary?.totalCategories ?? 0} categories · ${summary?.totalBrands ?? 0} brands`} icon={Boxes} loading={summaryQuery.isLoading} />
          <WorkspaceMetric label="Physical units" value={stockTotals.physical.toLocaleString("en-IN")} detail="Stock ledger balance" icon={Layers3} loading={stockQuery.isLoading} />
          <WorkspaceMetric label="Reserved units" value={stockTotals.reserved.toLocaleString("en-IN")} detail="Active stock reservations" icon={PackageMinus} tone={stockTotals.reserved > 0 ? "info" : "neutral"} loading={stockQuery.isLoading} />
          <WorkspaceMetric label="Available units" value={stockTotals.available.toLocaleString("en-IN")} detail="Server-derived sellable availability" icon={PackageCheck} tone="success" loading={stockQuery.isLoading} />
          <WorkspaceMetric label="Exceptions" value={(summary?.lowStockCount ?? 0) + (summary?.outOfStockCount ?? 0) + stockTotals.negative} detail={`${summary?.lowStockCount ?? 0} low · ${summary?.outOfStockCount ?? 0} out · ${stockTotals.negative} negative`} icon={CircleAlert} tone={(summary?.lowStockCount ?? 0) + (summary?.outOfStockCount ?? 0) + stockTotals.negative > 0 ? "warning" : "neutral"} loading={summaryQuery.isLoading || stockQuery.isLoading} />
        </WorkspaceMetricGrid>

        <WorkspacePanel title="Inventory operations" description="Stock Position is a live read model; Product Catalog is server-searched and paginated; Movements are ledger entries.">
          <WorkspaceToolbar>
            <div className="flex items-center gap-1 rounded-lg border bg-muted/35 p-0.5">
              <ViewButton active={view === "stock"} label="Stock Position" icon={Warehouse} onClick={() => setParams({ view: "stock", page: null })} />
              <ViewButton active={view === "catalog"} label="Product Catalog" icon={Tags} onClick={() => setParams({ view: "catalog", page: null })} />
              <ViewButton active={view === "movements"} label="Movements" icon={History} onClick={() => setParams({ view: "movements", page: null })} />
            </div>

            <div className="relative w-[clamp(13rem,28vw,32rem)] max-w-full flex-1 sm:flex-none" data-keyboard-scope={searchScope}>
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input ref={searchRef} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={view === "catalog" ? "Search product name or SKU…" : "Filter name, SKU or reason…"} className="h-9 bg-background pl-9 text-xs" aria-label="Filter inventory report" aria-keyshortcuts="Control+F" />
            </div>

            {view === "stock" ? <StockFilterMenu value={stockFilter} onChange={(value) => setParams({ stock: value === "all" ? null : value, page: null })} /> : null}
            {view === "catalog" ? <><FilterMenu label="Category" activeId={categoryId} items={(categoriesQuery.data ?? []).map((item) => ({ id: item.id, label: item.name }))} onChange={(value) => setParams({ categoryId: value || null, page: null })} /><FilterMenu label="Brand" activeId={brandId} items={(brandsQuery.data ?? []).map((item) => ({ id: item.id, label: item.name }))} onChange={(value) => setParams({ brandId: value || null, page: null })} /></> : null}
            {view === "movements" ? <MovementFilterMenu value={movementType} onChange={(value) => setParams({ movementType: value || null, page: null })} /> : null}
          </WorkspaceToolbar>

          {view === "stock" ? <OperationalDataTable id={REPORT_IDS.stock} data={stockRows} columns={stockColumns} getRowId={(row) => row.item.id} isLoading={stockQuery.isLoading} isError={stockQuery.isError} onRetry={() => void stockQuery.refetch()} onRowOpen={openStockItem} onFilterRequest={focusSearch} autoFocus emptyTitle="No stock rows" emptyDescription="No product matches the current stock/search filter." renderMobileCard={(row) => <StockMobileCard row={row} />} /> : null}
          {view === "catalog" ? <OperationalDataTable id={REPORT_IDS.catalog} data={catalog?.items ?? []} columns={catalogColumns} getRowId={(item) => item.id} isLoading={catalogQuery.isLoading} isError={catalogQuery.isError} onRetry={() => void catalogQuery.refetch()} onRowOpen={openCatalogItem} onFilterRequest={focusSearch} autoFocus emptyTitle="No products found" emptyDescription="No product matched the server-side catalog filters." renderMobileCard={(item) => <CatalogMobileCard item={item} />} /> : null}
          {view === "movements" ? <OperationalDataTable id={REPORT_IDS.movements} data={movementRows} columns={movementColumns} getRowId={(movement) => movement.id} isLoading={movementQuery.isLoading} isError={movementQuery.isError} onRetry={() => void movementQuery.refetch()} onFilterRequest={focusSearch} autoFocus emptyTitle="No stock movements" emptyDescription="No movement matches the selected type or current-page text filter." renderMobileCard={(movement) => <MovementMobileCard movement={movement} />} /> : null}

          {view === "catalog" && catalog ? <Pagination page={page} count={catalog.items.length} hasMore={catalog.hasMore} total={catalog.total} onPage={(nextPage) => setParams({ page: nextPage <= 1 ? null : String(nextPage) })} /> : null}
          {view === "movements" ? <Pagination page={page} count={(movementQuery.data ?? []).length} hasMore={(movementQuery.data ?? []).length >= PAGE_SIZE} onPage={(nextPage) => setParams({ page: nextPage <= 1 ? null : String(nextPage) })} /> : null}
        </WorkspacePanel>

        <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => { if (!open) closeSelectedItem(); }}>
          <DialogContent className="w-[min(94vw,44rem)] sm:max-w-none" data-keyboard-scope={itemDialogScope}>
            {selectedItem ? <>
              <DialogHeader>
                <div className="workspace-kicker">Stock query</div>
                <DialogTitle className="text-lg font-semibold">{selectedItem.name}</DialogTitle>
                <DialogDescription>{selectedItem.sku || "No SKU"} · {selectedItem.unit}{selectedItem.category ? ` · ${selectedItem.category}` : ""}{selectedItem.brand ? ` · ${selectedItem.brand}` : ""}</DialogDescription>
              </DialogHeader>
              <div className="workspace-metric-grid"><DetailMetric label="Physical" value={selectedItem.physicalStock} /><DetailMetric label="Reserved" value={selectedItem.reservedStock} /><DetailMetric label="Available" value={selectedItem.availableStock} strong /><DetailMetric label="Minimum" value={selectedItem.minimumStock} /></div>
              {selectedItem.sellingPrice !== undefined ? <div className="grid gap-2 rounded-xl border bg-muted/25 p-3 sm:grid-cols-3"><TextMetric label="Selling price" value={selectedItem.sellingPrice > 0 ? formatINR(selectedItem.sellingPrice) : "Not priced"} /><TextMetric label="MRP" value={selectedItem.mrp && selectedItem.mrp > 0 ? formatINR(selectedItem.mrp) : "—"} /><TextMetric label="Serial tracking" value={selectedItem.serialTracked ? "Required" : "No"} /></div> : null}
            </> : null}
          </DialogContent>
        </Dialog>
      </WorkspacePage>
    </div>
  );
}

function ViewButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: ComponentType<{ className?: string }>; onClick: () => void }) {
  return <Button variant={active ? "secondary" : "ghost"} size="sm" className="h-8 gap-1.5 px-2.5 text-[10px]" onClick={onClick}><Icon className="size-3.5" /><span className="hidden sm:inline">{label}</span></Button>;
}

function StockFilterMenu({ value, onChange }: { value: StockFilter; onChange: (value: StockFilter) => void }) {
  const values: StockFilter[] = ["all", "available", "low", "out", "reserved", "negative"];
  return <DropdownMenu><DropdownMenuTrigger className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">{value === "all" ? "All stock" : value.replaceAll("_", " ")}</DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>Stock condition</DropdownMenuLabel><DropdownMenuSeparator />{values.map((item) => <DropdownMenuItem key={item} onClick={() => onChange(item)}>{item === "all" ? "All stock" : item.replaceAll("_", " ")}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function FilterMenu({ label, activeId, items, onChange }: { label: string; activeId: string; items: Array<{ id: string; label: string }>; onChange: (value: string) => void }) {
  const activeLabel = items.find((item) => item.id === activeId)?.label;
  return <DropdownMenu><DropdownMenuTrigger className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">{activeLabel || label}</DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-[min(70vh,22rem)] w-[min(84vw,16rem)] overflow-y-auto"><DropdownMenuLabel>{label}</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => onChange("")}>All</DropdownMenuItem>{items.map((item) => <DropdownMenuItem key={item.id} onClick={() => onChange(item.id)}>{item.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function MovementFilterMenu({ value, onChange }: { value?: StockMovementType; onChange: (value: string) => void }) {
  return <DropdownMenu><DropdownMenuTrigger className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">{value ? MOVEMENT_LABELS[value] : "All movements"}</DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[min(84vw,16rem)]"><DropdownMenuLabel>Movement type</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => onChange("")}>All movements</DropdownMenuItem>{MOVEMENT_TYPES.map((item) => <DropdownMenuItem key={item} onClick={() => onChange(item)}>{MOVEMENT_LABELS[item]}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function Pagination({ page, count, hasMore, total, onPage }: { page: number; count: number; hasMore: boolean; total?: number; onPage: (page: number) => void }) {
  return <div className="flex items-center justify-between border-t bg-muted/20 px-[clamp(0.7rem,1vw,1rem)] py-2.5 text-[10px] text-muted-foreground"><span>Page {page} · {count} records{total !== undefined ? ` · ${total.toLocaleString("en-IN")} total` : ""}</span><div className="flex gap-1.5"><Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" className="h-8" disabled={!hasMore} onClick={() => onPage(page + 1)}>Next</Button></div></div>;
}

function StockMobileCard({ row }: { row: StockPosition }) {
  return <div className="rounded-xl bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{row.item.name}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.item.sku || "No SKU"}</p></div>{stockBadge(row)}</div><div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-right"><NumberMetric label="Physical" value={asNumber(row.physicalStock)} /><NumberMetric label="Reserved" value={asNumber(row.reservedStock)} /><NumberMetric label="Available" value={asNumber(row.availableStock)} strong /></div></div>;
}

function CatalogMobileCard({ item }: { item: InventoryCatalogItem }) {
  const price = asNumber(item.defaultSellingPrice);
  return <div className="rounded-xl bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{item.name}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.sku || "No SKU"}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.category?.name || "Uncategorised"} · {item.brand?.name || "Unbranded"}</p></div><span className="numeric-cell text-sm font-semibold">{price > 0 ? formatINR(price) : "Not priced"}</span></div><div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-right"><NumberMetric label="Physical" value={asNumber(item.physicalStock)} /><NumberMetric label="Reserved" value={asNumber(item.reservedStock)} /><NumberMetric label="Available" value={asNumber(item.availableStock)} strong /></div></div>;
}

function MovementMobileCard({ movement }: { movement: StockMovement }) {
  const reference = movement.sale?.saleNumber || movement.deliveryMemo?.dmNumber || movement.order?.orderNumber || movement.reason || "—";
  return <div className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{movement.item.name}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{movement.item.sku || "No SKU"}</p></div><Badge variant="secondary" className="text-[9px]">{MOVEMENT_LABELS[movement.movementType]}</Badge></div><p className="mt-2 truncate text-[10px] text-muted-foreground">{reference}</p><div className="mt-3 flex justify-between border-t pt-2 text-xs"><span className="text-emerald-700">In {asNumber(movement.quantityIn) || "—"}</span><span className="text-rose-700">Out {asNumber(movement.quantityOut) || "—"}</span><span className="text-muted-foreground">{formatDateTime(movement.createdAt)}</span></div></div>;
}

function DetailMetric({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={cn("rounded-xl border bg-muted/20 p-3", strong && "border-indigo-200 bg-indigo-50/40 dark:border-indigo-950 dark:bg-indigo-950/20")}><p className="workspace-kicker">{label}</p><p className="numeric-cell mt-1 text-lg font-semibold">{value.toLocaleString("en-IN")}</p></div>;
}

function TextMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="workspace-kicker">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function NumberMetric({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div><p className="workspace-kicker">{label}</p><p className={cn("numeric-cell mt-1 text-xs font-semibold", strong && "text-indigo-700 dark:text-indigo-300")}>{value.toLocaleString("en-IN")}</p></div>;
}
