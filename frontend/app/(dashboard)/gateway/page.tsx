"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Landmark, PanelsTopLeft } from "lucide-react";

import { NAVIGATION_GROUPS, type NavigationItem } from "@/components/shell/navigation";
import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/auth/auth-store";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { moveIndex } from "@/lib/focus/composite-navigation";
import { nearestSpatial } from "@/lib/focus/spatial-navigation";
import { drilldownStack } from "@/lib/navigation/drilldown-stack";
import { consumeNavigationRestoration, peekNavigationRestoration, restoreNavigationFrame } from "@/lib/navigation/navigation-restoration";
import { hasPermission } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

const ZONE_ID = "gateway.menu";

type GatewayEntry = NavigationItem & {
  id: string;
  group: string;
  description: string;
};

const OWNER_CONTROL = [
  { id: "gateway.approvals", label: "Approvals", href: "/approvals", icon: CheckCircle2, description: "Review pending operational approval requests." },
  { id: "gateway.corrections", label: "Corrections", href: "/corrections", icon: ClipboardCheck, description: "Review requested transaction corrections." },
  { id: "gateway.cashSessions", label: "Cash Sessions", href: "/cash-sessions", icon: Landmark, description: "Review cash drawer close and mismatch values." },
] as const;

function itemDescription(group: string, item: NavigationItem): string {
  if (item.href === "/dashboard") return "Operational metrics and exception queues.";
  if (item.href === "/sales") return "Sales register and sale drill-down.";
  if (item.href === "/orders") return "Assigned order lifecycle and dispatch records.";
  if (item.href === "/delivery-memos") return "Delivery memo register, invoicing and returns context.";
  if (item.href === "/payments") return "Receipts, verification and payment-linked records.";
  if (item.href === "/inventory") return "Physical, reserved and available stock views.";
  if (item.href === "/customers") return "Customer accounts, ledgers and outstanding context.";
  if (item.href === "/expenses") return "Shop expense register and owner verification.";
  if (item.href === "/reports") return "Backend-backed reports and audit views.";
  if (item.href === "/whatsapp") return "Operational WhatsApp connection and message tools.";
  if (item.href === "/administration") return "Shop, staff and owner control configuration.";
  return `${group} workspace.`;
}

