"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";

import { useKernelCombobox } from "@/components/keyboard/useKernelCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function KernelSearchPicker<T>({
  id,
  label,
  query,
  onQueryChange,
  items,
  getKey,
  getLabel,
  getMeta,
  onSelect,
  selectedLabel,
  selectedMeta,
  onClear,
  placeholder,
  loading = false,
  disabled = false,
  className,
}: {
  id: string;
  label: string;
  query: string;
  onQueryChange: (value: string) => void;
  items: readonly T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getMeta?: (item: T) => string | null | undefined;
  onSelect: (item: T) => void;
  selectedLabel?: string | null;
  selectedMeta?: string | null;
  onClear?: () => void;
  placeholder: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const safeId = useMemo(() => id.replace(/[^a-zA-Z0-9_-]/g, "-"), [id]);
  const listId = `${safeId}-listbox`;

  const { activeIndex, setActiveIndex, scope } = useKernelCombobox({
    id,
    open,
    items,
    onOpenChange: setOpen,
    onSelect: (item) => {
      onSelect(item);
      setOpen(false);
    },
  });

  const activeOptionId = activeIndex >= 0 ? `${safeId}-option-${activeIndex}` : undefined;

  return (
    <div
      className={cn("relative min-w-0", className)}
      data-keyboard-scope={scope}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={`${safeId}-input`} className="workspace-kicker">{label}</label>
        {selectedLabel && onClear ? (
          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[9px] text-muted-foreground" onClick={onClear}>
            <X className="size-3" />Clear
          </Button>
        ) : null}
      </div>

      {selectedLabel ? (
        <div className="mb-2 flex min-h-10 items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2">
          <Check className="size-3.5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{selectedLabel}</p>
            {selectedMeta ? <p className="truncate text-[10px] text-muted-foreground">{selectedMeta}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${safeId}-input`}
          data-kernel-field
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeOptionId}
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          placeholder={placeholder}
          className="h-10 bg-background pl-9 pr-9 text-xs"
        />
        {loading ? <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      </div>

      {open ? (
        <div id={listId} role="listbox" className="absolute z-50 mt-1 max-h-[min(44vh,20rem)] w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
          {items.length === 0 ? (
            <div className="px-3 py-5 text-center text-[10px] text-muted-foreground">{loading ? "Searching…" : "No matching records"}</div>
          ) : items.map((item, index) => {
            const meta = getMeta?.(item);
            const active = index === activeIndex;
            return (
              <button
                key={getKey(item)}
                id={`${safeId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={active}
                className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left outline-none", active ? "bg-accent text-accent-foreground" : "hover:bg-muted/60")}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate text-xs font-semibold">{getLabel(item)}</span>
                {meta ? <span className="shrink-0 text-[9px] text-muted-foreground">{meta}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
