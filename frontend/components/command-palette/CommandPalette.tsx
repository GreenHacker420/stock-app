"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  Store,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import { useCommandSurface } from "@/components/keyboard/useCommandSurface";
import { FLAT_NAVIGATION_ITEMS } from "@/components/shell/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { commandExecutor } from "@/lib/commands/command-executor";
import { commandRegistry } from "@/lib/commands/command-registry";
import type { CommandDefinition } from "@/lib/commands/command-types";
import { contextKeyService } from "@/lib/context/context-key-service";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { drilldownStack } from "@/lib/navigation/drilldown-stack";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission } from "@/lib/permissions/permissions";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ open: externalOpen, onOpenChange: externalOnOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, shops, activeShopId, setActiveShopId } = useAuthStore();
  const { isMac } = useOS();
  const entries = useCommandSurface("palette");
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;

  const setOpen = useCallback((value: boolean) => {
    externalOnOpenChange?.(value);
    setInternalOpen(value);
  }, [externalOnOpenChange]);

  const currentUrl = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const navigate = useCallback((href: string) => {
    if (href === "/gateway") {
      drilldownStack.clear();
      activePointerStore.reset();
      setOpen(false);
      router.push(href);
      return;
    }

    if (href !== currentUrl) {
      drilldownStack.push({
        route: pathname,
        searchParams: searchParams.toString(),
        activePointer: activePointerStore.getPointer(),
        selectedIds: [...activePointerStore.getSelectedIds()],
        scrollOffset: typeof window === "undefined" ? 0 : window.scrollY,
      });
    }
    setOpen(false);
    router.push(href);
  }, [currentUrl, pathname, router, searchParams, setOpen]);

  const permittedNavigation = useMemo(
    () => FLAT_NAVIGATION_ITEMS.filter((item) => hasPermission(user, item.permission)),
    [user],
  );

  useEffect(() => {
    const disposers = permittedNavigation.map((item) => {
      const id = `navigation.${item.href.replace(/^\//, "").replaceAll("/", ".") || "home"}`;
      const definition: CommandDefinition = {
        id,
        title: item.label,
        category: "Navigation",
        description: `Open ${item.label}`,
        execute: () => navigate(item.href),
      };
      return commandRegistry.register(definition);
    });
    return () => disposers.forEach((dispose) => dispose());
  }, [navigate, permittedNavigation]);

  const navigationEntries = entries.filter((entry) => entry.category === "Navigation" && entry.id !== "navigation.goTo" && entry.id !== "navigation.unwind");
  const commandEntries = entries.filter((entry) => entry.category && entry.category !== "Navigation" && entry.id !== "overlay.dismiss");
  const navMetadata = new Map(
    permittedNavigation.map((item) => [
      `navigation.${item.href.replace(/^\//, "").replaceAll("/", ".") || "home"}`,
      item,
    ])
  );

  const execute = (commandId: string) => {
    setOpen(false);
    void commandExecutor.execute(commandId, { source: "palette", context: contextKeyService.snapshot() });
  };

  const shortcutHint = isMac ? "⌥G" : "Alt+G";

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen}>
      <CommandInput placeholder={`Type a command or search pages... (${shortcutHint})`} aria-keyshortcuts="Alt+G" />
      <CommandList>
        <CommandEmpty>No results matching your query.</CommandEmpty>

        {commandEntries.length ? (
          <CommandGroup heading="Actions & Shortcuts">
            {commandEntries.map((entry) => (
              <CommandItem
                key={entry.id}
                value={`command ${entry.title}`}
                onSelect={() => execute(entry.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Receipt className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{entry.title}</span>
                </div>
                {entry.key ? (
                  <kbd className="ml-3 inline-flex h-5 shrink-0 items-center rounded-md border border-border/70 bg-muted/70 px-1.5 font-mono text-[10px] font-bold text-muted-foreground shadow-2xs">
                    {formatShortcutForOS(entry.key, isMac)}
                  </kbd>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {commandEntries.length && navigationEntries.length ? <CommandSeparator /> : null}

        {navigationEntries.length ? (
          <CommandGroup heading="Navigation">
            {navigationEntries.map((entry) => {
              const metadata = navMetadata.get(entry.id);
              const Icon = metadata?.icon ?? LayoutDashboard;
              return (
                <CommandItem
                  key={entry.id}
                  value={`page ${entry.title}`}
                  onSelect={() => execute(entry.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Icon className="size-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{entry.title}</span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {user?.role === "OWNER" && shops.length > 1 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch Shop">
              {shops.map((shop) => (
                <CommandItem
                  key={shop.id}
                  value={`shop ${shop.name} ${shop.city}`}
                  onSelect={() => {
                    setActiveShopId(shop.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Store className="size-4 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {shop.name} {shop.city ? <span className="text-muted-foreground text-xs">· {shop.city}</span> : null}
                    </span>
                  </div>
                  {shop.id === activeShopId ? (
                    <Badge variant="secondary" className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400">
                      Active
                    </Badge>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>

      <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground/80 font-medium">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="inline-flex h-4.5 w-4.5 items-center justify-center rounded border bg-background text-[9px] font-semibold"><ArrowUp className="size-2.5" /></kbd>
            <kbd className="inline-flex h-4.5 w-4.5 items-center justify-center rounded border bg-background text-[9px] font-semibold"><ArrowDown className="size-2.5" /></kbd>
            <span className="ml-0.5">Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="inline-flex h-4.5 items-center justify-center rounded border bg-background px-1 text-[9px] font-semibold"><CornerDownLeft className="size-2.5" /></kbd>
            <span className="ml-0.5">Select</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <kbd className="inline-flex h-4.5 items-center justify-center rounded border bg-background px-1 text-[9px] font-semibold">ESC</kbd>
          <span className="ml-0.5">Close</span>
        </div>
      </div>
    </CommandDialog>
  );
}
