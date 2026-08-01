"use client";

import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";
import { useTransactionFocus } from "@/components/keyboard/TransactionFocusContext";

interface StatusBarProps {
  scope?: string;
  selectedCount?: number;
  hasUnsaved?: boolean;
}

export function StatusBar({ scope: externalScope, selectedCount = 0, hasUnsaved = false }: StatusBarProps) {
  const { isMac } = useOS();
  const { activeFieldId, activeZoneId, mode } = useTransactionFocus();

  // Dynamic scope and action hints calculation
  let displayScope = externalScope || "Global";
  let hintText = "";

  if (mode === "DIALOG") {
    displayScope = "Dialog";
    hintText = "Esc Cancel · Enter Confirm";
  } else if (mode === "COMBOBOX") {
    displayScope = "Combobox";
    hintText = "↑↓ Navigate · Enter Select · Esc Close";
  } else if (mode === "EDITING") {
    displayScope = `Editing · ${activeFieldId || ""}`;
    hintText = "Enter Accept · Esc Revert · Tab Next";
  } else if (activeZoneId === "LINE_ITEM_GRID") {
    displayScope = `Grid · ${activeFieldId || "Items"}`;
    hintText = "←→ Cells · ↑↓ Rows · Enter Edit · Ctrl+D Remove";
  } else if (activeZoneId === "PAYMENT_GRID") {
    displayScope = `Grid · ${activeFieldId || "Payments"}`;
    hintText = "←→ Cells · ↑↓ Rows · Enter Edit · Ctrl+D Remove";
  } else if (activeZoneId === "CUSTOMER_SEARCH") {
    displayScope = "Customer Search";
    hintText = "Type Name/Phone · ↓ Options · Enter Select";
  } else if (activeZoneId === "PRODUCT_SEARCH") {
    displayScope = "Product Search";
    hintText = "Type Name/SKU · ↓ Options · Enter Select";
  } else {
    hintText = "F4 Customer · Ctrl+A Save · Esc Cancel";
  }

  return (
    <footer
      aria-live="polite"
      className="h-7 border-t bg-muted/60 px-4 flex items-center justify-between text-[11px] font-medium text-muted-foreground sticky bottom-0 z-30 select-none"
    >
      {/* Left: Dynamic Keyboard Scope & Selection */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>
            Scope: <strong className="text-slate-900 dark:text-slate-100">{displayScope}</strong>
          </span>
        </span>

        {selectedCount > 0 && (
          <span className="text-primary font-bold">
            {selectedCount} row{selectedCount > 1 ? "s" : ""} selected
          </span>
        )}

        {hasUnsaved && (
          <span className="text-amber-600 font-bold bg-amber-50 dark:bg-amber-950/40 px-1.5 rounded">
            Unsaved Changes
          </span>
        )}
      </div>

      {/* Middle: Active Keyboard Hint */}
      <div className="hidden md:block text-[10px] font-mono text-slate-700 dark:text-slate-300">
        {hintText}
      </div>

      {/* Right: Primary Shortcut Hints */}
      <div className="hidden sm:flex items-center gap-3 text-[10px]">
        <span>
          <kbd className="font-mono bg-background border rounded px-1">
            {formatShortcutForOS("alt+g", isMac)}
          </kbd>{" "}
          Go To
        </span>
        <span>
          <kbd className="font-mono bg-background border rounded px-1">
            {formatShortcutForOS("ctrl+a", isMac)}
          </kbd>{" "}
          Save
        </span>
        <span>
          <kbd className="font-mono bg-background border rounded px-1">
            {formatShortcutForOS("Esc", isMac)}
          </kbd>{" "}
          Back
        </span>
      </div>
    </footer>
  );
}
