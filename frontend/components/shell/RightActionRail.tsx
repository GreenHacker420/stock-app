"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { Receipt, Truck, ShoppingBag, CreditCard, Warehouse, Calendar, Store } from "lucide-react";

interface RightActionRailProps {
  onOpenDateDialog?: () => void;
  onOpenShopDialog?: () => void;
}

export function RightActionRail({ onOpenDateDialog, onOpenShopDialog }: RightActionRailProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { isMac } = useOS();

  const actions = [
    { label: "New Sale", shortcut: "F8", action: () => router.push("/sales/new"), icon: Receipt, variant: "default" as const, permission: PERMISSIONS.SALE_CREATE },
    { label: "Delivery Memo", shortcut: "Alt+F8", action: () => router.push("/delivery-memos/new"), icon: Truck, variant: "outline" as const, permission: PERMISSIONS.DM_CREATE },
    { label: "New Order", shortcut: "Ctrl+F8", action: () => router.push("/orders/new"), icon: ShoppingBag, variant: "outline" as const, permission: PERMISSIONS.ORDER_CREATE },
    { label: "Receive Payment", shortcut: "F6", action: () => router.push("/payments/new"), icon: CreditCard, variant: "outline" as const, permission: PERMISSIONS.PAYMENT_CREATE },
    { label: "Stock Entry", shortcut: "F9", action: () => router.push("/inventory/stock-entry"), icon: Warehouse, variant: "outline" as const, permission: PERMISSIONS.STOCK_CREATE_MOVEMENT },
    { label: "Select Date", shortcut: "F2", action: () => onOpenDateDialog && onOpenDateDialog(), icon: Calendar, variant: "ghost" as const },
    { label: "Switch Shop", shortcut: "F3", action: () => onOpenShopDialog && onOpenShopDialog(), icon: Store, variant: "ghost" as const },
  ];

  const permittedActions = actions.filter((act) => !act.permission || hasPermission(user, act.permission));

  return (
    <aside className="w-52 border-l bg-card flex flex-col shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 hidden lg:flex p-3 space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        Quick Actions
      </div>
      <div className="space-y-1.5 flex-1">
        {permittedActions.map((act) => {
          const IconComp = act.icon;
          return (
            <Button
              key={act.label}
              variant={act.variant}
              size="sm"
              onClick={act.action}
              className="w-full justify-between h-9 text-xs font-medium cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <IconComp className="h-3.5 w-3.5" />
                <span>{act.label}</span>
              </span>
              <kbd className="pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted/60 px-1 font-mono text-[9px] font-extrabold text-muted-foreground">
                {formatShortcutForOS(act.shortcut, isMac)}
              </kbd>
            </Button>
          );
        })}
      </div>
    </aside>
  );
}
