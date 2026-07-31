"use client";

import { useState, useEffect } from "react";
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
