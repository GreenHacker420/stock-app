"use client";

import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";

interface StatusBarProps {
  scope?: string;
  selectedCount?: number;
  hasUnsaved?: boolean;
}

export function StatusBar({ scope = "Global", selectedCount = 0, hasUnsaved = false }: StatusBarProps) {
  const { isMac } = useOS();

  return (
    <footer className="h-7 border-t bg-muted/60 px-4 flex items-center justify-between text-[11px] font-medium text-muted-foreground sticky bottom-0 z-30 select-none">
      {/* Left: Keyboard Scope & Selection */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Scope: <strong className="text-slate-900 dark:text-slate-100">{scope}</strong></span>
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

      {/* Right: Shortcut Hints */}
      <div className="hidden sm:flex items-center gap-3 text-[10px]">
        <span><kbd className="font-mono bg-background border rounded px-1">{formatShortcutForOS("alt+g", isMac)}</kbd> Go To</span>
        <span><kbd className="font-mono bg-background border rounded px-1">{formatShortcutForOS("F8", isMac)}</kbd> New Sale</span>
        <span><kbd className="font-mono bg-background border rounded px-1">{formatShortcutForOS("Esc", isMac)}</kbd> Back</span>
      </div>
    </footer>
  );
}