export default function GatewayPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const restoration = peekNavigationRestoration("/gateway");

  const groups = useMemo(() => {
    const permitted = NAVIGATION_GROUPS.map((group) => ({
      label: group.label,
      items: group.items
        .filter((item) => item.href !== "/gateway" && hasPermission(user, item.permission))
        .map<GatewayEntry>((item) => ({
          ...item,
          id: `gateway.${item.href.replace(/^\//, "").replaceAll("/", ".") || "home"}`,
          group: group.label,
          description: itemDescription(group.label, item),
        })),
    })).filter((group) => group.items.length);

    if (user?.role === "OWNER") {
      permitted.push({
        label: "Owner Control",
        items: OWNER_CONTROL.map<GatewayEntry>((item) => ({
          ...item,
          permission: "OWNER",
          group: "Owner Control",
        })),
      });
    }
    return permitted;
  }, [user]);

  const entries = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const groupStarts = useMemo(() => groups.map((group, groupIndex) => ({
    label: group.label,
    start: groups.slice(0, groupIndex).reduce((sum, previous) => sum + previous.items.length, 0),
  })), [groups]);

  const snapshot = useSyncExternalStore(activePointerStore.subscribe, activePointerStore.getSnapshot, activePointerStore.getServerSnapshot);
  const pointer = snapshot.pointer?.zoneId === ZONE_ID ? snapshot.pointer : null;
  const activeIndex = pointer ? Math.max(0, Math.min(pointer.index, Math.max(entries.length - 1, 0))) : 0;
  const activeEntry = entries[activeIndex];

  const focusEntry = useCallback((index: number) => {
    requestAnimationFrame(() => containerRef.current?.querySelector<HTMLElement>(`[data-gateway-index="${index}"]`)?.focus());
  }, []);

  const activate = useCallback((index: number, focus = true) => {
    if (!entries.length) return;
    const next = Math.max(0, Math.min(index, entries.length - 1));
    activePointerStore.setPointer({ zoneId: ZONE_ID, itemId: entries[next].id, index: next });
    if (focus) focusEntry(next);
  }, [entries, focusEntry]);

  useEffect(() => {
    if (!entries.length) return;
    if (restoration) {
      restoreNavigationFrame(restoration);
      consumeNavigationRestoration("/gateway");
    } else if (drilldownStack.size() > 0) {
      drilldownStack.clear();
    }

    const current = activePointerStore.getPointer();
    if (current?.zoneId === ZONE_ID) {
      const byId = entries.findIndex((entry) => entry.id === current.itemId);
      activate(byId >= 0 ? byId : Math.min(current.index, entries.length - 1));
      return;
    }
    activate(0);
  }, [activate, entries, restoration]);

  const move = useCallback((delta: number) => activate(moveIndex(activeIndex, delta, entries.length)), [activate, activeIndex, entries.length]);

  const jumpGroup = useCallback((delta: number) => {
    if (!groupStarts.length) return;
    let currentGroup = 0;
    for (let index = 0; index < groupStarts.length; index += 1) {
      if (groupStarts[index].start <= activeIndex) currentGroup = index;
      else break;
    }
    const nextGroup = Math.max(0, Math.min(currentGroup + delta, groupStarts.length - 1));
    const itemOffsetInCurrentGroup = activeIndex - groupStarts[currentGroup].start;
    const targetGroupItemCount = groups[nextGroup].items.length;
    const targetItemOffset = Math.min(itemOffsetInCurrentGroup, targetGroupItemCount - 1);
    activate(groupStarts[nextGroup].start + targetItemOffset);
  }, [activate, activeIndex, groupStarts, groups]);

  const moveSpatial = useCallback((direction: "up" | "down" | "left" | "right") => {
    const root = containerRef.current;
    if (!root || !activeEntry) return;
    const spatialItems = Array.from(root.querySelectorAll<HTMLElement>("[data-gateway-id]")).map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.dataset.gatewayId ?? "", x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }).filter((item) => item.id);
    const next = nearestSpatial(spatialItems, activeEntry.id, direction);
    if (next) {
      const nextIndex = entries.findIndex((entry) => entry.id === next.id);
      if (nextIndex >= 0) {
        activate(nextIndex);
        return;
      }
    }
    if (direction === "right") jumpGroup(1);
    else if (direction === "left") jumpGroup(-1);
    else if (direction === "down") move(1);
    else if (direction === "up") move(-1);
  }, [activate, activeEntry, entries, jumpGroup, move]);

  const openEntry = useCallback((entry: GatewayEntry | undefined) => {
    if (!entry) return;
    drilldownStack.push({
      route: "/gateway",
      module: "gateway",
      view: "gateway",
      activePointer: activePointerStore.getPointer(),
      selectedIds: [],
      scrollOffset: typeof window === "undefined" ? 0 : window.scrollY,
    });
    router.push(entry.href);
  }, [router]);

  const commands = useMemo(() => ({
    next: { id: "gateway.next", title: "Next destination", category: "Gateway", repeatable: true, execute: () => move(1) },
    previous: { id: "gateway.previous", title: "Previous destination", category: "Gateway", repeatable: true, execute: () => move(-1) },
    left: { id: "gateway.left", title: "Move left", category: "Gateway", repeatable: true, execute: () => moveSpatial("left") },
    right: { id: "gateway.right", title: "Move right", category: "Gateway", repeatable: true, execute: () => moveSpatial("right") },
    nextGroup: { id: "gateway.nextGroup", title: "Next group", category: "Gateway", repeatable: true, execute: () => jumpGroup(1) },
    previousGroup: { id: "gateway.previousGroup", title: "Previous group", category: "Gateway", repeatable: true, execute: () => jumpGroup(-1) },
    first: { id: "gateway.first", title: "First destination", category: "Gateway", execute: () => activate(0) },
    last: { id: "gateway.last", title: "Last destination", category: "Gateway", execute: () => activate(entries.length - 1) },
    open: { id: "gateway.open", title: "Open destination", category: "Gateway", execute: () => openEntry(activeEntry) },
  }), [activate, activeEntry, entries.length, jumpGroup, move, moveSpatial, openEntry]);

  useCommand(commands.next);
  useCommand(commands.previous);
  useCommand(commands.left);
  useCommand(commands.right);
  useCommand(commands.nextGroup);
  useCommand(commands.previousGroup);
  useCommand(commands.first);
  useCommand(commands.last);
  useCommand(commands.open);

  const when = "gateway.focused && !dialog.open && !input.editable";
  useKeybinding(useMemo(() => ({ id: "gateway-down", key: "arrowdown", command: commands.next.id, when, priority: 120, allowRepeat: true }), [commands.next.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-up", key: "arrowup", command: commands.previous.id, when, priority: 120, allowRepeat: true }), [commands.previous.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-left", key: "arrowleft", command: commands.left.id, when, priority: 120, allowRepeat: true }), [commands.left.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-right", key: "arrowright", command: commands.right.id, when, priority: 120, allowRepeat: true }), [commands.right.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-group-down", key: "ctrl+arrowdown", command: commands.nextGroup.id, when, priority: 130, allowRepeat: true }), [commands.nextGroup.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-group-up", key: "ctrl+arrowup", command: commands.previousGroup.id, when, priority: 130, allowRepeat: true }), [commands.previousGroup.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-group-right", key: "ctrl+arrowright", command: commands.nextGroup.id, when, priority: 130, allowRepeat: true }), [commands.nextGroup.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-group-left", key: "ctrl+arrowleft", command: commands.previousGroup.id, when, priority: 130, allowRepeat: true }), [commands.previousGroup.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-home", key: "home", command: commands.first.id, when, priority: 120 }), [commands.first.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-end", key: "end", command: commands.last.id, when, priority: 120 }), [commands.last.id, when]));
  useKeybinding(useMemo(() => ({ id: "gateway-enter", key: "enter", command: commands.open.id, when, priority: 130 }), [commands.open.id, when]));

  const scope = JSON.stringify({
    "app.module": "gateway",
    "app.view": "gateway",
    "gateway.focused": true,
    "gateway.activeId": activeEntry?.id,
    "keyboard.scope": "gateway",
  });

  return (
    <div ref={containerRef} data-keyboard-scope={scope} className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-[clamp(0.8rem,1.4vw,1.4rem)]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-[clamp(0.7rem,1vw,1rem)]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gateway · Shop Control</p>
          <h1 className="mt-1 flex items-center gap-2 text-[clamp(1.2rem,2vw,1.8rem)] font-semibold tracking-tight"><PanelsTopLeft className="size-5 text-primary" />Gateway of Shop Control</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">One keyboard root for transactions, records and control. Use ↑/↓ to move, Ctrl+↑/↓ to jump groups, and Enter to open the active destination.</p>
        </div>
        <Badge variant="outline" className="text-[10px]">{user?.role === "OWNER" ? "Owner gateway" : "Staff gateway"}</Badge>
      </header>

      <nav aria-label="Gateway destinations" className="grid gap-[clamp(0.75rem,1vw,1rem)] md:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => (
          <section key={group.label} className="rounded-xl border bg-card/70 p-2">
            <h2 className="px-2 pb-2 pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</h2>
            <div className="space-y-1">
              {group.items.map((entry) => {
                const index = entries.findIndex((item) => item.id === entry.id);
                const active = index === activeIndex;
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    data-gateway-index={index}
                    data-gateway-id={entry.id}
                    data-keyboard-active={active || undefined}
                    tabIndex={active ? 0 : -1}
                    onFocus={() => activate(index, false)}
                    onMouseEnter={() => activate(index, false)}
                    onClick={() => { activate(index, false); openEntry(entry); }}
                    className={cn(
                      "flex min-h-[4.25rem] w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left outline-none transition-colors",
                      "hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                      active && "border-primary/40 bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]",
                    )}
                    aria-label={`${entry.label}. ${entry.description}`}
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground", active && "border-primary/30 text-primary")}><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{entry.label}</span><span className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-muted-foreground">{entry.description}</span></span>
                    {active ? <span className="shrink-0 font-mono text-[9px] font-semibold text-primary">Enter ↵</span> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </div>
  );
}
