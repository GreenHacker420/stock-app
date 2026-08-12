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
    <aside className="hidden h-full w-[clamp(11.75rem,14.5vw,15.75rem)] shrink-0 border-r border-sidebar-border/80 bg-sidebar md:flex md:flex-col">
      <div className="flex shrink-0 items-center gap-[clamp(0.5rem,0.7vw,0.8rem)] border-b border-sidebar-border/70 px-[clamp(0.7rem,1vw,1rem)]" style={{ height: "var(--shell-header-height)" }}>
        <div className="flex size-[clamp(1.9rem,3.8vh,2.25rem)] shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <Boxes className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[clamp(0.72rem,0.8vw,0.9rem)] font-semibold tracking-tight">Shop Control</p>
          <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Operations</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-[clamp(0.45rem,0.65vw,0.7rem)] py-[clamp(0.55rem,1vh,0.9rem)]">
        {NAVIGATION_GROUPS.map((group) => {
          const permittedItems = group.items.filter((item) => hasPermission(user, item.permission));
          if (permittedItems.length === 0) return null;

          return (
            <div key={group.label} className="mb-[clamp(0.65rem,1.5vh,1rem)] last:mb-0">
              <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">{group.label}</div>
              <div className="space-y-[clamp(0.1rem,0.3vh,0.25rem)]">
                {permittedItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex h-[clamp(2.05rem,4.3vh,2.45rem)] items-center gap-[clamp(0.4rem,0.55vw,0.65rem)] rounded-lg px-[clamp(0.45rem,0.65vw,0.7rem)] text-[clamp(0.67rem,0.72vw,0.78rem)] font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <span className={cn("flex size-[clamp(1.35rem,2.8vh,1.6rem)] shrink-0 items-center justify-center rounded-md transition-colors", isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-muted-foreground group-hover:text-foreground")}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className="truncate">{item.label}</span>
                      {isActive ? <span className="ml-auto size-1.5 rounded-full bg-foreground/70" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border/70 px-[clamp(0.7rem,1vw,1rem)] py-[clamp(0.55rem,1vh,0.8rem)] text-[9px] leading-4 text-muted-foreground">
        Keyboard-first workspace · <span className="font-mono text-foreground/70">Alt+G</span> Go To
      </div>
    </aside>
  );
}
