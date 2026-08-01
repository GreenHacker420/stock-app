"use client";

import { useState, useEffect } from "react";
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
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortcutProvider, useShortcut } from "@/components/keyboard/ShortcutProvider";

function DashboardShellContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [shopDialogOpen, setShopDialogOpen] = useState(false);

  // Keyboard shortcut registrations
  useShortcut({
    id: "global-f2-date",
    key: "f2",
    scope: "GLOBAL",
    description: "Open Select Date / Period Dialog",
    action: () => setDateDialogOpen((prev) => !prev),
  });

  useShortcut({
    id: "global-f3-shop",
    key: "f3",
    scope: "GLOBAL",
    description: "Open Switch Shop Dialog",
    action: () => setShopDialogOpen((prev) => !prev),
  });

  useShortcut({
    id: "global-f8-new-sale",
    key: "f8",
    scope: "GLOBAL",
    description: "Navigate to New Sale",
    disabled: !hasPermission(user, PERMISSIONS.SALE_CREATE),
    action: () => router.push("/sales/new"),
  });

  useShortcut({
    id: "global-alt-f8-new-dm",
    key: "alt+f8",
    scope: "GLOBAL",
    description: "Navigate to New Delivery Memo",
    disabled: !hasPermission(user, PERMISSIONS.DM_CREATE),
    action: () => router.push("/delivery-memos/new"),
  });

  useShortcut({
    id: "global-ctrl-f8-new-order",
    key: "ctrl+f8",
    scope: "GLOBAL",
    description: "Navigate to New Order",
    disabled: !hasPermission(user, PERMISSIONS.ORDER_CREATE),
    action: () => router.push("/orders/new"),
  });

  useShortcut({
    id: "global-f6-payment",
    key: "f6",
    scope: "GLOBAL",
    description: "Navigate to Receive Payment",
    disabled: !hasPermission(user, PERMISSIONS.PAYMENT_CREATE),
    action: () => router.push("/payments/new"),
  });

  useShortcut({
    id: "global-f9-stock-entry",
    key: "f9",
    scope: "GLOBAL",
    description: "Navigate to Stock Entry",
    disabled: !hasPermission(user, PERMISSIONS.STOCK_CREATE_MOVEMENT),
    action: () => router.push("/inventory/stock-entry"),
  });

  // Escape key handler: closes active dialog top-layer only, never calls router.back()
  useShortcut({
    id: "global-escape-handler",
    key: "esc",
    scope: "GLOBAL",
    description: "Close active interactive layer",
    preventInInput: false,
    action: () => {
      if (commandPaletteOpen) {
        setCommandPaletteOpen(false);
      } else if (dateDialogOpen) {
        setDateDialogOpen(false);
      } else if (shopDialogOpen) {
        setShopDialogOpen(false);
      }
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 overflow-y-auto min-w-0">
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
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Register 401 Unauthorized handler
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      queryClient.clear();
      disconnectRealtimeSocket();
      router.push("/login");
    });
  }, [logout, queryClient, router]);

  // Auth Protection Guard
  useEffect(() => {
    setAuthResolved(true);
    if (!isAuthenticated || !token) {
      router.push("/login");
    }
  }, [isAuthenticated, token, router]);

  // Realtime Socket Initialization
  useEffect(() => {
    if (isAuthenticated && token) {
      const cleanup = initRealtimeSocket(queryClient, activeShopId);
      return () => cleanup();
    }
  }, [queryClient, activeShopId, isAuthenticated, token]);

  // Do not render protected content while auth status is unverified or user is unauthenticated
  if (!authResolved || !isAuthenticated || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-xs text-muted-foreground">
        Verifying session authorization...
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
