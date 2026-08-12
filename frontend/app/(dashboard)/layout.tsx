"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { RightActionRail } from "@/components/shell/RightActionRail";
import { StatusBar } from "@/components/shell/StatusBar";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { DatePeriodDialog } from "@/components/shell/DatePeriodDialog";
import { ShopSwitcherDialog } from "@/components/shell/ShopSwitcherDialog";
import { initRealtimeSocket, disconnectRealtimeSocket } from "@/lib/realtime/socket-client";
import { setUnauthorizedHandler } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission } from "@/lib/permissions/permissions";
import { getFeature, isShortcutRegistrable } from "@/lib/features/feature-availability";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortcutProvider, useShortcut } from "@/components/keyboard/ShortcutProvider";

function DashboardShellContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [shopDialogOpen, setShopDialogOpen] = useState(false);

  const saleFeature = getFeature("SALE_CREATE");
  const dmFeature = getFeature("DM_CREATE");
  const orderFeature = getFeature("ORDER_CREATE");
  const paymentFeature = getFeature("PAYMENT_CREATE");
  const stockEntryFeature = getFeature("STOCK_ENTRY");

  useShortcut({
    id: "global-f2-date",
    key: "f2",
    scope: "GLOBAL",
    description: "Open Select Date / Period Dialog",
    action: () => setDateDialogOpen((previous) => !previous),
  });

  useShortcut({
    id: "global-f3-shop",
    key: "f3",
    scope: "GLOBAL",
    description: "Open Switch Shop Dialog",
    action: () => setShopDialogOpen((previous) => !previous),
  });

  useShortcut({
    id: "global-f8-new-sale",
    key: saleFeature.shortcut || "f8",
    scope: "GLOBAL",
    description: "Navigate to New Sale",
    disabled: !isShortcutRegistrable(saleFeature) || !hasPermission(user, saleFeature.requiredPermission),
    action: () => router.push(saleFeature.route),
  });

  useShortcut({
    id: "global-alt-f8-new-dm",
    key: dmFeature.shortcut || "alt+f8",
    scope: "GLOBAL",
    description: "Navigate to New Delivery Memo",
    disabled: !isShortcutRegistrable(dmFeature) || !hasPermission(user, dmFeature.requiredPermission),
    action: () => router.push(dmFeature.route),
  });

  useShortcut({
    id: "global-ctrl-f8-new-order",
    key: orderFeature.shortcut || "ctrl+f8",
    scope: "GLOBAL",
    description: "Navigate to New Order",
    disabled: !isShortcutRegistrable(orderFeature) || !hasPermission(user, orderFeature.requiredPermission),
    action: () => router.push(orderFeature.route),
  });

  useShortcut({
    id: "global-f6-payment",
    key: paymentFeature.shortcut || "f6",
    scope: "GLOBAL",
    description: "Navigate to Receive Payment",
    disabled: !isShortcutRegistrable(paymentFeature) || !hasPermission(user, paymentFeature.requiredPermission),
    action: () => router.push(paymentFeature.route),
  });

  useShortcut({
    id: "global-f9-stock-entry",
    key: stockEntryFeature.shortcut || "f9",
    scope: "GLOBAL",
    description: "Navigate to Stock Entry",
    disabled: !isShortcutRegistrable(stockEntryFeature) || !hasPermission(user, stockEntryFeature.requiredPermission),
    action: () => router.push(stockEntryFeature.route),
  });

  useShortcut({
    id: "global-escape-handler",
    key: "esc",
    scope: "GLOBAL",
    description: "Close active interactive layer",
    preventInInput: false,
    action: () => {
      if (commandPaletteOpen) setCommandPaletteOpen(false);
      else if (dateDialogOpen) setDateDialogOpen(false);
      else if (shopDialogOpen) setShopDialogOpen(false);
    },
  });

  return (
    <div className="flex h-dvh min-h-0 w-screen min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <Header onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Sidebar />
        <main
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent)_35%,transparent),transparent_36%),linear-gradient(to_bottom,var(--background),color-mix(in_srgb,var(--muted)_28%,var(--background)))]"
          style={{
            paddingInline: "var(--workspace-gutter-x)",
            paddingBlock: "var(--workspace-gutter-y)",
          }}
        >
          {children}
        </main>
        <RightActionRail
          onOpenDateDialog={() => setDateDialogOpen(true)}
          onOpenShopDialog={() => setShopDialogOpen(true)}
        />
      </div>
      <StatusBar />
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
      <DatePeriodDialog open={dateDialogOpen} onOpenChange={setDateDialogOpen} />
      <ShopSwitcherDialog open={shopDialogOpen} onOpenChange={setShopDialogOpen} />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, token, activeShopId, logout } = useAuthStore();
  const [authResolved, setAuthResolved] = useState(false);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      queryClient.clear();
      disconnectRealtimeSocket();
      router.push("/login");
    });
  }, [logout, queryClient, router]);

  useEffect(() => {
    setAuthResolved(true);
    if (!isAuthenticated || !token) router.push("/login");
  }, [isAuthenticated, token, router]);

  useEffect(() => {
    if (isAuthenticated && token) {
      const cleanup = initRealtimeSocket(queryClient, activeShopId);
      return () => cleanup();
    }
  }, [queryClient, activeShopId, isAuthenticated, token]);

  if (!authResolved || !isAuthenticated || !token) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-background text-xs text-muted-foreground">
        Verifying session authorization…
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ShortcutProvider>
          <DashboardShellContent>{children}</DashboardShellContent>
        </ShortcutProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
