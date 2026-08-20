"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CreditCard,
  FileCheck,
  PackageCheck,
  Receipt,
  ReceiptIndianRupee,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeatureActionButton } from "@/components/workspace/FeatureActionButton";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { DashboardAnalyticsSection } from "@/features/dashboard/components/DashboardAnalyticsSection";
import { KeyboardDashboardChart } from "@/features/dashboard/components/KeyboardDashboardChart";
import { fetchOwnerDashboardApi, fetchStaffDashboardApi } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { nearestSpatial } from "@/lib/focus/spatial-navigation";
import { drilldownStack } from "@/lib/navigation/drilldown-stack";
import { consumeNavigationRestoration, peekNavigationRestoration, restoreNavigationFrame } from "@/lib/navigation/navigation-restoration";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { cn, formatINR } from "@/lib/utils";

const ZONE_ID = "dashboard.tiles";
type Direction = "up" | "down" | "left" | "right";
type TileTone = "neutral" | "success" | "warning" | "danger" | "info";

interface DashboardTile {
  id: string;
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: TileTone;
  href?: string;
  permission?: string;
}

function toneClass(tone: TileTone = "neutral") {
  if (tone === "success") return "border-emerald-200/80 bg-emerald-50/45 dark:border-emerald-950 dark:bg-emerald-950/20";
  if (tone === "warning") return "border-amber-200/80 bg-amber-50/45 dark:border-amber-950 dark:bg-amber-950/20";
  if (tone === "danger") return "border-rose-200/80 bg-rose-50/45 dark:border-rose-950 dark:bg-rose-950/20";
  if (tone === "info") return "border-indigo-200/80 bg-indigo-50/40 dark:border-indigo-950 dark:bg-indigo-950/20";
  return "border-border bg-card/80";
}

