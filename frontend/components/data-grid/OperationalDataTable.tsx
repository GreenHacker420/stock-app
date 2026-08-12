"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { AlertCircle, Database, RefreshCw } from "lucide-react";

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
import { cn } from "@/lib/utils";

export function OperationalDataTable<TData>({
  data,
  columns,
  getRowId,
  isLoading = false,
  isError = false,
  onRetry,
  emptyTitle = "No records found",
  emptyDescription = "No records match the current view.",
  onRowOpen,
  renderMobileCard,
  className,
}: {
  data: TData[];
  columns: ColumnDef<TData>[];
  getRowId: (row: TData) => string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowOpen?: (row: TData) => void;
  renderMobileCard?: (row: TData) => React.ReactNode;
  className?: string;
}) {
  const [focusedRow, setFocusedRow] = React.useState(0);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;

  React.useEffect(() => {
    setFocusedRow((current) => Math.min(current, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  const moveFocus = React.useCallback((nextIndex: number) => {
    if (rows.length === 0) return;
    const index = Math.max(0, Math.min(nextIndex, rows.length - 1));
    setFocusedRow(index);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-operational-row="${index}"]`)?.focus();
    });
  }, [rows.length]);

  if (isLoading) {
    return (
      <div className="workspace-table-shell p-[clamp(0.6rem,0.9vw,1rem)]">
        <div className="space-y-2">
          {Array.from({ length: 9 }).map((_, row) => (
            <Skeleton key={row} className="h-[clamp(2.25rem,4.5vh,2.8rem)] w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[42vh] items-center justify-center p-[clamp(1rem,2vw,2rem)] text-center">
        <div>
          <AlertCircle className="mx-auto mb-3 size-7 text-destructive" />
          <p className="text-sm font-semibold">This register could not be loaded</p>
          <p className="mt-1 text-xs text-muted-foreground">The error state is preserved instead of being shown as an empty register.</p>
          {onRetry ? (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[42vh] items-center justify-center p-[clamp(1rem,2vw,2rem)] text-center">
        <div>
          <Database className="mx-auto mb-3 size-7 text-muted-foreground" />
          <p className="text-sm font-semibold">{emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderMobileCard ? (
        <div className="grid gap-2 p-2 md:hidden">
          {rows.map((row, index) => (
            <div
              key={row.id}
              tabIndex={focusedRow === index ? 0 : -1}
              data-operational-row={index}
              onFocus={() => setFocusedRow(index)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveFocus(index + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveFocus(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  moveFocus(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  moveFocus(rows.length - 1);
                } else if (event.key === "Enter" && onRowOpen) {
                  event.preventDefault();
                  onRowOpen(row.original);
                }
              }}
              onDoubleClick={() => onRowOpen?.(row.original)}
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {renderMobileCard(row.original)}
            </div>
          ))}
        </div>
      ) : null}

      <div className={cn("workspace-table-shell", renderMobileCard && "hidden md:block", className)}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-[clamp(2.25rem,4.5vh,2.75rem)] whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={row.id}
                tabIndex={focusedRow === index ? 0 : -1}
                data-operational-row={index}
                aria-selected={focusedRow === index}
                onFocus={() => setFocusedRow(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveFocus(index + 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveFocus(index - 1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    moveFocus(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    moveFocus(rows.length - 1);
                  } else if (event.key === "Enter" && onRowOpen) {
                    event.preventDefault();
                    onRowOpen(row.original);
                  }
                }}
                onDoubleClick={() => onRowOpen?.(row.original)}
                className={cn(
                  "h-[clamp(2.45rem,5vh,3rem)] text-xs outline-none",
                  onRowOpen && "cursor-pointer",
                  "focus-visible:bg-indigo-50/70 dark:focus-visible:bg-indigo-950/30",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-1.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
