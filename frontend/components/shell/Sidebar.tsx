"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Receipt,
  ShoppingBag,
  Truck,
  CreditCard,
  Warehouse,
  Users,
  ReceiptIndianRupee,
  BarChart3,
  MessageSquare,
  Shield,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.SHOP_VIEW },
    { label: "Sales", href: "/sales", icon: Receipt, permission: PERMISSIONS.SALE_VIEW_OWN },
    { label: "Orders", href: "/orders", icon: ShoppingBag, permission: PERMISSIONS.ORDER_VIEW_ASSIGNED },
    { label: "Delivery Memos", href: "/delivery-memos", icon: Truck, permission: PERMISSIONS.DM_VIEW_OWN },
    { label: "Payments", href: "/payments", icon: CreditCard, permission: PERMISSIONS.PAYMENT_VIEW_OWN },
    { label: "Inventory", href: "/inventory", icon: Warehouse, permission: PERMISSIONS.ITEM_VIEW },
    { label: "Customers", href: "/customers", icon: Users, permission: PERMISSIONS.CUSTOMER_VIEW },
    { label: "Expenses", href: "/expenses", icon: ReceiptIndianRupee, permission: PERMISSIONS.EXPENSE_VIEW },
    { label: "Reports", href: "/reports", icon: BarChart3, permission: PERMISSIONS.DAILY_SUMMARY_VIEW },
    { label: "WhatsApp", href: "/whatsapp", icon: MessageSquare, permission: PERMISSIONS.NOTIFICATION_VIEW },
    { label: "Administration", href: "/administration", icon: Shield, permission: PERMISSIONS.SHOP_UPDATE },
  ];

  const permittedItems = navItems.filter((item) => hasPermission(user, item.permission));

  return (
    <aside className="w-56 border-r bg-card flex flex-col shrink-0 h-[calc(100vh-3.5rem)] sticky top-14">
      <div className="p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Navigation
      </div>
      <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
        {permittedItems.map((item) => {
          const IconComp = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-slate-700 hover:bg-muted dark:text-slate-300"
              )}
            >
              <IconComp className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
