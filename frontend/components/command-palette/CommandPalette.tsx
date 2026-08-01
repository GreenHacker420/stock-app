"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";
import { useShortcut } from "@/components/keyboard/ShortcutProvider";
import { getActionableFeatures } from "@/lib/features/feature-availability";
import { LayoutDashboard, Receipt, ShoppingBag, Truck, CreditCard, Warehouse, Users, ReceiptIndianRupee, BarChart3, MessageSquare, Shield, Store } from "lucide-react";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ open: externalOpen, onOpenChange: externalOnOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const router = useRouter();
  const { user, shops, activeShopId, setActiveShopId } = useAuthStore();
  const { isMac } = useOS();

  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (externalOnOpenChange) externalOnOpenChange(val);
    setInternalOpen(val);
  };

  // Register Alt+G command palette shortcut cleanly with shortcut engine
  useShortcut({
    id: "command-palette-alt-g",
    key: "alt+g",
    scope: "GLOBAL",
    description: "Open Go To Command Palette",
    action: () => setOpen(!isOpen),
  });

  const handleNavigate = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  const navItems = [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.SHOP_VIEW },
    { title: "Sales Register", href: "/sales", icon: Receipt, permission: PERMISSIONS.SALE_VIEW_OWN },
    { title: "Orders", href: "/orders", icon: ShoppingBag, permission: PERMISSIONS.ORDER_VIEW_ASSIGNED },
    { title: "Delivery Memos", href: "/delivery-memos", icon: Truck, permission: PERMISSIONS.DM_VIEW_OWN },
    { title: "Payments & Receipts", href: "/payments", icon: CreditCard, permission: PERMISSIONS.PAYMENT_VIEW_OWN },
    { title: "Inventory & Products", href: "/inventory", icon: Warehouse, permission: PERMISSIONS.ITEM_VIEW },
    { title: "Customers & Ledgers", href: "/customers", icon: Users, permission: PERMISSIONS.CUSTOMER_VIEW },
    { title: "Shop Expenses", href: "/expenses", icon: ReceiptIndianRupee, permission: PERMISSIONS.EXPENSE_VIEW },
    { title: "Reports & Analytics", href: "/reports", icon: BarChart3, permission: PERMISSIONS.DAILY_SUMMARY_VIEW },
    { title: "WhatsApp Messages", href: "/whatsapp", icon: MessageSquare, permission: PERMISSIONS.NOTIFICATION_VIEW },
    { title: "Administration", href: "/administration", icon: Shield, permission: PERMISSIONS.SHOP_UPDATE },
  ];

  const permittedNav = navItems.filter((item) => hasPermission(user, item.permission));
  const actionableFeatures = getActionableFeatures();
  const permittedActions = actionableFeatures.filter(
    (f) => hasPermission(user, f.requiredPermission)
  );

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen}>
      <CommandInput placeholder={`Search pages, actions or switch shop... (${formatShortcutForOS("alt+g", isMac)})`} aria-keyshortcuts="Alt+G" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Actions — ENABLED and DISABLED shown, UNSUPPORTED hidden */}
        <CommandGroup heading="Quick Actions">
          {permittedActions.map((feature) => {
            const isEnabled = feature.status === "ENABLED";
            return (
              <CommandItem
                key={feature.id}
                disabled={!isEnabled}
                onSelect={() => {
                  if (!isEnabled) return; // DISABLED: must not navigate
                  setOpen(false);
                  router.push(feature.route);
                }}
                className={isEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"}
              >
                <span className="flex items-center gap-2 flex-1">
                  <Receipt className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{feature.label}</span>
                  {!isEnabled && (
                    <Badge variant="outline" className="text-[9px] ml-auto border-amber-300 text-amber-700 dark:text-amber-400">
                      Unavailable
                    </Badge>
                  )}
                  {feature.shortcut && isEnabled && (
                    <kbd className="ml-auto pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted/60 px-1 font-mono text-[9px] font-extrabold text-muted-foreground">
                      {formatShortcutForOS(feature.shortcut, isMac)}
                    </kbd>
                  )}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          {permittedNav.map((item) => {
            const IconComp = item.icon;
            return (
              <CommandItem key={item.href} onSelect={() => handleNavigate(item.href)} className="cursor-pointer">
                <IconComp className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{item.title}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {user?.role === "OWNER" && shops.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch Shop">
              {shops.map((shop) => (
                <CommandItem
                  key={shop.id}
                  onSelect={() => {
                    setActiveShopId(shop.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Store className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{shop.name} ({shop.city})</span>
                  {shop.id === activeShopId && (
                    <span className="ml-auto text-xs text-emerald-600 font-bold">Active</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
