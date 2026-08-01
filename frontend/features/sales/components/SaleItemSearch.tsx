"use client";

import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useItemSearchQuery } from "../api/sale.queries";
import { useTransactionField } from "@/components/keyboard/useTransactionField";
import { ComboboxKeyboardController } from "@/components/keyboard/ComboboxKeyboardController";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Package } from "lucide-react";
import type { ItemWithStock } from "../lib/sale-types";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface SaleItemSearchProps {
  onSelectItem: (item: ItemWithStock) => void;
  autoFocus?: boolean;
}

export function SaleItemSearch({ onSelectItem, autoFocus = false }: SaleItemSearchProps) {
  const { token, activeShopId } = useAuthStore();
  const [searchInput, setSearchInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 250);

  const controllerRef = useRef(new ComboboxKeyboardController());
  const listboxId = "product-search-listbox";

  // Register with FocusRegistry
  const { setRef: setSearchRef } = useTransactionField<HTMLInputElement>({
    id: "sale.items.search",
    zoneId: "PRODUCT_SEARCH",
  });

  const { data: items = [], isLoading } = useItemSearchQuery({
    token,
    shopId: activeShopId,
    search: debouncedSearch,
    enabled: dropdownOpen,
  });

  useEffect(() => {
    const cbItems = items.map((i) => ({ id: i.id, label: i.name, data: i }));
    controllerRef.current.setItems(cbItems);
  }, [items]);

  useEffect(() => {
    controllerRef.current.setOpen(dropdownOpen);
  }, [dropdownOpen]);

  const handleSelect = (item: ItemWithStock) => {
    onSelectItem(item);
    setSearchInput("");
    setDropdownOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const res = controllerRef.current.handleKeyDown(e.nativeEvent);
    if (res.handled) {
      if (res.action === "SELECT") {
        const item = controllerRef.current.getActiveItem();
        if (item) {
          handleSelect(item.data);
        }
      }
    }
  };

  const activeIndex = controllerRef.current.getActiveIndex();
  const activeItemId = activeIndex >= 0 && items[activeIndex] ? `product-opt-${items[activeIndex].id}` : undefined;

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={setSearchRef}
          placeholder="Search product by name, SKU or scan barcode..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setDropdownOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setDropdownOpen(true)}
          className="pl-8 h-9 text-xs font-medium"
          role="combobox"
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={activeItemId}
          aria-label="Product search"
          autoComplete="off"
        />
      </div>

      {dropdownOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Product suggestions"
          className="absolute top-full left-0 right-0 z-50 mt-1 border rounded-md bg-popover shadow-lg max-h-64 overflow-y-auto"
        >
          {isLoading ? (
            <div className="p-2 space-y-1.5">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">
              {debouncedSearch
                ? `No products found matching "${debouncedSearch}"`
                : "Start typing or scan barcode to search products"}
            </p>
          ) : (
            items.map((item, idx) => {
              const isHighlighted = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  id={`product-opt-${item.id}`}
                  role="option"
                  aria-selected={isHighlighted}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={[
                    "w-full flex items-center justify-between px-3 py-2 text-left transition-colors text-xs border-b last:border-0",
                    isHighlighted ? "bg-accent text-accent-foreground font-bold" : "hover:bg-accent/50",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="truncate">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        SKU: {item.sku || "N/A"} · Selling: ₹{item.defaultSellingPrice ?? 0}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {item.requiresSerialNumber && (
                      <Badge variant="outline" className="text-[9px] border-indigo-300 text-indigo-700 dark:text-indigo-400">
                        Serial Required
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] font-bold">
                      ₹{item.defaultSellingPrice ?? 0}
                    </Badge>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
