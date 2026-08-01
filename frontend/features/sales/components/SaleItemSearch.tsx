"use client";

import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useItemSearchQuery } from "../api/sale.queries";
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
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useItemSearchQuery({
    token,
    shopId: activeShopId,
    search: debouncedSearch,
    enabled: dropdownOpen,
  });

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const handleSelect = (item: ItemWithStock) => {
    onSelectItem(item);
    setSearchInput("");
    setDropdownOpen(false);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder="Search product by name, SKU or scan barcode..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          className="pl-8 h-9 text-xs font-medium"
          aria-label="Product search"
          autoComplete="off"
        />
      </div>

      {dropdownOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 border rounded-md bg-popover shadow-lg max-h-64 overflow-y-auto">
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
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent transition-colors text-xs border-b last:border-0"
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
            ))
          )}
        </div>
      )}
    </div>
  );
}
