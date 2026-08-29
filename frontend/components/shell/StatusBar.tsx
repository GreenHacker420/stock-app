"use client";

import { useSyncExternalStore } from "react";

import { getActiveCommandContext, useCommandSurface } from "@/components/keyboard/useCommandSurface";
import { commandFeedbackStore } from "@/lib/commands/command-feedback";
import { activePointerStore } from "@/lib/focus/active-pointer-store";
import { formatShortcutForOS, useOS } from "@/lib/keyboard/os";

interface StatusBarProps {
  scope?: string;
  selectedCount?: number;
  hasUnsaved?: boolean;
}

function humanizeContext(value: unknown): string {
  if (typeof value !== "string" || !value) return "Workspace";
  return value
    .replaceAll(".", " · ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function StatusBar({ scope: externalScope, selectedCount: externalSelectedCount, hasUnsaved = false }: StatusBarProps) {
  const entries = useCommandSurface("status");
  const { isMac } = useOS();
  const pointerSnapshot = useSyncExternalStore(
    activePointerStore.subscribe,
    activePointerStore.getSnapshot,
    activePointerStore.getServerSnapshot,
  );
  const feedback = useSyncExternalStore(
    commandFeedbackStore.subscribe,
    commandFeedbackStore.getSnapshot,
    commandFeedbackStore.getServerSnapshot,
  );

  const context = getActiveCommandContext();
  const displayScope = externalScope || humanizeContext(
    context["report.id"] || context["app.view"] || context["app.module"] || context["keyboard.scope"],
  );
  const selectedCount = externalSelectedCount ?? pointerSnapshot.selectedIds.size;
  const pointer = pointerSnapshot.pointer;
  const unsaved = hasUnsaved || context["form.dirty"] === true;
  const feedbackEntry = feedback.commandId ? entries.find((entry) => entry.id === feedback.commandId) : undefined;
  const feedbackLabel = feedback.commandId
    ? `${feedback.key ? `${formatShortcutForOS(feedback.key, isMac)} · ` : ""}${feedbackEntry?.title ?? humanizeContext(feedback.commandId)}`
    : null;

  return (
    <footer
      aria-live="polite"
      className="flex shrink-0 select-none items-center justify-between border-t bg-background px-[var(--workspace-gutter-x)] text-[clamp(0.53rem,0.58vw,0.64rem)] font-medium text-muted-foreground"
      style={{ height: "var(--shell-status-height)" }}
    >
      <div className="flex min-w-0 items-center gap-[clamp(0.45rem,0.7vw,0.8rem)]">
        <span className="flex min-w-0 items-center gap-1.5"><span className="size-1.5 shrink-0 rounded-full bg-indigo-500" /><span className="truncate"><strong className="font-semibold text-foreground">{displayScope}</strong></span></span>
        {pointer ? <span className="hidden whitespace-nowrap sm:inline">Row {pointer.index + 1}</span> : null}
        {selectedCount > 0 ? <span className="hidden font-semibold text-foreground sm:inline">{selectedCount} selected</span> : null}
        {unsaved ? <span className="hidden rounded bg-amber-50 px-1.5 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 sm:inline">Unsaved</span> : null}
        {context["mutation.pending"] === true ? <span className="hidden font-semibold text-amber-600 sm:inline">Working…</span> : null}
      </div>

      <div className="hidden min-w-0 flex-1 items-center justify-center gap-[clamp(0.6rem,1vw,1.2rem)] overflow-hidden px-3 lg:flex">
        {feedbackLabel ? (
          <span className="truncate rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-semibold text-primary">{feedbackLabel}</span>
        ) : entries.slice(0, 5).map((entry) => entry.key ? (
          <span key={entry.id} className="whitespace-nowrap text-foreground/70">
            <kbd className="rounded border bg-muted/50 px-1 font-mono text-[8px] text-foreground/80">{formatShortcutForOS(entry.key, isMac)}</kbd>{" "}{entry.title}
          </span>
        ) : null)}
      </div>

      <div className="hidden shrink-0 whitespace-nowrap text-[9px] text-muted-foreground md:block">
        {feedbackLabel ? "Command executed" : context["dialog.open"] === true ? "Dialog owns keyboard" : context["input.editable"] === true ? "Typing context" : "Keyboard ready"}
      </div>
    </footer>
  );
}
