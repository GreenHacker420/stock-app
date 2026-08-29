"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { drilldownStack } from "@/lib/navigation/drilldown-stack";
import { cn, formatINR } from "@/lib/utils";

export interface KeyboardDashboardChartPoint {
  id: string;
  label: string;
  value: number;
  href?: string;
}

interface KeyboardDashboardChartProps {
  id: string;
  title: string;
  description: string;
  points: KeyboardDashboardChartPoint[];
  businessDate: string;
}

export function KeyboardDashboardChart({ id, title, description, points, businessDate }: KeyboardDashboardChartProps) {
  const router = useRouter();
  const zoneId = `dashboard.chart.${id}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const snapshot = useSyncExternalStore(activePointerStore.subscribe, activePointerStore.getSnapshot, activePointerStore.getServerSnapshot);
  const pointer = snapshot.pointer?.zoneId === zoneId ? snapshot.pointer : null;
  const activeIndex = pointer ? Math.max(0, Math.min(pointer.index, Math.max(points.length - 1, 0))) : 0;
  const activePoint = points[activeIndex];
  const maxValue = useMemo(() => Math.max(...points.map((point) => point.value), 1), [points]);

  const focusPoint = useCallback((index: number) => {
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-chart-index="${index}"]`)?.focus());
  }, []);

  const activate = useCallback((index: number, focus = true) => {
    if (!points.length) return;
    const next = Math.max(0, Math.min(index, points.length - 1));
    activePointerStore.setPointer({ zoneId, itemId: points[next].id, index: next });
    if (focus) focusPoint(next);
  }, [focusPoint, points, zoneId]);

  useEffect(() => {
    const current = activePointerStore.getPointer();
    if (!points.length || current?.zoneId !== zoneId) return;
    const restored = points.findIndex((point) => point.id === current.itemId);
    activate(restored >= 0 ? restored : Math.min(current.index, points.length - 1));
  }, [activate, points, zoneId]);

  const move = useCallback((delta: number) => activate(activeIndex + delta), [activate, activeIndex]);

  const openPoint = useCallback((point: KeyboardDashboardChartPoint | undefined) => {
    if (!point?.href) return;
    drilldownStack.push({
      route: "/dashboard",
      module: "dashboard",
      view: "dashboard.chart",
      activePointer: activePointerStore.getPointer(),
      selectedIds: [],
      filters: { businessDate, chart: id },
      scrollOffset: typeof window === "undefined" ? 0 : window.scrollY,
    });
    router.push(point.href);
  }, [businessDate, id, router]);

  const commands = useMemo(() => ({
    previous: { id: `dashboard.chart.${id}.previous`, title: "Previous chart point", category: "Dashboard chart", repeatable: true, execute: () => move(-1) },
    next: { id: `dashboard.chart.${id}.next`, title: "Next chart point", category: "Dashboard chart", repeatable: true, execute: () => move(1) },
    first: { id: `dashboard.chart.${id}.first`, title: "First chart point", category: "Dashboard chart", execute: () => activate(0) },
    last: { id: `dashboard.chart.${id}.last`, title: "Last chart point", category: "Dashboard chart", execute: () => activate(points.length - 1) },
    open: { id: `dashboard.chart.${id}.open`, title: "Open chart point", category: "Dashboard chart", execute: () => openPoint(activePoint) },
  }), [activate, activePoint, id, move, openPoint, points.length]);

  useCommand(commands.previous);
  useCommand(commands.next);
  useCommand(commands.first);
  useCommand(commands.last);
  useCommand(commands.open);

  const when = `dashboard.chartFocused && dashboard.chart.${id}.focused && !dialog.open && !input.editable`;
  useKeybinding(useMemo(() => ({ id: `dashboard-chart-${id}-left`, key: "arrowleft", command: commands.previous.id, when, priority: 170, allowRepeat: true }), [commands.previous.id, id, when]));
  useKeybinding(useMemo(() => ({ id: `dashboard-chart-${id}-right`, key: "arrowright", command: commands.next.id, when, priority: 170, allowRepeat: true }), [commands.next.id, id, when]));
  useKeybinding(useMemo(() => ({ id: `dashboard-chart-${id}-home`, key: "home", command: commands.first.id, when, priority: 170 }), [commands.first.id, id, when]));
  useKeybinding(useMemo(() => ({ id: `dashboard-chart-${id}-end`, key: "end", command: commands.last.id, when, priority: 170 }), [commands.last.id, id, when]));
  useKeybinding(useMemo(() => ({ id: `dashboard-chart-${id}-enter`, key: "enter", command: commands.open.id, when, priority: 180 }), [commands.open.id, id, when]));

  if (!points.length) return null;

  const scope = JSON.stringify({
    "dashboard.chartFocused": true,
    [`dashboard.chart.${id}.focused`]: true,
    "dashboard.chartId": id,
    "dashboard.chartPointId": activePoint?.id,
    "dashboard.activeTileCanDrillDown": false,
    "keyboard.scope": zoneId,
  });

  return (
    <section ref={rootRef} data-keyboard-scope={scope} className="rounded-xl border bg-card/75 p-[clamp(0.75rem,1vw,1rem)]" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 max-w-2xl text-[10px] leading-4 text-muted-foreground">{description}</p></div>
        <span className="font-mono text-[9px] text-muted-foreground">←/→ point · Enter open</span>
      </div>
      <div className="space-y-1.5">
        {points.map((point, index) => {
          const active = pointer ? pointer.index === index : index === 0;
          const width = `${Math.max(4, (point.value / maxValue) * 100)}%`;
          return (
            <button
              key={point.id}
              type="button"
              data-chart-index={index}
              data-keyboard-active={active || undefined}
              tabIndex={active ? 0 : -1}
              aria-label={`${point.label}: ${formatINR(point.value)}${point.href ? ". Enter to open customer." : "."}`}
              onFocus={() => activate(index, false)}
              onMouseEnter={() => activate(index, false)}
              onClick={() => { activate(index, false); openPoint(point); }}
              className={cn(
                "grid w-full grid-cols-[minmax(7rem,0.8fr)_minmax(8rem,2fr)_auto] items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left outline-none transition-colors",
                "hover:border-border hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
                pointer && active && "border-primary/40 bg-primary/10",
              )}
            >
              <span className="truncate text-[11px] font-semibold">{point.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/70" style={{ width }} /></span>
              <span className="numeric-cell whitespace-nowrap text-[10px] font-semibold">{formatINR(point.value)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