export default function DashboardPage() {
  const router = useRouter();
  const { token, activeShopId, user, startDate } = useAuthStore();
  const isOwner = user?.role === "OWNER";
  const containerRef = useRef<HTMLDivElement>(null);
  const restoration = peekNavigationRestoration("/dashboard");

  const ownerQuery = useQuery({
    queryKey: queryKeys.dashboard.owner(activeShopId, startDate),
    queryFn: () => fetchOwnerDashboardApi(token ?? "", { shopId: activeShopId ?? undefined, date: startDate }),
    enabled: Boolean(token && isOwner),
    staleTime: 30_000,
  });

  const staffQuery = useQuery({
    queryKey: queryKeys.dashboard.staff(activeShopId || "", startDate),
    queryFn: () => fetchStaffDashboardApi(token ?? "", { shopId: activeShopId || "", date: startDate }),
    enabled: Boolean(token && !isOwner && activeShopId),
    staleTime: 30_000,
  });

  const activeQuery = isOwner ? ownerQuery : staffQuery;
  const errorMessage = activeQuery.error instanceof Error ? activeQuery.error.message : "Dashboard metrics could not be loaded.";

  const rawTiles = useMemo<DashboardTile[]>(() => {
    if (isOwner && ownerQuery.data) {
      const data = ownerQuery.data;
      return [
        { id: "dashboard.sales", label: "Today's sales", value: formatINR(data.todaySales), detail: `${data.salesCount} invoices · Walk-in ${formatINR(data.walkinSales)}`, icon: TrendingUp, tone: "success", href: "/sales", permission: PERMISSIONS.SALE_VIEW_OWN },
        { id: "dashboard.collections", label: "Collections", value: formatINR(data.cashCollected + data.upiCollected + data.cardCollected + data.bankCollected), detail: `Cash ${formatINR(data.cashCollected)} · UPI ${formatINR(data.upiCollected)}`, icon: CreditCard, tone: "info", href: "/payments", permission: PERMISSIONS.PAYMENT_VIEW_OWN },
        { id: "dashboard.dm", label: "Pending DM value", value: formatINR(data.pendingDmAmount), detail: "Unbilled delivery memo balance", icon: Truck, tone: data.pendingDmAmount > 0 ? "warning" : "neutral", href: "/delivery-memos", permission: PERMISSIONS.DM_VIEW_OWN },
        { id: "dashboard.lowStock", label: "Low stock", value: data.lowStockAlerts.toLocaleString("en-IN"), detail: "Below minimum available stock", icon: AlertTriangle, tone: data.lowStockAlerts > 0 ? "danger" : "success", href: "/inventory?view=stock&stock=low", permission: PERMISSIONS.ITEM_VIEW },
        { id: "dashboard.approvals", label: "Pending approvals", value: data.pendingApprovalRequests.toLocaleString("en-IN"), detail: "Operational approval requests", icon: ShieldAlert, tone: data.pendingApprovalRequests ? "warning" : "neutral", href: "/approvals" },
        { id: "dashboard.paymentVerification", label: "Payment verification", value: data.paymentVerificationPending.toLocaleString("en-IN"), detail: "Receipts awaiting owner verification", icon: FileCheck, tone: data.paymentVerificationPending ? "warning" : "neutral", href: "/payments?status=RECORDED", permission: PERMISSIONS.PAYMENT_VIEW_OWN },
        { id: "dashboard.cashMismatch", label: "Cash mismatches", value: data.cashMismatch.toLocaleString("en-IN"), detail: "Cash-session discrepancies", icon: ReceiptIndianRupee, tone: data.cashMismatch ? "danger" : "neutral", href: "/cash-sessions" },
        { id: "dashboard.gst", label: "GST pending", value: data.gstInvoicesPendingCount.toLocaleString("en-IN"), detail: formatINR(data.gstInvoicesPendingAmount), icon: Building2, tone: data.gstInvoicesPendingCount ? "info" : "neutral", href: "/sales", permission: PERMISSIONS.SALE_VIEW_OWN },
      ];
    }

    if (!isOwner && staffQuery.data) {
      const data = staffQuery.data;
      return [
        { id: "dashboard.staffSales", label: "My sales", value: formatINR(data.salesTotal), detail: `${data.salesCount} invoices today`, icon: Receipt, tone: "success", href: "/sales", permission: PERMISSIONS.SALE_VIEW_OWN },
        { id: "dashboard.staffCash", label: "Cash collected", value: formatINR(data.cashCollected), detail: `UPI recorded ${formatINR(data.upiRecorded)}`, icon: CreditCard, tone: "info", href: "/payments?mode=CASH", permission: PERMISSIONS.PAYMENT_VIEW_OWN },
        { id: "dashboard.staffOrders", label: "Orders packed", value: data.ordersPacked.toLocaleString("en-IN"), detail: `${data.ordersDispatched} dispatched`, icon: ShoppingBag, href: "/orders", permission: PERMISSIONS.ORDER_VIEW_ASSIGNED },
        { id: "dashboard.staffDm", label: "Delivery memos", value: data.dmsCreated.toLocaleString("en-IN"), detail: formatINR(data.dmTotal), icon: Truck, href: "/delivery-memos", permission: PERMISSIONS.DM_VIEW_OWN },
        { id: "dashboard.staffCheque", label: "Cheques received", value: data.chequesReceived.toLocaleString("en-IN"), detail: "Recorded during this business date", icon: ReceiptIndianRupee, href: "/payments?mode=CHEQUE", permission: PERMISSIONS.PAYMENT_VIEW_OWN },
        { id: "dashboard.staffClose", label: "Day close", value: data.dayCloseStatus, detail: `${data.stockEntries} stock entries`, icon: PackageCheck },
      ];
    }
    return [];
  }, [isOwner, ownerQuery.data, staffQuery.data]);

  const tiles = useMemo(() => rawTiles.map((tile) => ({
    ...tile,
    href: tile.permission && !hasPermission(user, tile.permission) ? undefined : tile.href,
  })), [rawTiles, user]);

  const topCustomerPoints = useMemo(() => {
    if (!isOwner || !ownerQuery.data || !hasPermission(user, PERMISSIONS.CUSTOMER_VIEW)) return [];
    return ownerQuery.data.topCustomers
      .map((entry) => ({
        id: entry.customerId,
        label: entry.customer?.name || "Customer",
        value: Number(entry._sum.totalAmount ?? 0),
        href: `/customers/${entry.customerId}`,
      }))
      .filter((point) => point.value > 0);
  }, [isOwner, ownerQuery.data, user]);

  const pointerSnapshot = useSyncExternalStore(activePointerStore.subscribe, activePointerStore.getSnapshot, activePointerStore.getServerSnapshot);
  const pointer = pointerSnapshot.pointer?.zoneId === ZONE_ID ? pointerSnapshot.pointer : null;
  const activeIndex = pointer ? Math.max(0, Math.min(pointer.index, Math.max(tiles.length - 1, 0))) : 0;
  const activeTile = tiles[activeIndex];

  const focusTile = useCallback((index: number) => {
    requestAnimationFrame(() => containerRef.current?.querySelector<HTMLElement>(`[data-dashboard-index="${index}"]`)?.focus());
  }, []);

  const activate = useCallback((index: number, focus = true) => {
    if (!tiles.length) return;
    const next = Math.max(0, Math.min(index, tiles.length - 1));
    activePointerStore.setPointer({ zoneId: ZONE_ID, itemId: tiles[next].id, index: next });
    if (focus) focusTile(next);
  }, [focusTile, tiles]);

  useEffect(() => {
    if (!tiles.length) return;
    if (restoration) {
      restoreNavigationFrame(restoration);
      consumeNavigationRestoration("/dashboard");
    }
    const current = activePointerStore.getPointer();
    if (current?.zoneId === ZONE_ID) {
      const restoredIndex = tiles.findIndex((tile) => tile.id === current.itemId);
      activate(restoredIndex >= 0 ? restoredIndex : Math.min(current.index, tiles.length - 1));
      return;
    }
    if (current?.zoneId?.startsWith("dashboard.chart.")) return;
    activate(0);
  }, [activate, restoration, tiles]);

  const move = useCallback((direction: Direction) => {
    const root = containerRef.current;
    if (!root || !activeTile) return;
    const spatialItems = Array.from(root.querySelectorAll<HTMLElement>("[data-dashboard-tile-id]")).map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.dataset.dashboardTileId ?? "", x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }).filter((item) => item.id);
    const next = nearestSpatial(spatialItems, activeTile.id, direction);
    if (!next) return;
    const nextIndex = tiles.findIndex((tile) => tile.id === next.id);
    if (nextIndex >= 0) activate(nextIndex);
  }, [activate, activeTile, tiles]);

  const openTile = useCallback((tile: DashboardTile | undefined) => {
    if (!tile?.href) return;
    drilldownStack.push({
      route: "/dashboard",
      module: "dashboard",
      view: "dashboard",
      activePointer: activePointerStore.getPointer(),
      selectedIds: [],
      filters: { businessDate: startDate },
      scrollOffset: typeof window === "undefined" ? 0 : window.scrollY,
    });
    router.push(tile.href);
  }, [router, startDate]);

  const commands = useMemo(() => ({
    up: { id: "dashboard.tile.up", title: "Move Up", category: "Dashboard", repeatable: true, execute: () => move("up") },
    down: { id: "dashboard.tile.down", title: "Move Down", category: "Dashboard", repeatable: true, execute: () => move("down") },
    left: { id: "dashboard.tile.left", title: "Move Left", category: "Dashboard", repeatable: true, execute: () => move("left") },
    right: { id: "dashboard.tile.right", title: "Move Right", category: "Dashboard", repeatable: true, execute: () => move("right") },
    open: { id: "dashboard.tile.open", title: "Drill Down", category: "Dashboard", when: "dashboard.activeTileCanDrillDown", execute: () => openTile(activeTile) },
  }), [activeTile, move, openTile]);

  useCommand(commands.up);
  useCommand(commands.down);
  useCommand(commands.left);
  useCommand(commands.right);
  useCommand(commands.open);

  const dashboardWhen = "dashboard.focused && !dashboard.chartFocused && !dialog.open && !input.editable";
  useKeybinding(useMemo(() => ({ id: "dashboard-up", key: "arrowup", command: commands.up.id, when: dashboardWhen, priority: 120, allowRepeat: true }), [commands.up.id]));
  useKeybinding(useMemo(() => ({ id: "dashboard-down", key: "arrowdown", command: commands.down.id, when: dashboardWhen, priority: 120, allowRepeat: true }), [commands.down.id]));
  useKeybinding(useMemo(() => ({ id: "dashboard-left", key: "arrowleft", command: commands.left.id, when: dashboardWhen, priority: 120, allowRepeat: true }), [commands.left.id]));
  useKeybinding(useMemo(() => ({ id: "dashboard-right", key: "arrowright", command: commands.right.id, when: dashboardWhen, priority: 120, allowRepeat: true }), [commands.right.id]));
  useKeybinding(useMemo(() => ({ id: "dashboard-open", key: "enter", command: commands.open.id, when: `${dashboardWhen} && dashboard.activeTileCanDrillDown`, priority: 130 }), [commands.open.id]));
  useKeybinding(useMemo(() => ({ id: "dashboard-unwind", key: "esc", command: "navigation.unwind", when: "dashboard.focused && navigation.canUnwind && !dialog.open && !input.editable", priority: 40 }), []));

  if (activeQuery.isLoading) {
    return <WorkspacePage><div className="flex items-center justify-between gap-3"><div className="space-y-2"><Skeleton className="h-7 w-[clamp(12rem,20vw,20rem)]"/><Skeleton className="h-4 w-[clamp(16rem,32vw,32rem)]"/></div><Skeleton className="h-9 w-[clamp(7rem,10vw,10rem)]"/></div><div className="workspace-metric-grid">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-[clamp(6rem,11vh,8rem)] rounded-xl" />)}</div><Skeleton className="h-[42vh] w-full rounded-xl" /></WorkspacePage>;
  }

  if (activeQuery.isError) {
    return <WorkspacePage><WorkspacePageHeader kicker="Live operations" title="Operations dashboard" description="The dashboard request failed; no server metrics have been replaced with zeros." backHref={null} icon={BarChart3} /><div className="workspace-panel flex min-h-[48vh] items-center justify-center p-[clamp(1rem,3vw,3rem)] text-center"><div className="w-[min(88vw,34rem)]"><AlertTriangle className="mx-auto mb-3 size-8 text-destructive"/><p className="text-sm font-semibold">Failed to load dashboard metrics</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{errorMessage}</p><Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => void activeQuery.refetch()}><RefreshCw className="size-3.5"/>Retry</Button></div></div></WorkspacePage>;
  }

  const scope = JSON.stringify({
    "app.module": "dashboard",
    "app.view": "dashboard",
    "dashboard.focused": true,
    "dashboard.activeTile": activeTile?.id,
    "dashboard.activeTileCanDrillDown": Boolean(activeTile?.href),
    "entity.activeId": activeTile?.id,
    "keyboard.scope": "dashboard",
    "report.period": startDate,
  });

  return (
    <div ref={containerRef} data-keyboard-scope={scope}>
      <WorkspacePage>
        <WorkspacePageHeader
          kicker={isOwner ? "Live operations · Owner" : "Live operations · Staff"}
          title={isOwner ? "Operations dashboard" : "My shift dashboard"}
          description="Server-authoritative business-date snapshot. Arrow keys move the active metric tile; Enter drills into its operational register."
          backHref={null}
          icon={BarChart3}
          meta={<Badge variant="outline" className="font-mono text-[9px]">Business date · {startDate}</Badge>}
          actions={<><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void activeQuery.refetch()}><RefreshCw className="size-3.5"/>Refresh</Button><FeatureActionButton featureId="SALE_CREATE" icon={Receipt}/></>}
        />

        <section aria-label="Dashboard operational metrics" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,clamp(13rem,18vw,18rem)),1fr))] gap-[clamp(0.5rem,0.8vw,0.8rem)]">
          {tiles.map((tile, index) => {
            const active = index === activeIndex && pointer?.zoneId === ZONE_ID;
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                type="button"
                data-dashboard-index={index}
                data-dashboard-tile-id={tile.id}
                data-keyboard-active={active || undefined}
                tabIndex={active || (!pointerSnapshot.pointer && index === 0) ? 0 : -1}
                aria-disabled={!tile.href}
                aria-label={`${tile.label}: ${tile.value}${tile.href ? ". Enter to drill down." : "."}`}
                onFocus={() => activate(index, false)}
                onMouseEnter={() => activate(index, false)}
                onClick={() => { activate(index, false); openTile(tile); }}
                className={cn(
                  "min-h-[clamp(7.5rem,15vh,9.5rem)] rounded-xl border p-[clamp(0.7rem,1vw,1rem)] text-left outline-none transition-[border-color,background-color,box-shadow,transform]",
                  toneClass(tile.tone),
                  tile.href ? "cursor-pointer hover:-translate-y-px hover:shadow-sm" : "cursor-default",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  active && "border-primary/60 bg-primary/10 shadow-[inset_3px_0_0_var(--primary)] ring-1 ring-inset ring-primary/25",
                )}
              >
                <div className="flex items-start justify-between gap-3"><span className={cn("flex size-8 items-center justify-center rounded-lg border bg-background/70 text-muted-foreground", active && "border-primary/30 text-primary")}><Icon className="size-4" /></span>{tile.href ? <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Enter ↵</span> : null}</div>
                <p className="mt-[clamp(0.65rem,1vh,0.9rem)] text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tile.label}</p>
                <p className="numeric-cell mt-1 text-[clamp(1.05rem,1.7vw,1.45rem)] font-semibold tracking-tight">{tile.value}</p>
                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{tile.detail}</p>
              </button>
            );
          })}
        </section>

        {isOwner && ownerQuery.data ? (
          <div className="space-y-[var(--workspace-gap)]">
            {topCustomerPoints.length ? <KeyboardDashboardChart id="topCustomers" title="Top customers" description="Backend top-customer sales for the selected business date. Focus a bar, use Left/Right to move, and Enter to open the customer account." points={topCustomerPoints} businessDate={startDate} /> : null}
            <div className="workspace-two-column">
              <WorkspacePanel title="Order fulfilment" description="Snapshot of today's order queue from the dashboard service."><div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs"><SummaryLine label="Orders created" value={ownerQuery.data.ordersCreated} /><SummaryLine label="Orders to pack" value={ownerQuery.data.ordersToPack} tone={ownerQuery.data.ordersToPack ? "warning" : undefined} /><SummaryLine label="Orders dispatched" value={ownerQuery.data.ordersDispatched} tone="success" /></div></WorkspacePanel>
              <WorkspacePanel title="Customer activity" description="Customer-account signals for the selected business date."><div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs"><SummaryLine label="New customers" value={ownerQuery.data.newCustomersToday} /><SummaryLine label="With outstanding balance" value={ownerQuery.data.outstandingCustomersCount} tone={ownerQuery.data.outstandingCustomersCount ? "warning" : undefined} /><SummaryLine label="Inactive 30+ days" value={ownerQuery.data.inactiveCustomersCount} tone={ownerQuery.data.inactiveCustomersCount ? "danger" : undefined} /></div></WorkspacePanel>
            </div>
            <WorkspacePanel title="Owner analytics and trends" description="Date-range analytics are separate from the single business-date snapshot above."><div className="p-[clamp(0.6rem,0.9vw,1rem)]"><DashboardAnalyticsSection /></div></WorkspacePanel>
          </div>
        ) : null}
      </WorkspacePage>
    </div>
  );
}

function SummaryLine({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "danger" }) {
  const toneClassName = tone === "success" ? "text-emerald-600 dark:text-emerald-300" : tone === "warning" ? "text-amber-600 dark:text-amber-300" : tone === "danger" ? "text-rose-600 dark:text-rose-300" : "text-foreground";
  return <div className="flex min-h-[clamp(2.6rem,5vh,3.2rem)] items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className={`numeric-cell font-semibold ${toneClassName}`}>{value.toLocaleString("en-IN")}</span></div>;
}
