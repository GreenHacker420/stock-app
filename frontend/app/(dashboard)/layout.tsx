"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { RightActionRail } from "@/components/shell/RightActionRail";
import { StatusBar } from "@/components/shell/StatusBar";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
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
  const activeShopId = useAuthStore((state) => state.activeShopId);

  useEffect(() => {
    const cleanup = initRealtimeSocket(queryClient, activeShopId);
    return () => cleanup();
  }, [queryClient, activeShopId]);

  // Centralized keyboard shortcut bindings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in text input unless Esc or Function key
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");

      if (e.key === "F8" && !e.altKey && !e.ctrlKey) {
        e.preventDefault();
        router.push("/sales/new");
      } else if (e.key === "F8" && e.altKey) {
        e.preventDefault();
        router.push("/delivery-memos/new");
      } else if (e.key === "F8" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        router.push("/orders/new");
      } else if (e.key === "F6") {
        e.preventDefault();
        router.push("/payments/new");
      } else if (e.key === "F9") {
        e.preventDefault();
        router.push("/inventory/stock-entry");
      } else if ((e.key === "g" || e.key === "G") && (e.altKey || e.metaKey)) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        if (commandPaletteOpen) {
          e.preventDefault();
          setCommandPaletteOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, commandPaletteOpen]);

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
            <RightActionRail />
          </div>
          <StatusBar />
          <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
