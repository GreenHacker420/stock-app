"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes } from "lucide-react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";
import { NAVIGATION_GROUPS } from "@/components/shell/navigation";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  return (
    <aside className="hidden h-full w-[220px] shrink-0 border-r border-sidebar-border/80 bg-sidebar md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border/70 px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <Boxes className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">Shop Control</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Operations</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {NAVIGATION_GROUPS.map((group) => {
          const permittedItems = group.items.filter((item) => hasPermission(user, item.permission));
          if (permittedItems.length === 0) return null;

          return (
            <div key={group.label} className="mb-4 last:mb-0">
              <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {permittedItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
                          isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="truncate">{item.label}</span>
                      {isActive && <span className="ml-auto size-1.5 rounded-full bg-foreground/70" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border/70 px-4 py-3 text-[10px] leading-4 text-muted-foreground">
        Keyboard-first workspace
        <br />
        <span className="font-mono text-foreground/70">Alt+G</span> opens Go To
      </div>
    </aside>
  );
}
