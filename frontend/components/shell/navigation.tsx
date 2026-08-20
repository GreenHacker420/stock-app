import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  MessageSquare,
  PanelsTopLeft,
  Receipt,
  ReceiptIndianRupee,
  Shield,
  ShoppingBag,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import { PERMISSIONS } from "@/lib/permissions/permissions";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: string;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Gateway", href: "/gateway", icon: PanelsTopLeft, permission: PERMISSIONS.SHOP_VIEW },
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.SHOP_VIEW },
      { label: "Sales", href: "/sales", icon: Receipt, permission: PERMISSIONS.SALE_VIEW_OWN },
      { label: "Orders", href: "/orders", icon: ShoppingBag, permission: PERMISSIONS.ORDER_VIEW_ASSIGNED },
      { label: "Delivery Memos", href: "/delivery-memos", icon: Truck, permission: PERMISSIONS.DM_VIEW_OWN },
      { label: "Payments", href: "/payments", icon: CreditCard, permission: PERMISSIONS.PAYMENT_VIEW_OWN },
    ],
  },
  {
    label: "Records",
    items: [
      { label: "Inventory", href: "/inventory", icon: Warehouse, permission: PERMISSIONS.ITEM_VIEW },
      { label: "Customers", href: "/customers", icon: Users, permission: PERMISSIONS.CUSTOMER_VIEW },
      { label: "Expenses", href: "/expenses", icon: ReceiptIndianRupee, permission: PERMISSIONS.EXPENSE_VIEW },
    ],
  },
  {
    label: "Control",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3, permission: PERMISSIONS.DAILY_SUMMARY_VIEW },
      { label: "WhatsApp", href: "/whatsapp", icon: MessageSquare, permission: PERMISSIONS.NOTIFICATION_VIEW },
      { label: "Administration", href: "/administration", icon: Shield, permission: PERMISSIONS.SHOP_UPDATE },
    ],
  },
];

export const FLAT_NAVIGATION_ITEMS = NAVIGATION_GROUPS.flatMap((group) => group.items);
