"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";
import { useShortcut } from "@/components/keyboard/ShortcutProvider";
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

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen}>
      <CommandInput placeholder={`Search pages, actions or switch shop... (${formatShortcutForOS("alt+g", isMac)})`} aria-keyshortcuts="Alt+G" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
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
