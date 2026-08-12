"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission } from "@/lib/permissions/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, CalendarDays, LogOut, Menu, Search, Store, User } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";
import { NAVIGATION_GROUPS } from "@/components/shell/navigation";

interface HeaderProps {
  onOpenCommandPalette: () => void;
  approvalsCount?: number;
}

export function Header({ onOpenCommandPalette, approvalsCount = 0 }: HeaderProps) {
  const pathname = usePathname();
  const { user, shops, activeShopId, setActiveShopId, logout, startDate, endDate } = useAuthStore();
  const { isMac } = useOS();

  const selectedShop = shops.find((shop) => shop.id === activeShopId);
  const canSwitchShop = user?.role === "OWNER" && shops.length > 1;
  const displayPeriod = startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(endDate)}`;

  const initials = user?.name
    ? user.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "SC";

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:px-4">
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden">
          <Menu className="size-4" />
          <span className="sr-only">Open navigation</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Navigate</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {NAVIGATION_GROUPS.map((group) => {
            const items = group.items.filter((item) => hasPermission(user, item.permission));
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.label}
                </div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <DropdownMenuItem key={item.href} className={active ? "bg-muted font-medium" : undefined}>
                      <Link href={item.href} className="flex w-full items-center gap-2.5">
                        <Icon className="size-4 text-muted-foreground" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex min-w-0 items-center gap-2">
        {canSwitchShop ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 max-w-[180px] items-center gap-2 rounded-lg border bg-card px-2.5 text-xs font-semibold shadow-xs transition-colors hover:bg-muted sm:max-w-[240px]">
              <Store className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{selectedShop?.name ?? "Select shop"}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Active shop</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {shops.map((shop) => (
                <DropdownMenuItem
                  key={shop.id}
                  onClick={() => setActiveShopId(shop.id)}
                  className="flex cursor-pointer items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate">
                    {shop.name}
                    {shop.city ? <span className="ml-1 text-muted-foreground">· {shop.city}</span> : null}
                  </span>
                  {shop.id === activeShopId ? <Badge variant="secondary" className="text-[9px]">Active</Badge> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="inline-flex h-9 max-w-[180px] items-center gap-2 rounded-lg border bg-card px-2.5 text-xs font-semibold shadow-xs sm:max-w-[240px]">
            <Store className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{selectedShop?.name ?? "Shop Control"}</span>
          </div>
        )}

        <div className="hidden h-9 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-[11px] font-medium text-muted-foreground lg:flex">
          <CalendarDays className="size-3.5" />
          <span>{displayPeriod}</span>
        </div>
      </div>

      <div className="mx-auto hidden w-full max-w-xl md:block">
        <Button
          variant="outline"
          onClick={onOpenCommandPalette}
          className="h-9 w-full justify-between rounded-lg bg-muted/35 px-3 text-xs font-normal text-muted-foreground shadow-none hover:bg-muted/70 hover:text-foreground"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Search className="size-3.5 shrink-0" />
            <span className="truncate">Search pages, actions, customers, products…</span>
          </span>
          <kbd className="ml-3 inline-flex h-5 shrink-0 items-center rounded border bg-background px-1.5 font-mono text-[9px] font-semibold text-muted-foreground">
            {formatShortcutForOS("alt+g", isMac)}
          </kbd>
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:ml-0">
        <Button variant="ghost" size="icon" onClick={onOpenCommandPalette} className="size-9 md:hidden">
          <Search className="size-4" />
          <span className="sr-only">Open global search</span>
        </Button>

        <Button variant="ghost" size="icon" className="relative size-9 text-muted-foreground hover:text-foreground">
          <Bell className="size-4" />
          {approvalsCount > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-white">
              {approvalsCount > 99 ? "99+" : approvalsCount}
            </span>
          ) : null}
          <span className="sr-only">Notifications</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="relative size-9 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Avatar className="size-9 border shadow-xs">
              <AvatarFallback className="bg-foreground text-[11px] font-semibold text-background">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="space-y-1">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.mobile}</p>
                <Badge variant="secondary" className="mt-1 text-[9px]">{user?.role}</Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href="/profile" className="flex w-full items-center">
                <User className="mr-2 size-4" />
                My Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive">
              <LogOut className="mr-2 size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
