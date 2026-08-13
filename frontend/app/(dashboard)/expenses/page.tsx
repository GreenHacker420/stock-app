"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Clock3, ReceiptIndianRupee, RefreshCw, Search, XCircle } from "lucide-react";

import { OperationalDataTable } from "@/components/data-grid/OperationalDataTable";
import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel, WorkspaceToolbar } from "@/components/workspace/WorkspacePage";
import { verifyExpense } from "@/features/registers/api/register.mutations";
import { fetchExpensesRegister } from "@/features/registers/api/register.queries";
import type { ExpenseRegisterRow } from "@/features/registers/lib/register-types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { hasPermission, PERMISSIONS } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { formatDate, formatINR } from "@/lib/utils";

const REPORT_ID = "expenses.register";

function expenseBadge(status: string) {
  if (status === "APPROVED") return <Badge className="bg-emerald-600 text-[9px] text-white">Approved</Badge>;
  if (status === "REJECTED") return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">Rejected</Badge>;
  return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Pending</Badge>;
}

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const { token, shops, activeShopId, user } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";
  const [filter, setFilter] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const canVerify = hasPermission(user, PERMISSIONS.EXPENSE_VERIFY);

  const query = useQuery({ queryKey: queryKeys.expenses.list(shopId), queryFn: () => fetchExpensesRegister(token ?? "", shopId), enabled: Boolean(token && shopId), staleTime: 30_000 });
  const verifyMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) => verifyExpense(token ?? "", id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.expenses.list(shopId) });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const rows = useMemo(() => {
    const value = filter.trim().toLowerCase();
    if (!value) return query.data ?? [];
    return (query.data ?? []).filter((expense) => expense.category.toLowerCase().includes(value) || expense.note?.toLowerCase().includes(value) || expense.createdBy?.name?.toLowerCase().includes(value));
  }, [filter, query.data]);

  const totals = useMemo(() => (query.data ?? []).reduce((acc, expense) => {
    const amount = Number(expense.amount);
    acc.total += amount;
    if (expense.status === "APPROVED") acc.approved += amount;
    else if (expense.status === "REJECTED") acc.rejected += amount;
    else acc.pending += amount;
    return acc;
  }, { total: 0, approved: 0, pending: 0, rejected: 0 }), [query.data]);

  const columns = useMemo<ColumnDef<ExpenseRegisterRow>[]>(() => [
    { accessorKey: "createdAt", header: "Date", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    { accessorKey: "category", header: "Category", cell: ({ row }) => <Badge variant="secondary" className="text-[9px]">{row.original.category}</Badge> },
    { accessorKey: "note", header: "Note", cell: ({ row }) => <div className="min-w-[clamp(12rem,24vw,30rem)] truncate text-muted-foreground" title={row.original.note || undefined}>{row.original.note || "—"}</div> },
    { id: "createdBy", header: "Recorded by", cell: ({ row }) => <span className="text-muted-foreground">{row.original.createdBy?.name || "—"}</span> },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="numeric-cell block text-right font-semibold">{formatINR(row.original.amount)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <div className="text-right">{expenseBadge(row.original.status)}</div> },
    { id: "actions", header: "Action", cell: ({ row }) => {
      const pending = !["APPROVED", "REJECTED"].includes(row.original.status);
      if (!canVerify || !pending) return <span className="block text-right text-[10px] text-muted-foreground">—</span>;
      return <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-emerald-700" disabled={verifyMutation.isPending} onClick={(event) => { event.stopPropagation(); verifyMutation.mutate({ id: row.original.id, status: "APPROVED" }); }}>Approve</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-rose-700" disabled={verifyMutation.isPending} onClick={(event) => { event.stopPropagation(); verifyMutation.mutate({ id: row.original.id, status: "REJECTED" }); }}>Reject</Button></div>;
    } },
  ], [canVerify, verifyMutation]);

  const focusSearch = useCallback(() => { searchRef.current?.focus(); searchRef.current?.select(); }, []);
  const searchEscapeCommand = useMemo(() => ({
    id: "expenses.register.search.close",
    title: "Return to Expense Register",
    execute: ({ target }: { target?: EventTarget | null }) => {
      if (target instanceof HTMLElement) target.blur();
      const pointer = activePointerStore.getPointer();
      const index = pointer?.zoneId === `${REPORT_ID}.rows` ? pointer.index : 0;
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-operational-report="${REPORT_ID}"] [data-operational-row="${index}"]`)?.focus());
    },
  }), []);
  useCommand(searchEscapeCommand);
  useKeybinding(useMemo(() => ({ id: "expenses-register-search-escape", key: "esc", command: searchEscapeCommand.id, when: "expenses.search && report.id == expenses.register && input.editable && !dialog.open", priority: 170 }), [searchEscapeCommand.id]));

  const workspaceScope = JSON.stringify({ "app.module": "expenses", "app.view": REPORT_ID, "expenses.focused": true, "mutation.pending": verifyMutation.isPending, "keyboard.scope": "workspace" });
  const searchScope = JSON.stringify({ "report.focused": true, "report.id": REPORT_ID, "expenses.search": true, "keyboard.scope": "report.search" });

  return (
    <div data-keyboard-scope={workspaceScope}>
      <WorkspacePage>
        <WorkspacePageHeader kicker="Control · Cash" title="Expense register" description="Cash-session expenses with the backend verification workflow. The UI no longer invents a payment mode or a description field that the expense API does not have." icon={ReceiptIndianRupee} actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button>} />
        <WorkspaceMetricGrid><WorkspaceMetric label="Recorded" value={formatINR(totals.total)} detail={`${(query.data ?? []).length} expense records`} icon={ReceiptIndianRupee} loading={query.isLoading} /><WorkspaceMetric label="Approved" value={formatINR(totals.approved)} detail="Owner-approved expense value" icon={CheckCircle2} tone="success" loading={query.isLoading} /><WorkspaceMetric label="Pending" value={formatINR(totals.pending)} detail="Awaiting verification" icon={Clock3} tone={totals.pending > 0 ? "warning" : "neutral"} loading={query.isLoading} /><WorkspaceMetric label="Rejected" value={formatINR(totals.rejected)} detail="Rejected expense value" icon={XCircle} tone={totals.rejected > 0 ? "danger" : "neutral"} loading={query.isLoading} /></WorkspaceMetricGrid>

        <WorkspacePanel title="Expense activity" description="The current backend expense list returns the complete shop-scoped register; text filtering is therefore performed over that returned set.">
          <WorkspaceToolbar><div className="relative w-[clamp(14rem,30vw,34rem)] max-w-full flex-1 sm:flex-none" data-keyboard-scope={searchScope}><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><Input ref={searchRef} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter category, note or staff…" className="h-9 bg-background pl-9 text-xs" aria-label="Filter Expense Register" aria-keyshortcuts="Control+F" /></div>{verifyMutation.isError ? <span className="text-[10px] font-medium text-destructive">Verification failed. The register was not changed.</span> : null}</WorkspaceToolbar>
          <OperationalDataTable id={REPORT_ID} data={rows} columns={columns} getRowId={(expense) => expense.id} isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()} onFilterRequest={focusSearch} autoFocus emptyTitle="No expenses found" emptyDescription={filter ? "No expense matches the current filter." : "No expenses are recorded for the active shop."} renderMobileCard={(expense) => <div className="rounded-xl bg-card p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{expense.category}</p><p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{expense.note || "No note"}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(expense.createdAt)} · {expense.createdBy?.name || "Unknown"}</p></div>{expenseBadge(expense.status)}</div><div className="mt-3 border-t pt-2 text-right numeric-cell text-base font-semibold">{formatINR(expense.amount)}</div></div>} />
        </WorkspacePanel>
      </WorkspacePage>
    </div>
  );
}
