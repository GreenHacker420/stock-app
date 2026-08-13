"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, RefreshCw, Search, UserRound, UsersRound, WalletCards } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { fetchCustomersRegister } from "@/features/registers/api/register.queries";
import type { CustomerRegisterRow } from "@/features/registers/lib/register-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { drilldownStack } from "@/lib/navigation/drilldown-stack";
import { consumeNavigationRestoration, peekNavigationRestoration, restoreNavigationFrame } from "@/lib/navigation/navigation-restoration";
import { queryKeys } from "@/lib/query/query-keys";
import { formatINR } from "@/lib/utils";

const PAGE_SIZE = 50;
const REPORT_ID = "customers.register";
const CUSTOMER_TYPES: CustomerRegisterRow["type"][] = ["REGULAR", "BUSINESS", "WALK_IN"];

export default function CustomersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, shops, activeShopId } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const typeParam = searchParams.get("type");
  const type = CUSTOMER_TYPES.includes(typeParam as CustomerRegisterRow["type"])
    ? typeParam as CustomerRegisterRow["type"]
    : undefined;
  const restoration = peekNavigationRestoration(pathname);
  const initialSearch = searchParams.get("search") || "";
  const restoredSearchDraft = restoration?.filters?.searchDraft;
  const restoredSearch = restoration?.filters?.search;
  const [searchDraft, setSearchDraft] = useState(() => typeof restoredSearchDraft === "string" ? restoredSearchDraft : initialSearch);
  const [search, setSearch] = useState(() => typeof restoredSearch === "string" ? restoredSearch : initialSearch);
  const searchRef = useRef<HTMLInputElement>(null);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const normalized = searchDraft.trim();
      setSearch(normalized);
      if (normalized !== (searchParams.get("search") || "")) {
        setParams({ search: normalized || null, page: null });
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchDraft, searchParams, setParams]);

  const query = useQuery({
    queryKey: queryKeys.customers.register({ shopId, page, limit: PAGE_SIZE, search, type }),
    queryFn: () => fetchCustomersRegister(token ?? "", {
      shopId,
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      type,
      includeWalkin: type === "WALK_IN" ? true : undefined,
    }),
    enabled: Boolean(token && shopId),
    placeholderData: (previous) => previous,
    staleTime: 45_000,
  });

  useEffect(() => {
    if (!restoration || query.isLoading || !query.data) return;
    restoreNavigationFrame(restoration);
    consumeNavigationRestoration(pathname);
  }, [pathname, query.data, query.isLoading, restoration]);

  const totals = useMemo(() => (query.data ?? []).reduce((acc, customer) => {
    acc.outstanding += Number(customer.outstandingAmount || 0);
    acc.advance += Number(customer.advanceBalance || 0);
    if (customer.type === "BUSINESS") acc.business += 1;
    if (Number(customer.outstandingAmount || 0) > 0) acc.dueCount += 1;
    return acc;
  }, { outstanding: 0, advance: 0, business: 0, dueCount: 0 }), [query.data]);

  const columns = useMemo<ColumnDef<CustomerRegisterRow>[]>(() => [
    { accessorKey: "name", header: "Customer", cell: ({ row }) => <div className="min-w-[clamp(10rem,17vw,18rem)]"><div className="truncate font-semibold">{row.original.name}</div><div className="truncate text-[10px] text-muted-foreground">{row.original.contactPerson || row.original.email || ""}</div></div> },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{row.original.phone || "—"}</span> },
    { accessorKey: "city", header: "City", cell: ({ row }) => <span className="text-muted-foreground">{row.original.city || "—"}</span> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.type.replaceAll("_", " ")}</Badge> },
    { accessorKey: "creditLimit", header: "Credit limit", cell: ({ row }) => <span className="numeric-cell block text-right text-muted-foreground">{row.original.creditLimit == null ? "—" : formatINR(row.original.creditLimit)}</span> },
    { accessorKey: "advanceBalance", header: "Advance", cell: ({ row }) => <span className="numeric-cell block text-right text-emerald-700 dark:text-emerald-300">{formatINR(row.original.advanceBalance)}</span> },
    { accessorKey: "outstandingAmount", header: "Outstanding", cell: ({ row }) => <span className={`numeric-cell block text-right font-semibold ${Number(row.original.outstandingAmount) > 0 ? "text-rose-600 dark:text-rose-300" : "text-muted-foreground"}`}>{formatINR(row.original.outstandingAmount)}</span> },
  ], []);

  const openCustomer = useCallback((customer: CustomerRegisterRow) => {
    drilldownStack.push({
      route: pathname,
      searchParams: searchParams.toString(),
      module: "customers",
      view: REPORT_ID,
      activePointer: activePointerStore.getPointer(),
      selectedIds: [...activePointerStore.getSelectedIds()],
      filters: { searchDraft, search, type },
      page,
      scrollOffset: window.scrollY,
    });
    router.push(`/customers/${customer.id}`);
  }, [page, pathname, router, search, searchDraft, searchParams, type]);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  const searchEscapeCommand = useMemo(() => ({
    id: "customers.register.search.close",
    title: "Return to Customer Register",
    execute: ({ target }: { target?: EventTarget | null }) => {
      if (target instanceof HTMLElement) target.blur();
      const pointer = activePointerStore.getPointer();
      const index = pointer?.zoneId === `${REPORT_ID}.rows` ? pointer.index : 0;
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-operational-report="${REPORT_ID}"] [data-operational-row="${index}"]`)?.focus();
      });
    },
  }), []);
  useCommand(searchEscapeCommand);
  useKeybinding(useMemo(() => ({
    id: "customers-register-search-escape",
    key: "esc",
    command: searchEscapeCommand.id,
    when: "customers.search && report.id == customers.register && input.editable && !dialog.open",
    priority: 170,
  }), [searchEscapeCommand.id]));

  const workspaceScope = JSON.stringify({ "app.module": "customers", "app.view": REPORT_ID, "customers.focused": true, "keyboard.scope": "workspace" });
  const searchScope = JSON.stringify({ "report.focused": true, "report.id": REPORT_ID, "customers.search": true, "keyboard.scope": "report.search" });

  return (
    <div data-keyboard-scope={workspaceScope}>
      <WorkspacePage>
        <WorkspacePageHeader
          kicker="Records · Accounts"
          title="Customer directory"
          description="Shop-scoped customer master with server-side name, phone, city, GSTIN and contact-person search. Open a row for ledger and activity details."
          icon={UsersRound}
          actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button>}
        />

        <WorkspaceMetricGrid>
          <WorkspaceMetric label="Customers on page" value={(query.data ?? []).length} detail={`Page ${page} · server searched`} icon={UserRound} loading={query.isLoading} />
          <WorkspaceMetric label="Outstanding" value={formatINR(totals.outstanding)} detail={`${totals.dueCount} customers with due balance on this page`} icon={WalletCards} tone={totals.outstanding > 0 ? "warning" : "neutral"} loading={query.isLoading} />
          <WorkspaceMetric label="Advance balances" value={formatINR(totals.advance)} detail="Customer credit held on this page" icon={WalletCards} tone={totals.advance > 0 ? "success" : "neutral"} loading={query.isLoading} />
          <WorkspaceMetric label="Business accounts" value={totals.business} detail="BUSINESS customers on current page" icon={Building2} tone="info" loading={query.isLoading} />
        </WorkspaceMetricGrid>

        <WorkspacePanel title="Customer master" description="Search and customer type are sent to the backend. Walk-in customers stay excluded unless explicitly selected.">
          <WorkspaceToolbar>
            <div className="relative w-[clamp(14rem,30vw,34rem)] max-w-full flex-1 sm:flex-none" data-keyboard-scope={searchScope}>
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input ref={searchRef} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search name, phone, city, GSTIN or contact person…" className="h-9 bg-background pl-9 text-xs" aria-label="Search customers" aria-keyshortcuts="Control+F" />
            </div>
            <DropdownMenu><DropdownMenuTrigger className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">{type ? type.replaceAll("_", " ") : "Regular + business"}</DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>Customer type</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={() => setParams({ type: null, page: null })}>Regular + business</DropdownMenuItem>{CUSTOMER_TYPES.map((item) => <DropdownMenuItem key={item} onClick={() => setParams({ type: item, page: null })}>{item.replaceAll("_", " ")}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
          </WorkspaceToolbar>

          <OperationalDataTable
            id={REPORT_ID}
            data={query.data ?? []}
            columns={columns}
            getRowId={(customer) => customer.id}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => void query.refetch()}
            onRowOpen={openCustomer}
            onFilterRequest={focusSearch}
            autoFocus
            emptyTitle="No customers found"
            emptyDescription={search ? "No customer matched the server search." : "No customers are available for this shop and type filter."}
            renderMobileCard={(customer) => <div className="rounded-xl bg-card p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{customer.name}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{customer.phone || "No phone"}</p><p className="mt-1 text-[10px] text-muted-foreground">{customer.city || "No city"}</p></div><Badge variant="secondary" className="text-[9px]">{customer.type.replaceAll("_", " ")}</Badge></div><div className="mt-3 flex items-end justify-between border-t pt-2"><span className="text-[10px] text-muted-foreground">Advance {formatINR(customer.advanceBalance)}</span><div className="text-right"><p className="workspace-kicker">Outstanding</p><p className={`numeric-cell mt-0.5 text-sm font-semibold ${Number(customer.outstandingAmount) > 0 ? "text-rose-600" : ""}`}>{formatINR(customer.outstandingAmount)}</p></div></div></div>}
          />

          <div className="flex items-center justify-between border-t bg-muted/20 px-[clamp(0.7rem,1vw,1rem)] py-2.5 text-[10px] text-muted-foreground"><span>Page {page} · {(query.data ?? []).length} records</span><div className="flex gap-1.5"><Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</Button><Button variant="outline" size="sm" className="h-8" disabled={(query.data ?? []).length < PAGE_SIZE} onClick={() => setParams({ page: String(page + 1) })}>Next</Button></div></div>
        </WorkspacePanel>
      </WorkspacePage>
    </div>
  );
}
