"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { KeyboardInspector } from "@/components/keyboard/KeyboardInspector";
import { KeyboardRuntimeProvider, useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { DatePeriodDialog } from "@/components/shell/DatePeriodDialog";
import { Header } from "@/components/shell/Header";
import { RightActionRail } from "@/components/shell/RightActionRail";
import { ShopSwitcherDialog } from "@/components/shell/ShopSwitcherDialog";
import { Sidebar } from "@/components/shell/Sidebar";
import { StatusBar } from "@/components/shell/StatusBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setUnauthorizedHandler } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { contextKeyService } from "@/lib/context/context-key-service";
import { getFeature, isShortcutRegistrable } from "@/lib/features/feature-availability";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { drilldownStack } from "@/lib/navigation/drilldown-stack";
import { queueNavigationRestoration } from "@/lib/navigation/navigation-restoration";
import { hasPermission } from "@/lib/permissions/permissions";
import { disconnectRealtimeSocket, initRealtimeSocket } from "@/lib/realtime/socket-client";

const SHELL_OVERLAY_WHEN = "dialog.commandPalette || dialog.datePeriod || dialog.shopSwitcher";

function subscribeAuthHydration(listener: () => void) {
  return useAuthStore.persist.onFinishHydration(() => listener());
}

function getAuthHydrationSnapshot() {
  return useAuthStore.persist.hasHydrated();
}

function DashboardShellContent({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, activeShopId } = useAuthStore();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [shopDialogOpen, setShopDialogOpen] = useState(false);
  const saleFeature = getFeature("SALE_CREATE");
  const orderFeature = getFeature("ORDER_CREATE");
  const deliveryMemoFeature = getFeature("DM_CREATE");
  const paymentFeature = getFeature("PAYMENT_CREATE");
  const stockEntryFeature = getFeature("STOCK_ENTRY");
  const stockTransferFeature = getFeature("STOCK_TRANSFER");
  const physicalStockFeature = getFeature("PHYSICAL_STOCK");
  const navigationVersion = useSyncExternalStore(drilldownStack.subscribe, drilldownStack.getVersion, drilldownStack.getServerVersion);
  const canUnwind = navigationVersion >= 0 && drilldownStack.size() > 0;

  useEffect(() => {
    contextKeyService.patch({
      "app.authenticated": true,
      "shop.activeId": activeShopId,
      "dialog.open": commandPaletteOpen || dateDialogOpen || shopDialogOpen,
      "dialog.commandPalette": commandPaletteOpen,
      "dialog.datePeriod": dateDialogOpen,
      "dialog.shopSwitcher": shopDialogOpen,
      "permission.saleCreate": hasPermission(user, saleFeature.requiredPermission),
      "permission.orderCreate": hasPermission(user, orderFeature.requiredPermission),
      "permission.dmCreate": hasPermission(user, deliveryMemoFeature.requiredPermission),
      "permission.paymentCreate": hasPermission(user, paymentFeature.requiredPermission),
      "permission.stockCreateMovement": hasPermission(user, stockEntryFeature.requiredPermission),
      "feature.saleCreate": isShortcutRegistrable(saleFeature),
      "feature.orderCreate": isShortcutRegistrable(orderFeature),
      "feature.dmCreate": isShortcutRegistrable(deliveryMemoFeature),
      "feature.paymentCreate": isShortcutRegistrable(paymentFeature),
      "feature.stockEntry": isShortcutRegistrable(stockEntryFeature),
      "feature.stockTransfer": isShortcutRegistrable(stockTransferFeature),
      "feature.physicalStock": isShortcutRegistrable(physicalStockFeature),
      "navigation.canUnwind": canUnwind,
      "navigation.depth": drilldownStack.size(),
    });
  }, [activeShopId, canUnwind, commandPaletteOpen, dateDialogOpen, deliveryMemoFeature, navigationVersion, orderFeature, paymentFeature, physicalStockFeature, saleFeature, shopDialogOpen, stockEntryFeature, stockTransferFeature, user]);

  const unwind = useCallback(() => {
    const frame = drilldownStack.pop();
    if (!frame) return;
    queueNavigationRestoration(frame);
    router.push(`${frame.route}${frame.searchParams ? `?${frame.searchParams}` : ""}`);
  }, [router]);

  const commands = useMemo(() => ({
    goTo: {
      id: "navigation.goTo",
      title: "Go To",
      category: "Navigation",
      description: "Open the universal command and navigation palette.",
      execute: () => setCommandPaletteOpen(true),
    },
    unwind: {
      id: "navigation.unwind",
      title: "Back",
      category: "Navigation",
      description: "Return to the previous ERP frame and restore its active pointer.",
      when: "navigation.canUnwind && !dialog.open && !input.editable",
      execute: unwind,
    },
    period: {
      id: "report.changePeriod",
      title: "Change Period",
      category: "Context",
      description: "Change the active business date or period.",
      execute: () => setDateDialogOpen(true),
    },
    shop: {
      id: "shop.switch",
      title: "Switch Shop",
      category: "Context",
      description: "Switch the active shop context.",
      execute: () => setShopDialogOpen(true),
    },
    sale: {
      id: "sales.create",
      title: "New Sale",
      category: "Transactions",
      description: "Open the sale-entry workflow.",
      when: "permission.saleCreate && feature.saleCreate && !dialog.open",
      execute: () => router.push(saleFeature.route),
    },
    order: {
      id: "orders.create",
      title: "New Order",
      category: "Transactions",
      description: "Create a new customer order draft.",
      when: "permission.orderCreate && feature.orderCreate && !dialog.open",
      execute: () => router.push(orderFeature.route),
    },
    deliveryMemo: {
      id: "deliveryMemos.create",
      title: "New Delivery Memo",
      category: "Transactions",
      description: "Open the delivery memo draft and posting workflow.",
      when: "permission.dmCreate && feature.dmCreate && !dialog.open",
      execute: () => router.push(deliveryMemoFeature.route),
    },
    payment: {
      id: "payments.create",
      title: "Receive Payment",
      category: "Transactions",
      description: "Record a standalone or linked customer receipt.",
      when: "permission.paymentCreate && feature.paymentCreate && !dialog.open",
      execute: () => router.push(paymentFeature.route),
    },
    stockEntry: {
      id: "inventory.stockEntry.create",
      title: "Stock Entry",
      category: "Inventory",
      description: "Post owner stock adjustments or submit staff stock-entry approval requests.",
      when: "permission.stockCreateMovement && feature.stockEntry && !dialog.open",
      execute: () => router.push(stockEntryFeature.route),
    },
    stockTransfer: {
      id: "inventory.stockTransfer.create",
      title: "Stock Transfer",
      category: "Inventory",
      description: "Transfer available inventory between accessible shops.",
      when: "permission.stockCreateMovement && feature.stockTransfer && !dialog.open",
      execute: () => router.push(stockTransferFeature.route),
    },
    physicalStock: {
      id: "inventory.physicalStock.count",
      title: "Physical Stock Count",
      category: "Inventory",
      description: "Count actual on-hand stock and reconcile only the variance.",
      when: "permission.stockCreateMovement && feature.physicalStock && !dialog.open",
      execute: () => router.push(physicalStockFeature.route),
    },
    dismiss: {
      id: "overlay.dismiss",
      title: "Close Overlay",
      category: "Context",
      when: SHELL_OVERLAY_WHEN,
      execute: () => {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
        else if (dateDialogOpen) setDateDialogOpen(false);
        else if (shopDialogOpen) setShopDialogOpen(false);
      },
    },
  }), [commandPaletteOpen, dateDialogOpen, deliveryMemoFeature.route, orderFeature.route, paymentFeature.route, physicalStockFeature.route, router, saleFeature.route, shopDialogOpen, stockEntryFeature.route, stockTransferFeature.route, unwind]);

  useCommand(commands.goTo);
  useCommand(commands.unwind);
  useCommand(commands.period);
  useCommand(commands.shop);
  useCommand(commands.sale);
  useCommand(commands.order);
  useCommand(commands.deliveryMemo);
  useCommand(commands.payment);
  useCommand(commands.stockEntry);
  useCommand(commands.stockTransfer);
  useCommand(commands.physicalStock);
  useCommand(commands.dismiss);

  useKeybinding(useMemo(() => ({ id: "app-alt-g", key: "alt+g", command: "navigation.goTo", when: "!dialog.open", priority: 10 }), []));
  useKeybinding(useMemo(() => ({ id: "app-report-unwind", key: "esc", command: "navigation.unwind", when: "navigation.canUnwind && report.focused && !dialog.open && !input.editable", priority: 25 }), []));
  useKeybinding(useMemo(() => ({ id: "app-f2", key: "f2", command: "report.changePeriod", when: "!dialog.open", priority: 1 }), []));
  useKeybinding(useMemo(() => ({ id: "app-f3", key: "f3", command: "shop.switch", when: "!dialog.open", priority: 1 }), []));
  useKeybinding(useMemo(() => ({ id: "app-f8", key: saleFeature.shortcut || "f8", command: "sales.create", when: "!dialog.open", priority: 1 }), [saleFeature.shortcut]));
  useKeybinding(useMemo(() => ({ id: "app-ctrl-f8", key: orderFeature.shortcut || "ctrl+f8", command: "orders.create", when: "!dialog.open", priority: 1 }), [orderFeature.shortcut]));
  useKeybinding(useMemo(() => ({ id: "app-alt-f8", key: deliveryMemoFeature.shortcut || "alt+f8", command: "deliveryMemos.create", when: "!dialog.open", priority: 1 }), [deliveryMemoFeature.shortcut]));
  useKeybinding(useMemo(() => ({ id: "app-f6", key: paymentFeature.shortcut || "f6", command: "payments.create", when: "!dialog.open", priority: 1 }), [paymentFeature.shortcut]));
  useKeybinding(useMemo(() => ({ id: "app-f9", key: stockEntryFeature.shortcut || "f9", command: "inventory.stockEntry.create", when: "!dialog.open", priority: 1 }), [stockEntryFeature.shortcut]));
  useKeybinding(useMemo(() => ({ id: "app-alt-f9", key: stockTransferFeature.shortcut || "alt+f9", command: "inventory.stockTransfer.create", when: "!dialog.open", priority: 1 }), [stockTransferFeature.shortcut]));
  useKeybinding(useMemo(() => ({ id: "app-ctrl-f7", key: physicalStockFeature.shortcut || "ctrl+f7", command: "inventory.physicalStock.count", when: "!dialog.open", priority: 1 }), [physicalStockFeature.shortcut]));
  useKeybinding(useMemo(() => ({ id: "overlay-esc", key: "esc", command: "overlay.dismiss", when: SHELL_OVERLAY_WHEN, priority: 100 }), []));

  return <div className="flex h-dvh min-h-0 w-screen min-w-0 flex-col overflow-hidden bg-background text-foreground">
    <Header onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden"><Sidebar /><main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingInline: "var(--workspace-gutter-x)", paddingBlock: "var(--workspace-gutter-y)" }}>{children}</main><RightActionRail /></div>
    <StatusBar />
    <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    <DatePeriodDialog open={dateDialogOpen} onOpenChange={setDateDialogOpen} />
    <ShopSwitcherDialog open={shopDialogOpen} onOpenChange={setShopDialogOpen} />
    <KeyboardInspector />
  </div>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, token, activeShopId, logout } = useAuthStore();
  const authResolved = useSyncExternalStore(subscribeAuthHydration, getAuthHydrationSnapshot, () => false);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 300_000, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: 1 }, mutations: { retry: 0 } } }));

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      queryClient.clear();
      disconnectRealtimeSocket();
      contextKeyService.reset();
      activePointerStore.reset();
      drilldownStack.clear();
      router.push("/login");
    });
  }, [logout, queryClient, router]);

  useEffect(() => {
    if (authResolved && (!isAuthenticated || !token)) router.replace("/login");
  }, [authResolved, isAuthenticated, token, router]);

  useEffect(() => {
    if (isAuthenticated && token) return initRealtimeSocket(queryClient, activeShopId);
  }, [queryClient, activeShopId, isAuthenticated, token]);

  if (!authResolved || !isAuthenticated || !token) return <div className="flex h-dvh w-screen items-center justify-center bg-background text-xs text-muted-foreground">Verifying session authorization…</div>;
  return <QueryClientProvider client={queryClient}><TooltipProvider><KeyboardRuntimeProvider><DashboardShellContent>{children}</DashboardShellContent></KeyboardRuntimeProvider></TooltipProvider></QueryClientProvider>;
}
