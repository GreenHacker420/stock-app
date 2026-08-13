"use client";

import { useCallback, useEffect, useMemo, useState, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { useFormContext } from "react-hook-form";
import { CornerDownLeft, Loader2, Search, ShoppingBag, User, UserPlus, X } from "lucide-react";

import { focusRegistry } from "@/components/keyboard/focus-registry";
import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { useKernelCombobox } from "@/components/keyboard/useKernelCombobox";
import { useTransactionField } from "@/components/keyboard/useTransactionField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useInfiniteCustomerSearchQuery } from "../api/sale.queries";
import type { CustomerMode, SaleFormValues } from "../lib/sale-types";
import { HighlightText } from "./SaleItemSearch";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

function focusVoucherField(fieldId: string, zoneId: string) {
  requestAnimationFrame(() => {
    focusRegistry.setMode("NAVIGATION");
    focusRegistry.setActiveField(fieldId, zoneId);
  });
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
  const listboxId = "customer-search-listbox";

  const { setRef: setSearchRef, onFocus: onSearchFocus, isActive: isSearchActive } = useTransactionField<HTMLInputElement>({
    id: "sale.customer.search",
    zoneId: "CUSTOMER_SEARCH",
    order: 10,
  });
  const { setRef: setSelectedCustomerRef, onFocus: onSelectedCustomerFocus, isActive: isSelectedCustomerActive } = useTransactionField<HTMLDivElement>({
    id: "sale.customer.selected",
    zoneId: "CUSTOMER_SEARCH",
    order: 10,
  });
  const { setRef: setCaptureNameRef, onFocus: onCaptureNameFocus } = useTransactionField<HTMLInputElement>({
    id: "sale.customer.capture.name",
    zoneId: "SALE_HEADER",
    order: 10,
  });
  const { setRef: setCapturePhoneRef, onFocus: onCapturePhoneFocus } = useTransactionField<HTMLInputElement>({
    id: "sale.customer.capture.phone",
    zoneId: "SALE_HEADER",
    order: 11,
  });
  const { setRef: setCaptureEmailRef, onFocus: onCaptureEmailFocus } = useTransactionField<HTMLInputElement>({
    id: "sale.customer.capture.email",
    zoneId: "SALE_HEADER",
    order: 12,
  });
  const dropdownVisible = dropdownOpen && isSearchActive;

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteCustomerSearchQuery({
    token,
    shopId: activeShopId,
    search: debouncedSearch,
    enabled: dropdownVisible && customerMode === "existing",
  });

  const customers = useMemo(() => data?.pages.flatMap((page) => page) ?? [], [data]);

  const handleSelectCustomer = useCallback((customer: { id: string; name: string; phone: string | null }) => {
    setValue("customerId", customer.id, { shouldDirty: true });
    setValue("customerName", customer.name);
    setValue("customerPhone", customer.phone ?? "");
    setSearchInput(customer.name);
    setDropdownOpen(false);
    focusVoucherField("sale.header.date", "SALE_HEADER");
  }, [setValue]);

  const combobox = useKernelCombobox({
    id: "sale.customer",
    open: dropdownVisible,
    items: customers,
    onOpenChange: setDropdownOpen,
    onSelect: handleSelectCustomer,
    queryEmpty: searchInput.length === 0,
  });

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && combobox.activeIndex >= customers.length - 4) void fetchNextPage();
  }, [combobox.activeIndex, customers.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    if (dropdownVisible && combobox.activeIndex >= 0 && customers[combobox.activeIndex]) {
      const activeId = customers[combobox.activeIndex].id;
      document.getElementById(`customer-opt-${activeId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [combobox.activeIndex, customers, dropdownVisible]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (scrollHeight - (scrollTop + clientHeight) < 100 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  };

  const handleSelectMode = (mode: CustomerMode) => {
    setValue("customerMode", mode, { shouldDirty: true });
    setValue("customerId", "");
    setValue("customerName", "");
    setValue("customerPhone", "");
    setValue("customerEmail", "");
    setSearchInput("");
    combobox.resetActiveIndex();
    setDropdownOpen(mode === "existing");
    setValue("isWalkin", mode === "walkin");

    if (mode === "existing") focusVoucherField("sale.customer.search", "CUSTOMER_SEARCH");
    else if (mode === "capture") focusVoucherField("sale.customer.capture.name", "SALE_HEADER");
    else focusVoucherField("sale.header.date", "SALE_HEADER");
  };

  const handleClearCustomer = useCallback(() => {
    setValue("customerId", "");
    setValue("customerName", "");
    setSearchInput("");
    combobox.resetActiveIndex();
    setDropdownOpen(true);
    focusVoucherField("sale.customer.search", "CUSTOMER_SEARCH");
  }, [combobox, setValue]);

  const selectedCustomerWhen = "transaction.active && sale.customerSelected && !dialog.open && !combobox.open";
  const selectedCustomerCommand = useMemo(() => ({
    id: "sale.customer.clearSelected",
    title: "Clear selected customer",
    category: "Sale Entry",
    when: selectedCustomerWhen,
    execute: handleClearCustomer,
  }), [handleClearCustomer]);
  useCommand(selectedCustomerCommand);
  useKeybinding(useMemo(() => ({ id: "sale-customer-selected-backspace", key: "backspace", command: selectedCustomerCommand.id, when: selectedCustomerWhen, priority: 120 }), [selectedCustomerCommand.id]));
  useKeybinding(useMemo(() => ({ id: "sale-customer-selected-delete", key: "delete", command: selectedCustomerCommand.id, when: selectedCustomerWhen, priority: 120 }), [selectedCustomerCommand.id]));

  const activeItemId = combobox.activeIndex >= 0 && customers[combobox.activeIndex]
    ? `customer-opt-${customers[combobox.activeIndex].id}`
    : undefined;
  const selectedCustomerScope = JSON.stringify({ "sale.customerSelected": true, "keyboard.scope": "customer-selected" });

  const renderTallyCustomerSideDialog = () => {
    if (!dropdownVisible || customerMode !== "existing" || typeof document === "undefined") return null;

    return createPortal(
      <aside id={listboxId} role="listbox" aria-label="List of Ledger Accounts" data-keyboard-scope={combobox.scope} className="fixed right-4 top-24 z-50 flex max-h-[calc(100vh-130px)] w-[clamp(320px,28vw,420px)] flex-col overflow-hidden rounded-xl border border-sky-300/80 bg-sky-50/95 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-right-4 duration-200 dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-black/70">
        <div className="flex items-center justify-between border-b border-sky-200/80 bg-gradient-to-r from-sky-700 to-sky-800 px-4 py-2.5 text-white dark:border-zinc-700 dark:from-zinc-800 dark:to-zinc-900">
          <div><h3 className="flex items-center gap-1.5 font-mono text-xs font-black uppercase tracking-wider"><User className="size-4" /><span>List of Ledger Accounts</span></h3><p className="mt-0.5 text-[10px] font-medium text-sky-100 dark:text-zinc-400">Use ↑/↓ to navigate · Enter to select · Esc to close</p></div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="border border-sky-600/40 bg-sky-900/80 font-mono text-[10px] font-bold text-sky-100">{customers.length}{hasNextPage ? "+" : ""} accounts</Badge>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setDropdownOpen(false)} className="rounded-md p-1 text-sky-200 hover:bg-sky-600 hover:text-white dark:text-zinc-400 dark:hover:bg-zinc-700" aria-label="Close List of Ledger Accounts"><X className="size-4" /></button>
          </div>
        </div>

        <div onScroll={handleScroll} className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-1.5">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => handleSelectMode("walkin")} className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs font-bold text-sky-800 transition-colors hover:bg-sky-100/60 dark:text-sky-300 dark:hover:bg-zinc-800"><span>◆ Walk-in Cash Customer</span><span className="font-mono text-[10px] font-normal text-muted-foreground">Switch</span></button>
          <div className="my-1 h-px bg-sky-200/50 dark:bg-zinc-800" />

          {isLoading ? (
            <div className="space-y-2 p-2"><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /></div>
          ) : customers.length === 0 ? (
            <div className="p-6 text-center text-xs font-medium text-muted-foreground">{debouncedSearch ? `No customers found for "${debouncedSearch}"` : "Start typing to search customers by name or phone"}</div>
          ) : (
            <>
              {customers.map((customer, index) => {
                const highlighted = index === combobox.activeIndex;
                return (
                  <button key={`${customer.id}-${index}`} id={`customer-opt-${customer.id}`} role="option" aria-selected={highlighted} type="button" onMouseEnter={() => combobox.setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => handleSelectCustomer(customer)} className={`group relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-all ${highlighted ? "bg-amber-400 font-black text-slate-950 shadow-md ring-1 ring-amber-500 dark:bg-amber-400 dark:text-slate-950" : "font-semibold text-slate-900 hover:bg-sky-100/70 dark:text-slate-100 dark:hover:bg-zinc-800/80"}`}>
                    <div className="flex min-w-0 items-center gap-2.5"><User className={`size-4 shrink-0 ${highlighted ? "text-slate-950" : "text-sky-700 dark:text-sky-400"}`} /><div className="truncate"><div className="truncate text-xs"><HighlightText text={customer.name} search={debouncedSearch} /></div><div className={`font-mono text-[10px] ${highlighted ? "text-slate-900/90" : "text-muted-foreground"}`}>{customer.phone ? <HighlightText text={customer.phone} search={debouncedSearch} /> : "No phone"} · {customer.type}</div></div></div>
                    <div className="ml-3 flex shrink-0 items-center gap-2">
                      {customer.outstandingAmount && Number(customer.outstandingAmount) > 0 ? <Badge variant="outline" className={`text-[9px] font-bold ${highlighted ? "border-slate-950/40 bg-slate-950/10 text-slate-950" : "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"}`}>₹{Number(customer.outstandingAmount).toLocaleString("en-IN")} due</Badge> : null}
                      {highlighted ? <CornerDownLeft className="ml-1 size-3.5 text-slate-950" /> : null}
                    </div>
                  </button>
                );
              })}
              {isFetchingNextPage ? <div className="flex items-center justify-center gap-2 py-3 text-xs font-semibold text-sky-800 dark:text-sky-300"><Loader2 className="size-3.5 animate-spin" /><span>Loading more accounts...</span></div> : null}
            </>
          )}
        </div>
      </aside>,
      document.body,
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Customer</label>
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Customer Mode Selection">
          <Button type="button" size="sm" variant={customerMode === "existing" ? "default" : "outline"} onClick={() => handleSelectMode("existing")} className="h-8 gap-1.5 text-xs"><User className="h-3 w-3" />Existing Customer</Button>
          <Button type="button" size="sm" variant={customerMode === "walkin" ? "default" : "outline"} onClick={() => handleSelectMode("walkin")} className="h-8 gap-1.5 text-xs"><ShoppingBag className="h-3 w-3" />Walk-in</Button>
          <Button type="button" size="sm" variant={customerMode === "capture" ? "default" : "outline"} onClick={() => handleSelectMode("capture")} className="h-8 gap-1.5 text-xs"><UserPlus className="h-3 w-3" />Capture Info</Button>
        </div>
      </div>

      {customerMode === "existing" && (
        <div className="relative">
          {customerId ? (
            <div ref={setSelectedCustomerRef} tabIndex={isSelectedCustomerActive ? 0 : -1} onFocus={onSelectedCustomerFocus} data-keyboard-scope={selectedCustomerScope} className={`flex items-center gap-2 rounded-md border p-2 outline-none transition-all ${isSelectedCustomerActive ? "border-primary bg-primary/10 ring-2 ring-primary" : "border-primary/30 bg-primary/5"}`}>
              <User className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{customerName}</span>{customerPhone ? <span className="text-[10px] text-muted-foreground">{customerPhone}</span> : null}</div><button type="button" onClick={handleClearCustomer} className="rounded p-1 hover:bg-destructive/10" aria-label="Clear customer"><X className="h-3 w-3 text-muted-foreground" /></button>
            </div>
          ) : (
            <div className="relative" data-keyboard-scope={combobox.scope}>
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input ref={setSearchRef} placeholder="Search customer by name or phone (F4)..." value={searchInput} tabIndex={isSearchActive ? 0 : -1} onChange={(event) => { setSearchInput(event.target.value); focusRegistry.setActiveField("sale.customer.search", "CUSTOMER_SEARCH"); combobox.resetActiveIndex(); setDropdownOpen(true); }} onFocus={() => { onSearchFocus(); setDropdownOpen(true); }} onClick={() => { focusRegistry.setActiveField("sale.customer.search", "CUSTOMER_SEARCH"); setDropdownOpen(true); }} onBlur={(event) => { if (!event.relatedTarget || !event.relatedTarget.closest(`#${listboxId}`)) setDropdownOpen(false); }} className={`h-9 pl-8 text-xs font-semibold ${isSearchActive ? "border-primary ring-2 ring-primary" : ""}`} role="combobox" aria-expanded={dropdownVisible} aria-haspopup="listbox" aria-controls={listboxId} aria-activedescendant={activeItemId} aria-label="Customer search" aria-keyshortcuts="F4" autoComplete="off" />
              {renderTallyCustomerSideDialog()}
            </div>
          )}
        </div>
      )}

      {customerMode === "capture" && (
        <div className="space-y-2 rounded-md border p-3">
          <div><label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Customer Name *</label><Input ref={setCaptureNameRef} onFocus={onCaptureNameFocus} placeholder="Full name" value={customerName} onChange={(event) => setValue("customerName", event.target.value, { shouldDirty: true })} className="h-8 text-xs" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Phone Number</label><Input ref={setCapturePhoneRef} onFocus={onCapturePhoneFocus} placeholder="10-digit mobile" value={customerPhone} onChange={(event) => setValue("customerPhone", event.target.value, { shouldDirty: true })} className="h-8 text-xs font-mono" /></div>
            <div><label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Email Address</label><Input ref={setCaptureEmailRef} onFocus={onCaptureEmailFocus} placeholder="Email (optional)" value={customerEmail} onChange={(event) => setValue("customerEmail", event.target.value, { shouldDirty: true })} className="h-8 text-xs" /></div>
          </div>
        </div>
      )}

      {errors.customerId?.message && <p className="text-xs font-bold text-destructive">{errors.customerId.message}</p>}
    </div>
  );
}
