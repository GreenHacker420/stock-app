"use client";

import { usePathname } from "next/navigation";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";
import { useTransactionFocus } from "@/components/keyboard/TransactionFocusContext";

interface StatusBarProps {
  scope?: string;
  selectedCount?: number;
  hasUnsaved?: boolean;
}

function getRouteContext(pathname: string) {
  if (pathname.startsWith("/inventory")) return { scope: "Inventory", hint: "↑↓ Rows · Enter Open · Ctrl+F Search · F12 Configure", primary: ["Alt+G Go To", "F2 Period", "F3 Shop"] };
  if (pathname.startsWith("/sales/new")) return { scope: "Sale Entry", hint: "F4 Customer · Enter Advance · Ctrl+A Save · Esc Cancel", primary: ["Alt+G Go To", "F8 Sale", "Ctrl+A Save"] };
  if (pathname.startsWith("/sales")) return { scope: "Sales Register", hint: "↑↓ Rows · Enter Open · Ctrl+F Filter · F8 New Sale", primary: ["Alt+G Go To", "F2 Period", "F8 New Sale"] };
  if (pathname.startsWith("/customers")) return { scope: "Customers", hint: "↑↓ Rows · Enter Open · Ctrl+F Search", primary: ["Alt+G Go To", "F3 Shop", "Enter Open"] };
  if (pathname.startsWith("/orders")) return { scope: "Orders", hint: "↑↓ Rows · Ctrl+F Filter · F2 Period", primary: ["Alt+G Go To", "F2 Period", "F3 Shop"] };
  if (pathname.startsWith("/delivery-memos")) return { scope: "Delivery Memos", hint: "↑↓ Rows · Ctrl+F Filter · F2 Period", primary: ["Alt+G Go To", "F2 Period", "F3 Shop"] };
  if (pathname.startsWith("/payments")) return { scope: "Payments", hint: "↑↓ Rows · Ctrl+F Filter · Mode/Status filters", primary: ["Alt+G Go To", "F2 Period", "F3 Shop"] };
  if (pathname.startsWith("/expenses")) return { scope: "Expenses", hint: "↑↓ Rows · Ctrl+F Filter · Owner verification", primary: ["Alt+G Go To", "F3 Shop", "Enter Open"] };
  if (pathname.startsWith("/reports")) return { scope: "Reports", hint: "Enter Drill Down · F2 Period", primary: ["Alt+G Go To", "F2 Period", "Enter Open"] };
  if (pathname.startsWith("/whatsapp")) return { scope: "WhatsApp", hint: "Connection capability · Templates · Conversation tools", primary: ["Alt+G Go To", "F3 Shop", "Esc Close"] };
  if (pathname.startsWith("/administration") || pathname.startsWith("/approvals") || pathname.startsWith("/corrections") || pathname.startsWith("/cash-sessions")) return { scope: "Control", hint: "Review operational controls and approvals", primary: ["Alt+G Go To", "F3 Shop", "Esc Close"] };
  return { scope: "Workspace", hint: "Alt+G Go To · F2 Period · F3 Shop · F8 New Sale", primary: ["Alt+G Go To", "F2 Period", "F8 New Sale"] };
}

export function StatusBar({ scope: externalScope, selectedCount = 0, hasUnsaved = false }: StatusBarProps) {
  const pathname = usePathname();
  const { isMac } = useOS();
  const { activeFieldId, activeZoneId, mode } = useTransactionFocus();
  const routeContext = getRouteContext(pathname);

  let displayScope = externalScope || routeContext.scope;
  let hintText = routeContext.hint;

  if (mode === "DIALOG") {
    displayScope = "Dialog";
    hintText = "Esc Close · Enter Confirm";
  } else if (mode === "COMBOBOX") {
    displayScope = "Combobox";
    hintText = "↑↓ Navigate · Enter Select · Esc Close";
  } else if (mode === "EDITING") {
    displayScope = `Editing · ${activeFieldId || "Field"}`;
    hintText = "Enter Accept · Esc Revert · Tab Next";
  } else if (activeZoneId === "LINE_ITEM_GRID") {
    displayScope = `Item Grid · ${activeFieldId || "Items"}`;
    hintText = "←→ Cells · ↑↓ Rows · Enter Edit · Ctrl+D Remove";
  } else if (activeZoneId === "PAYMENT_GRID") {
    displayScope = `Payment Grid · ${activeFieldId || "Payments"}`;
    hintText = "←→ Cells · ↑↓ Rows · Enter Edit · Ctrl+D Remove";
  } else if (activeZoneId === "CUSTOMER_SEARCH") {
    displayScope = "Customer Search";
    hintText = "Type Name/Phone · ↑↓ Options · Enter Select · Esc Close";
  } else if (activeZoneId === "PRODUCT_SEARCH") {
    displayScope = "Product Search";
    hintText = "Type Name/SKU · ↑↓ Options · Enter Select · Esc Close";
  }

  return (
    <footer
      aria-live="polite"
      className="flex shrink-0 select-none items-center justify-between border-t bg-background px-[var(--workspace-gutter-x)] text-[clamp(0.53rem,0.58vw,0.64rem)] font-medium text-muted-foreground"
      style={{ height: "var(--shell-status-height)" }}
    >
      <div className="flex min-w-0 items-center gap-[clamp(0.45rem,0.7vw,0.8rem)]">
        <span className="flex min-w-0 items-center gap-1.5"><span className="size-1.5 shrink-0 rounded-full bg-indigo-500" /><span className="truncate"><strong className="font-semibold text-foreground">{displayScope}</strong></span></span>
        {selectedCount > 0 ? <span className="hidden font-semibold text-foreground sm:inline">{selectedCount} selected</span> : null}
        {hasUnsaved ? <span className="hidden rounded bg-amber-50 px-1.5 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 sm:inline">Unsaved</span> : null}
      </div>

      <div className="hidden min-w-0 flex-1 truncate px-[clamp(0.8rem,2vw,2.5rem)] text-center font-mono text-[clamp(0.5rem,0.54vw,0.6rem)] text-foreground/70 lg:block">{hintText}</div>

      <div className="hidden shrink-0 items-center gap-[clamp(0.5rem,0.8vw,0.9rem)] sm:flex">
        {routeContext.primary.map((entry) => {
          const firstSpace = entry.indexOf(" ");
          const key = firstSpace > 0 ? entry.slice(0, firstSpace) : entry;
          const label = firstSpace > 0 ? entry.slice(firstSpace + 1) : "";
          return <span key={entry} className="whitespace-nowrap"><kbd className="rounded border bg-muted/50 px-1 font-mono text-[8px] text-foreground/70">{formatShortcutForOS(key.toLowerCase(), isMac)}</kbd>{" "}{label}</span>;
        })}
      </div>
    </footer>
  );
}
