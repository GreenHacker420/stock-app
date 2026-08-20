"use client";

import { useCallback, useEffect, useMemo, useState, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, Loader2, Package, Search, X } from "lucide-react";

import { editableGridController } from "@/components/keyboard/EditableGridController";
import { focusRegistry } from "@/components/keyboard/focus-registry";
import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { useKernelCombobox } from "@/components/keyboard/useKernelCombobox";
import { useTransactionField } from "@/components/keyboard/useTransactionField";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useInfiniteItemSearchQuery } from "../api/sale.queries";
import type { ItemWithStock } from "../lib/sale-types";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

export function HighlightText({ text, search }: { text: string; search: string }) {
  if (!search || !search.trim()) return <>{text}</>;
  const query = search.trim();
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="rounded-xs bg-amber-300 px-0.5 font-bold text-slate-950 dark:bg-amber-500/80">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

interface SaleItemSearchProps {
  onSelectItem: (item: ItemWithStock) => void;
  autoFocus?: boolean;
  placeholder?: string;
  fieldId?: string;
  zoneId?: string;
  rowIndex?: number;
  colIndex?: number;
  initialValue?: string;
}

export function SaleItemSearch({
  onSelectItem,
  autoFocus = false,
  placeholder = "Search product by name, SKU or scan barcode...",
  fieldId = "sale.items.search",
  zoneId = "LINE_ITEM_GRID",
  rowIndex,
  colIndex = 0,
  initialValue = "",
}: SaleItemSearchProps) {
  const { token, activeShopId } = useAuthStore();
  const [searchInput, setSearchInput] = useState(initialValue);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 250);
  const listboxId = `product-search-listbox-${fieldId.replace(/[^a-zA-Z0-9]/g, "-")}`;

  const { setRef: setSearchRef, onFocus: onSearchFocus, isActive } = useTransactionField<HTMLInputElement>({
    id: fieldId,
    zoneId,
    rowIndex,
    colIndex,
    columnId: "itemSearch",
  });

  const dropdownVisible = dropdownOpen && isActive;

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteItemSearchQuery({
    token,
    shopId: activeShopId,
    search: debouncedSearch,
    enabled: dropdownVisible,
  });

  const items = useMemo(() => data?.pages.flatMap((page) => page) ?? [], [data]);

  const handleSelect = useCallback((item: ItemWithStock) => {
    onSelectItem(item);
    setSearchInput("");
    setDropdownOpen(false);
  }, [onSelectItem]);

  const handleEndOfList = useCallback(() => {
    setDropdownOpen(false);
    focusRegistry.setMode("NAVIGATION");
    requestAnimationFrame(() => focusRegistry.setActiveField("sale.remarks", "REMARKS"));
  }, []);

  const handlePrevious = useCallback(() => {
    setDropdownOpen(false);
    focusRegistry.setMode("NAVIGATION");
    const currentField = focusRegistry.getField(fieldId);
    if (!currentField) return;
    const fields = focusRegistry.getFieldsInZone(zoneId);
    const previous = editableGridController.calculateNextField(fields, currentField, "LEFT");
    if (previous && previous.id !== fieldId) {
      focusRegistry.setActiveField(previous.id);
      return;
    }
    focusRegistry.setActiveField("sale.header.gst", "SALE_HEADER");
  }, [fieldId, zoneId]);

  const combobox = useKernelCombobox({
    id: fieldId,
    open: dropdownVisible,
    items,
    onOpenChange: setDropdownOpen,
    onSelect: handleSelect,
    onSelectEndOfList: handleEndOfList,
    queryEmpty: searchInput.length === 0,
  });

  const commandPrefix = `sale.itemSearch.${fieldId}`;
  const emptyQueryWhen = `combobox.open && combobox.id == ${fieldId} && combobox.queryEmpty`;
  const commands = useMemo(() => ({
    previous: {
      id: `${commandPrefix}.previous`,
      title: "Previous voucher field",
      category: "Sale Entry",
      when: emptyQueryWhen,
      execute: handlePrevious,
    },
  }), [commandPrefix, emptyQueryWhen, handlePrevious]);

  useCommand(commands.previous);
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.previous`, key: "backspace", command: commands.previous.id, when: emptyQueryWhen, priority: 270 }), [commandPrefix, commands.previous.id, emptyQueryWhen]));

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && combobox.activeIndex >= items.length - 4) void fetchNextPage();
  }, [combobox.activeIndex, fetchNextPage, hasNextPage, isFetchingNextPage, items.length]);

  useEffect(() => {
    if (dropdownVisible && combobox.activeIndex >= 0 && items[combobox.activeIndex]) {
      const activeId = items[combobox.activeIndex].id;
      document.getElementById(`product-opt-${activeId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [combobox.activeIndex, dropdownVisible, items]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (scrollHeight - (scrollTop + clientHeight) < 100 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  };

  const activeItemId = combobox.activeIndex >= 0 && items[combobox.activeIndex]
    ? `product-opt-${items[combobox.activeIndex].id}`
    : undefined;

  const isEndOfListActive = combobox.activeIndex === -1 && searchInput.length === 0;

  const renderTallySideDialog = () => {
    if (!dropdownVisible || typeof document === "undefined") return null;

    return createPortal(
      <aside
        id={listboxId}
        role="listbox"
        aria-label="List of Stock Items"
        data-keyboard-scope={combobox.scope}
        className="fixed right-4 top-24 z-50 flex max-h-[calc(100vh-130px)] w-[clamp(320px,28vw,420px)] flex-col overflow-hidden rounded-xl border border-sky-300/80 bg-sky-50/95 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-right-4 duration-200 dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-black/70"
      >
        <div className="flex items-center justify-between border-b border-sky-200/80 bg-gradient-to-r from-sky-700 to-sky-800 px-4 py-2.5 text-white dark:border-zinc-700 dark:from-zinc-800 dark:to-zinc-900">
          <div>
            <h3 className="flex items-center gap-1.5 font-mono text-xs font-black uppercase tracking-wider"><Package className="size-4" /><span>List of Stock Items</span></h3>
            <p className="mt-0.5 text-[10px] font-medium text-sky-100 dark:text-zinc-400">Use ↑/↓ to navigate · Enter to select · Esc to close</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="border border-sky-600/40 bg-sky-900/80 font-mono text-[10px] font-bold text-sky-100">{items.length}{hasNextPage ? "+" : ""} items</Badge>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setDropdownOpen(false)} className="rounded-md p-1 text-sky-200 hover:bg-sky-600 hover:text-white dark:text-zinc-400 dark:hover:bg-zinc-700" aria-label="Close List of Stock Items"><X className="size-4" /></button>
          </div>
        </div>

        <div onScroll={handleScroll} className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-1.5">
          <button
            type="button"
            onMouseEnter={() => combobox.setActiveIndex(-1)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleEndOfList}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs transition-all ${
              isEndOfListActive
                ? "bg-amber-400 font-black text-slate-950 shadow-md ring-1 ring-amber-500 dark:bg-amber-400 dark:text-slate-950"
                : "font-bold text-amber-700 hover:bg-amber-100/60 dark:text-amber-400 dark:hover:bg-amber-950/40"
            }`}
          >
            <span>◆ End of List</span>
            <span className="font-mono text-[10px] font-normal">Enter</span>
          </button>
          <div className="my-1 h-px bg-sky-200/50 dark:bg-zinc-800" />

          {isLoading ? (
            <div className="space-y-2 p-2"><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /></div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-xs font-medium text-muted-foreground">{debouncedSearch ? `No products found matching "${debouncedSearch}"` : "Start typing product name, SKU or barcode to search"}</div>
          ) : (
            <>
              {items.map((item, index) => {
                const highlighted = index === combobox.activeIndex;
                const stock = item.availableStock ?? item.currentStock ?? item.physicalStock;
                return (
                  <button key={`${item.id}-${index}`} id={`product-opt-${item.id}`} role="option" aria-selected={highlighted} type="button" onMouseEnter={() => combobox.setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => handleSelect(item)} className={`group relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-all ${highlighted ? "bg-amber-400 font-black text-slate-950 shadow-md ring-1 ring-amber-500 dark:bg-amber-400 dark:text-slate-950" : "font-semibold text-slate-900 hover:bg-sky-100/70 dark:text-slate-100 dark:hover:bg-zinc-800/80"}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Package className={`size-4 shrink-0 ${highlighted ? "text-slate-950" : "text-sky-700 dark:text-sky-400"}`} />
                      <div className="truncate"><div className="truncate text-xs"><HighlightText text={item.name} search={debouncedSearch} /></div><div className={`font-mono text-[10px] ${highlighted ? "text-slate-900/90" : "text-muted-foreground"}`}>SKU: <HighlightText text={item.sku || "N/A"} search={debouncedSearch} /> {item.unit ? `· (${item.unit})` : ""}</div></div>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-2">
                      {stock !== undefined && stock !== null ? <span className={`font-mono text-[10px] ${highlighted ? "font-bold text-slate-900" : "text-muted-foreground"}`}>Stk: <strong className="font-bold">{stock}</strong></span> : null}
                      {item.requiresSerialNumber ? <Badge variant="outline" className={`text-[9px] font-bold ${highlighted ? "border-slate-950/40 bg-slate-950/10 text-slate-950" : "border-indigo-300 text-indigo-700 dark:text-indigo-400"}`}>Serial Req</Badge> : null}
                      <span className={`font-mono text-xs font-black ${highlighted ? "text-slate-950" : "text-sky-800 dark:text-sky-300"}`}>₹{item.defaultSellingPrice ?? 0}</span>
                      {highlighted ? <CornerDownLeft className="ml-1 size-3.5 text-slate-950" /> : null}
                    </div>
                  </button>
                );
              })}
              {isFetchingNextPage ? <div className="flex items-center justify-center gap-2 py-3 text-xs font-semibold text-sky-800 dark:text-sky-300"><Loader2 className="size-3.5 animate-spin" /><span>Loading more items...</span></div> : null}
            </>
          )}
        </div>
      </aside>,
      document.body,
    );
  };

  return (
    <div className="relative w-full" data-keyboard-scope={combobox.scope}>
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground/70" />
        <Input
          ref={setSearchRef}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={searchInput}
          tabIndex={isActive ? 0 : -1}
          onFocus={() => { onSearchFocus(); setDropdownOpen(true); }}
          onClick={() => { focusRegistry.setActiveField(fieldId, zoneId); setDropdownOpen(true); }}
          onBlur={(event) => { if (!event.relatedTarget || !event.relatedTarget.closest(`#${listboxId}`)) setDropdownOpen(false); }}
          onChange={(event) => { setSearchInput(event.target.value); focusRegistry.setActiveField(fieldId, zoneId); combobox.resetActiveIndex(); setDropdownOpen(true); }}
          className={`h-8.5 w-full pl-8 pr-2.5 text-xs font-semibold placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary ${isActive ? "border-primary bg-primary/5 ring-2 ring-primary" : "border-border/60"}`}
          role="combobox"
          aria-expanded={dropdownVisible}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={activeItemId}
          aria-label="Inline product search"
          autoComplete="off"
        />
      </div>
      {renderTallySideDialog()}
    </div>
  );
}
