"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatShortcutLabel } from "@/lib/keyboard/shortcut-engine";
import { Receipt, Truck, ShoppingBag, CreditCard, Warehouse, Calendar, Store } from "lucide-react";

export function RightActionRail() {
  const router = useRouter();

  const actions = [
    { label: "New Sale", shortcut: "F8", href: "/sales/new", icon: Receipt, variant: "default" as const },
    { label: "Delivery Memo", shortcut: "Alt+F8", href: "/delivery-memos/new", icon: Truck, variant: "outline" as const },
    { label: "New Order", shortcut: "Ctrl+F8", href: "/orders/new", icon: ShoppingBag, variant: "outline" as const },
    { label: "Receive Payment", shortcut: "F6", href: "/payments/new", icon: CreditCard, variant: "outline" as const },
    { label: "Stock Entry", shortcut: "F9", href: "/inventory/stock-entry", icon: Warehouse, variant: "outline" as const },
    { label: "Select Date", shortcut: "F2", href: "#", icon: Calendar, variant: "ghost" as const },
    { label: "Switch Shop", shortcut: "F3", href: "#", icon: Store, variant: "ghost" as const },
  ];

  return (
    <aside className="w-52 border-l bg-card flex flex-col shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 hidden lg:flex p-3 space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        Quick Actions
      </div>
      <div className="space-y-1.5 flex-1">
        {actions.map((act) => {
          const IconComp = act.icon;
          return (
            <Button
              key={act.label}
              variant={act.variant}
              size="sm"
              onClick={() => act.href !== "#" && router.push(act.href)}
              className="w-full justify-between h-9 text-xs font-medium"
            >
              <span className="flex items-center gap-2">
                <IconComp className="h-3.5 w-3.5" />
                <span>{act.label}</span>
              </span>
              <kbd className="pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted/60 px-1 font-mono text-[9px] font-extrabold text-muted-foreground">
                {formatShortcutLabel(act.shortcut)}
              </kbd>
            </Button>
          );
        })}
      </div>
    </aside>
  );
}
