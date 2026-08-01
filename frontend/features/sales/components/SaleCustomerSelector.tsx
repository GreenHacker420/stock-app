"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useCustomerSearchQuery } from "../api/sale.queries";
import { useTransactionField } from "@/components/keyboard/useTransactionField";
import { ComboboxKeyboardController } from "@/components/keyboard/ComboboxKeyboardController";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Search, X, UserPlus, ShoppingBag } from "lucide-react";
import type { SaleFormValues, CustomerMode } from "../lib/sale-types";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function SaleCustomerSelector() {
  const { token, activeShopId } = useAuthStore();
  const { setValue, watch, formState: { errors } } = useFormContext<SaleFormValues>();

  const customerMode = watch("customerMode") as CustomerMode;
  const customerId = watch("customerId");
  const customerName = watch("customerName");
  const customerPhone = watch("customerPhone");
  const customerEmail = watch("customerEmail");

  const [searchInput, setSearchInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 250);

  const controllerRef = useRef(new ComboboxKeyboardController());
  const listboxId = "customer-search-listbox";

  // Register with FocusRegistry
  const { setRef: setSearchRef } = useTransactionField<HTMLInputElement>({
    id: "sale.customer.search",
    zoneId: "CUSTOMER_SEARCH",
  });

  const { data: customers = [], isLoading } = useCustomerSearchQuery({
    token,
    shopId: activeShopId,
    search: debouncedSearch,
    enabled: dropdownOpen && customerMode === "existing",
  });

  useEffect(() => {
    const items = customers.map((c) => ({ id: c.id, label: c.name, data: c }));
    controllerRef.current.setItems(items);
  }, [customers]);

  useEffect(() => {
    controllerRef.current.setOpen(dropdownOpen);
  }, [dropdownOpen]);

  const handleSelectMode = (mode: CustomerMode) => {
    setValue("customerMode", mode, { shouldDirty: true });
    setValue("customerId", "");
    setValue("customerName", "");
    setValue("customerPhone", "");
    setValue("customerEmail", "");
    setSearchInput("");
    setDropdownOpen(mode === "existing");
    setValue("isWalkin", mode === "walkin");
  };

  const handleSelectCustomer = useCallback((c: { id: string; name: string; phone: string | null; outstandingAmount?: string | null }) => {
    setValue("customerId", c.id, { shouldDirty: true });
    setValue("customerName", c.name);
    setValue("customerPhone", c.phone ?? "");
    setSearchInput(c.name);
    setDropdownOpen(false);
  }, [setValue]);

  const handleClearCustomer = () => {
    setValue("customerId", "");
    setValue("customerName", "");
    setSearchInput("");
    setDropdownOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const res = controllerRef.current.handleKeyDown(e.nativeEvent);
    if (res.handled) {
      if (res.action === "SELECT") {
        const item = controllerRef.current.getActiveItem();
        if (item) {
          handleSelectCustomer(item.data);
        }
      }
    }
  };

  const activeIndex = controllerRef.current.getActiveIndex();
  const activeItemId = activeIndex >= 0 && customers[activeIndex] ? `customer-opt-${customers[activeIndex].id}` : undefined;

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Customer
        </label>
        <div className="flex items-center gap-2 flex-wrap" role="toolbar" aria-label="Customer Mode Selection">
          <Button
            type="button"
            size="sm"
            variant={customerMode === "existing" ? "default" : "outline"}
            onClick={() => handleSelectMode("existing")}
            className="h-8 text-xs gap-1.5"
          >
            <User className="h-3 w-3" />
            Existing Customer
          </Button>
          <Button
            type="button"
            size="sm"
            variant={customerMode === "walkin" ? "default" : "outline"}
            onClick={() => handleSelectMode("walkin")}
            className="h-8 text-xs gap-1.5"
          >
            <ShoppingBag className="h-3 w-3" />
            Walk-in
          </Button>
          <Button
            type="button"
            size="sm"
            variant={customerMode === "capture" ? "default" : "outline"}
            onClick={() => handleSelectMode("capture")}
            className="h-8 text-xs gap-1.5"
          >
            <UserPlus className="h-3 w-3" />
            Capture Info
          </Button>
        </div>
      </div>

      {/* Existing customer search */}
      {customerMode === "existing" && (
        <div className="relative">
          {customerId ? (
            <div className="flex items-center gap-2 p-2 border rounded-md bg-primary/5 border-primary/30">
              <User className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold truncate block">{customerName}</span>
                {customerPhone && (
                  <span className="text-[10px] text-muted-foreground">{customerPhone}</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleClearCustomer}
                className="p-1 rounded hover:bg-destructive/10"
                aria-label="Clear customer"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={setSearchRef}
                placeholder="Search customer by name or phone (F4)..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setDropdownOpen(true);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setDropdownOpen(true)}
                className="pl-8 h-9 text-xs"
                role="combobox"
                aria-expanded={dropdownOpen}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                aria-activedescendant={activeItemId}
                aria-label="Customer search"
                aria-keyshortcuts="F4"
                autoComplete="off"
              />
              {dropdownOpen && (
                <div
                  id={listboxId}
                  role="listbox"
                  aria-label="Customer suggestions"
                  className="absolute top-full left-0 right-0 z-50 mt-1 border rounded-md bg-popover shadow-md max-h-56 overflow-y-auto"
                >
                  {isLoading ? (
                    <div className="p-2 space-y-1.5">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : customers.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">
                      {debouncedSearch ? `No customers found for "${debouncedSearch}"` : "Start typing to search customers"}
                    </p>
                  ) : (
                    customers.map((c, idx) => {
                      const isHighlighted = idx === activeIndex;
                      return (
                        <button
                          key={c.id}
                          id={`customer-opt-${c.id}`}
                          role="option"
                          aria-selected={isHighlighted}
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className={[
                            "w-full flex items-center justify-between px-3 py-2 text-left transition-colors text-xs border-b last:border-0",
                            isHighlighted ? "bg-accent text-accent-foreground font-bold" : "hover:bg-accent/50",
                          ].join(" ")}
                        >
                          <div>
                            <div className="font-semibold">{c.name}</div>
                            <div className="text-muted-foreground text-[10px]">
                              {c.phone || "No phone"} · {c.type}
                            </div>
                          </div>
                          {c.outstandingAmount && Number(c.outstandingAmount) > 0 && (
                            <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-300 shrink-0">
                              ₹{Number(c.outstandingAmount).toLocaleString("en-IN")} due
                            </Badge>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
          {errors.customerId && (
            <p className="text-xs text-destructive mt-1">{errors.customerId.message}</p>
          )}
        </div>
      )}

      {/* Walk-in mode */}
      {customerMode === "walkin" && (
        <div className="p-2.5 rounded-md bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-xs">
          <p className="font-bold text-amber-800 dark:text-amber-400">Walk-in Customer</p>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            Sale will be linked to the shop&apos;s walk-in account. Must be fully paid before submission.
          </p>
        </div>
      )}

      {/* Capture info mode */}
      {customerMode === "capture" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Name</label>
            <Input
              value={customerName}
              onChange={(e) => setValue("customerName", e.target.value, { shouldDirty: true })}
              placeholder="Customer name"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Phone</label>
            <Input
              value={customerPhone}
              onChange={(e) => setValue("customerPhone", e.target.value, { shouldDirty: true })}
              placeholder="Phone number"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Email</label>
            <Input
              value={customerEmail}
              onChange={(e) => setValue("customerEmail", e.target.value, { shouldDirty: true })}
              placeholder="Optional email"
              className="h-8 text-xs"
              type="email"
            />
          </div>
        </div>
      )}
    </div>
  );
}
