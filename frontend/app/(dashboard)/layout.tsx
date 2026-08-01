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
import { initRealtimeSocket } from "@/lib/realtime/socket-client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [shopDialogOpen, setShopDialogOpen] = useState(false);

  const activeShopId = useAuthStore((state) => state.activeShopId);

  useEffect(() => {
    const cleanup = initRealtimeSocket(queryClient, activeShopId);
    return () => cleanup();
  }, [queryClient, activeShopId]);

  // Full Keyboard bindings engine supporting both macOS (⌘ / ⌥) and Windows (Ctrl / Alt)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const isAltOrOption = e.altKey;
      const key = e.key.toLowerCase();

      // Alt+G / ⌥G / ⌘G -> Go To Command Palette
      if ((key === "g") && (isAltOrOption || isCmdOrCtrl)) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // F2 -> Select Date / Period Dialog
      if (e.key === "F2" || (key === "2" && isCmdOrCtrl)) {
        e.preventDefault();
        setDateDialogOpen((prev) => !prev);
        return;
      }

      // F3 -> Switch Shop Dialog
      if (e.key === "F3" || (key === "3" && isCmdOrCtrl)) {
        e.preventDefault();
        setShopDialogOpen((prev) => !prev);
        return;
      }

      // Esc -> Dismiss Dialogs or Navigate Back
      if (e.key === "Escape") {
        if (commandPaletteOpen) {
          e.preventDefault();
          setCommandPaletteOpen(false);
        } else if (dateDialogOpen) {
          e.preventDefault();
          setDateDialogOpen(false);
        } else if (shopDialogOpen) {
          e.preventDefault();
          setShopDialogOpen(false);
        } else {
          router.back();
        }
        return;
      }

      // F8 / ⌘8 / Ctrl+8 -> New Sale
      if ((e.key === "F8" && !isAltOrOption && !isCmdOrCtrl) || (key === "8" && isCmdOrCtrl && !isAltOrOption)) {
        e.preventDefault();
        router.push("/sales/new");
        return;
      }

      // Alt+F8 / ⌥F8 -> New Delivery Memo
      if (e.key === "F8" && isAltOrOption) {
        e.preventDefault();
        router.push("/delivery-memos/new");
        return;
      }

      // Ctrl+F8 / ⌘F8 -> New Order Booking
      if (e.key === "F8" && isCmdOrCtrl) {
        e.preventDefault();
        router.push("/orders/new");
        return;
      }

      // F6 / ⌘6 -> Receive Payment
      if (e.key === "F6" || (key === "6" && isCmdOrCtrl)) {
        e.preventDefault();
        router.push("/payments/new");
        return;
      }

      // F9 / ⌘9 -> Stock Inward Entry
      if ((e.key === "F9" && !isAltOrOption) || (key === "9" && isCmdOrCtrl && !isAltOrOption)) {
        e.preventDefault();
        router.push("/inventory/stock-entry");
        return;
      }

      // Alt+F9 / ⌥F9 -> Inter-Shop Stock Transfer
      if (e.key === "F9" && isAltOrOption) {
        e.preventDefault();
        router.push("/inventory/stock-transfer");
        return;
      }

      // Ctrl+F7 / ⌘F7 -> Physical Stock Audit Count
      if (e.key === "F7" && isCmdOrCtrl) {
        e.preventDefault();
        router.push("/inventory/physical-stock");
        return;
      }

      // F12 / ⌘, -> Administration & Settings
      if (e.key === "F12" || (key === "," && isCmdOrCtrl)) {
        e.preventDefault();
        router.push("/administration");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, commandPaletteOpen, dateDialogOpen, shopDialogOpen]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
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
      </TooltipProvider>
    </QueryClientProvider>
  );
}
