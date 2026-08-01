"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/auth/auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Store, Search, Bell, Shield, LogOut, Wifi, User } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";

interface HeaderProps {
  onOpenCommandPalette: () => void;
  approvalsCount?: number;
}

export function Header({ onOpenCommandPalette, approvalsCount = 0 }: HeaderProps) {
  const { user, shops, activeShopId, setActiveShopId, logout, startDate, endDate } = useAuthStore();
  const { isMac } = useOS();

  const selectedShop = shops.find((s) => s.id === activeShopId);
  const canSwitchShop = user?.role === "OWNER" && shops.length > 1;

  const displayPeriod =
    startDate === endDate
      ? formatDate(startDate)
      : `${formatDate(startDate)} – ${formatDate(endDate)}`;

  const initials = user?.name
    ? user.name
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    : "SC";

  return (
    <header className="h-14 border-b bg-card px-4 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Left: Active Shop & Date Period */}
      <div className="flex items-center gap-3">
        {canSwitchShop ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 h-9 px-3 text-xs font-semibold rounded-md border border-input bg-background hover:bg-muted text-primary cursor-pointer">
              <Store className="h-4 w-4" />
              <span>{selectedShop?.name ?? "Select Shop"}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Select Active Shop</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {shops.map((shop) => (
                <DropdownMenuItem
                  key={shop.id}
                  onClick={() => setActiveShopId(shop.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>{shop.name} ({shop.city})</span>
                  {shop.id === activeShopId && <Badge variant="secondary" className="text-[10px]">Active</Badge>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Store className="h-4 w-4 text-primary" />
            <span>{selectedShop?.name ?? "Shop Control"}</span>
          </div>
        )}

        <Badge variant="outline" className="hidden sm:inline-flex text-xs font-medium text-muted-foreground">
          Period: {displayPeriod}
        </Badge>
      </div>

      {/* Center: Global Search trigger */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <Button
          variant="outline"
          onClick={onOpenCommandPalette}
          className="w-full justify-between h-9 text-xs text-muted-foreground font-normal bg-muted/40 hover:bg-muted"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" />
            <span>Search pages, actions, customers...</span>
          </span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
            {formatShortcutForOS("alt+g", isMac)}
          </kbd>
        </Button>
      </div>

      {/* Right: Actions, Badges & Profile */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onOpenCommandPalette} className="md:hidden h-9 w-9">
          <Search className="h-4 w-4" />
        </Button>

        <div className="relative">
          <Button variant="ghost" size="icon" className="h-9 w-9 relative">
            <Bell className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            {approvalsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-extrabold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center">
                {approvalsCount > 99 ? "99+" : approvalsCount}
              </span>
            )}
          </Button>
        </div>

        <Badge variant="outline" className="gap-1 text-[11px] text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40">
          <Wifi className="h-3 w-3 text-emerald-500" />
          <span>Online</span>
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger className="relative h-9 w-9 rounded-full cursor-pointer">
            <Avatar className="h-9 w-9 border border-primary/20">
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.mobile}</p>
                <div className="pt-1">
                  <Badge variant={user?.role === "OWNER" ? "default" : "secondary"} className="text-[10px]">
                    {user?.role}
                  </Badge>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <Link href="/profile" className="flex items-center w-full">
                <User className="mr-2 h-4 w-4" />
                <span>My Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
