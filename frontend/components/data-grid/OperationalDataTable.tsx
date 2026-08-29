"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { AlertCircle, Database, RefreshCw } from "lucide-react";

import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { moveIndex } from "@/lib/focus/composite-navigation";
import { cn } from "@/lib/utils";

interface OperationalDataTableProps<TData> {
  id?: string;
  data: TData[];
  columns: ColumnDef<TData>[];
  getRowId: (row: TData) => string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowOpen?: (row: TData) => void;
  onFilterRequest?: () => void;
  renderMobileCard?: (row: TData) => ReactNode;
  className?: string;
  autoFocus?: boolean;
  pageJumpSize?: number;
}

export function OperationalDataTable<TData>({
  id,
  data,
  columns,
  getRowId,
  isLoading = false,
  isError = false,
  onRetry,
  emptyTitle = "No records found",
  emptyDescription = "No records match the current view.",
  onRowOpen,
  onFilterRequest,
  renderMobileCard,
  className,
  autoFocus = false,
  pageJumpSize = 10,
}: OperationalDataTableProps<TData>) {
  const generatedId = useId().replaceAll(":", "");
  const reportId = id ?? `report-${generatedId}`;
  const zoneId = `${reportId}.rows`;
  const containerRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  });
  const rows = table.getRowModel().rows;
  const snapshot = useSyncExternalStore(
    activePointerStore.subscribe,
    activePointerStore.getSnapshot,
    activePointerStore.getServerSnapshot,
  );

  const pointer = snapshot.pointer?.zoneId === zoneId ? snapshot.pointer : null;
  const activeIndex = pointer ? pointer.index : -1;

  const focusRow = useCallback((index: number) => {
    requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-operational-row="${index}"]`)
        ?.focus();
    });
  }, []);

  const activate = useCallback(
    (index: number, focus = true) => {
      if (!rows.length) return;
      const next = Math.max(0, Math.min(index, rows.length - 1));
      const row = rows[next];
      activePointerStore.setPointer({ zoneId, itemId: row.id, index: next });
      if (focus) focusRow(next);
    },
    [focusRow, rows, zoneId],
  );

  useEffect(() => {
    const current = activePointerStore.getPointer();
    if (!rows.length) {
      if (current?.zoneId === zoneId) activePointerStore.setPointer(null);
      return;
    }

    if (current?.zoneId === zoneId) {
      const matchingIndex = rows.findIndex((row) => row.id === current.itemId);
      const nextIndex = matchingIndex >= 0
        ? matchingIndex
        : Math.min(current.index, rows.length - 1);
      if (nextIndex !== current.index || rows[nextIndex]?.id !== current.itemId) {
        activate(nextIndex, autoFocus);
      } else if (autoFocus) {
        focusRow(nextIndex);
      }
      return;
    }

    if (autoFocus) activate(0);
  }, [activate, autoFocus, focusRow, rows, zoneId]);

  const commandPrefix = `operational.${reportId}`;
  const getCurrentIndex = useCallback(() => {
    const current = activePointerStore.getPointer();
    return current?.zoneId === zoneId ? current.index : 0;
  }, [zoneId]);

  const commands = useMemo(
    () => ({
      down: { id: `${commandPrefix}.down`, title: "Next row", repeatable: true, execute: () => activate(moveIndex(getCurrentIndex(), 1, rows.length)) },
      up: { id: `${commandPrefix}.up`, title: "Previous row", repeatable: true, execute: () => activate(moveIndex(getCurrentIndex(), -1, rows.length)) },
      first: { id: `${commandPrefix}.first`, title: "First row", repeatable: true, execute: () => activate(0) },
      last: { id: `${commandPrefix}.last`, title: "Last row", repeatable: true, execute: () => activate(rows.length - 1) },
      pageUp: { id: `${commandPrefix}.pageUp`, title: "Previous row block", repeatable: true, execute: () => activate(moveIndex(getCurrentIndex(), -pageJumpSize, rows.length)) },
      pageDown: { id: `${commandPrefix}.pageDown`, title: "Next row block", repeatable: true, execute: () => activate(moveIndex(getCurrentIndex(), pageJumpSize, rows.length)) },
      open: {
        id: `${commandPrefix}.open`,
        title: "Open",
        execute: () => {
          const current = activePointerStore.getPointer();
          if (current?.zoneId !== zoneId) return;
          const row = rows[current.index];
          if (row && onRowOpen) onRowOpen(row.original);
        },
      },
      select: {
        id: `${commandPrefix}.select`,
        title: "Select row",
        execute: () => {
          const current = activePointerStore.getPointer();
          if (current?.zoneId === zoneId) activePointerStore.toggleSelection(current.itemId);
        },
      },
      filter: { id: `${commandPrefix}.filter`, title: "Filter", execute: () => onFilterRequest?.() },
    }),
    [activate, commandPrefix, getCurrentIndex, onFilterRequest, onRowOpen, pageJumpSize, rows, zoneId],
  );

  useCommand(commands.down);
  useCommand(commands.up);
  useCommand(commands.first);
  useCommand(commands.last);
  useCommand(commands.pageUp);
  useCommand(commands.pageDown);
  useCommand(commands.open);
  useCommand(commands.select);
  useCommand(commands.filter);

  const reportWhen = `report.focused && report.id == ${reportId} && !dialog.open`;
  const navigationWhen = `${reportWhen} && !input.editable`;
  const filterWhen = `${reportWhen} && report.canFilter`;

  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.down`, key: "arrowdown", command: commands.down.id, when: navigationWhen, priority: 50, allowRepeat: true }), [commandPrefix, commands.down.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.up`, key: "arrowup", command: commands.up.id, when: navigationWhen, priority: 50, allowRepeat: true }), [commandPrefix, commands.up.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.home`, key: "home", command: commands.first.id, when: navigationWhen, priority: 50, allowRepeat: true }), [commandPrefix, commands.first.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.end`, key: "end", command: commands.last.id, when: navigationWhen, priority: 50, allowRepeat: true }), [commandPrefix, commands.last.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.ctrl-home`, key: "ctrl+home", command: commands.first.id, when: navigationWhen, priority: 60, allowRepeat: true }), [commandPrefix, commands.first.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.ctrl-end`, key: "ctrl+end", command: commands.last.id, when: navigationWhen, priority: 60, allowRepeat: true }), [commandPrefix, commands.last.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.page-up`, key: "pageup", command: commands.pageUp.id, when: navigationWhen, priority: 50, allowRepeat: true }), [commandPrefix, commands.pageUp.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.page-down`, key: "pagedown", command: commands.pageDown.id, when: navigationWhen, priority: 50, allowRepeat: true }), [commandPrefix, commands.pageDown.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.open`, key: "enter", command: commands.open.id, when: `${navigationWhen} && activeRowCanDrillDown`, priority: 50 }), [commandPrefix, commands.open.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.select`, key: "space", command: commands.select.id, when: navigationWhen, priority: 50 }), [commandPrefix, commands.select.id, navigationWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.filter`, key: "ctrl+f", command: commands.filter.id, when: filterWhen, priority: 70 }), [commandPrefix, commands.filter.id, filterWhen]));

  if (isLoading) {
    return <div className="workspace-table-shell p-[clamp(0.6rem,0.9vw,1rem)]"><div className="space-y-2">{Array.from({ length: 9 }).map((_, row) => <Skeleton key={row} className="h-[clamp(2.25rem,4.5vh,2.8rem)] w-full rounded-lg" />)}</div></div>;
  }

  if (isError) {
    return <div className="flex min-h-[42vh] items-center justify-center p-[clamp(1rem,2vw,2rem)] text-center"><div><AlertCircle className="mx-auto mb-3 size-7 text-destructive" /><p className="text-sm font-semibold">This register could not be loaded</p><p className="mt-1 text-xs text-muted-foreground">The error state is preserved instead of being shown as an empty register.</p>{onRetry ? <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onRetry}><RefreshCw className="size-3.5" />Retry</Button> : null}</div></div>;
  }

  if (!rows.length) {
    return <div className="flex min-h-[42vh] items-center justify-center p-[clamp(1rem,2vw,2rem)] text-center"><div><Database className="mx-auto mb-3 size-7 text-muted-foreground" /><p className="text-sm font-semibold">{emptyTitle}</p><p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p></div></div>;
  }

  const scope = JSON.stringify({
    "report.focused": true,
    "report.id": reportId,
    "report.canFilter": Boolean(onFilterRequest),
    "grid.focused": true,
    "keyboard.scope": "report",
    "activeRowCanDrillDown": Boolean(onRowOpen),
    "row.activeId": pointer?.itemId,
    "row.activeIndex": activeIndex,
    "selection.count": snapshot.selectedIds.size,
  });

  const handleRowClick = (row: TData, index: number) => {
    activate(index, false);
    if (onRowOpen) onRowOpen(row);
  };

  return (
    <div ref={containerRef} data-keyboard-scope={scope} data-operational-report={reportId} role="grid" aria-label={reportId} className="outline-none">
      {renderMobileCard ? <div className="grid gap-2 p-2 md:hidden">{rows.map((row, index) => {
        const active = activeIndex === index;
        const selected = snapshot.selectedIds.has(row.id);
        return <div key={row.id} role="row" tabIndex={active ? 0 : -1} data-operational-row={index} data-keyboard-active={active || undefined} aria-selected={selected} onFocus={() => activate(index, false)} onClick={() => handleRowClick(row.original, index)} className={cn("rounded-xl border outline-none", onRowOpen && "cursor-pointer", active && "border-primary bg-primary/10 ring-1 ring-primary/30", selected && "bg-accent")}>{renderMobileCard(row.original)}</div>;
      })}</div> : null}

      <div className={cn("workspace-table-shell", renderMobileCard && "hidden md:block", className)}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            {table.getHeaderGroups().map((group) => <TableRow key={group.id} role="row" className="hover:bg-transparent">{group.headers.map((header) => <TableHead key={header.id} role="columnheader" className="h-[clamp(2.25rem,4.5vh,2.75rem)] whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const active = activeIndex === index;
              const selected = snapshot.selectedIds.has(row.id);
              return <TableRow key={row.id} role="row" tabIndex={active ? 0 : -1} data-operational-row={index} data-keyboard-active={active || undefined} aria-selected={selected} onFocus={() => activate(index, false)} onClick={() => handleRowClick(row.original, index)} className={cn("h-[clamp(2.45rem,5vh,3rem)] text-xs outline-none", onRowOpen && "cursor-pointer", active && "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/40", selected && "bg-accent/70")}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} role="gridcell" className="py-1.5 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
