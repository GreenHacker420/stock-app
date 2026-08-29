"use client";

import { useSyncExternalStore } from "react";
import { CircleDot } from "lucide-react";

import { getActiveCommandContext, useCommandSurface } from "@/components/keyboard/useCommandSurface";
import { commandExecutor } from "@/lib/commands/command-executor";
import { commandFeedbackStore } from "@/lib/commands/command-feedback";
import { formatShortcutForOS, useOS } from "@/lib/keyboard/os";
import { cn } from "@/lib/utils";

export function RightActionRail() {
  const entries = useCommandSurface("rail");
  const { isMac } = useOS();
  const feedback = useSyncExternalStore(
    commandFeedbackStore.subscribe,
    commandFeedbackStore.getSnapshot,
    commandFeedbackStore.getServerSnapshot,
  );

  return (
    <aside className="hidden h-full w-[clamp(10.75rem,12.8vw,14rem)] shrink-0 flex-col border-l bg-card/68 xl:flex">
      <div className="shrink-0 border-b px-[clamp(0.6rem,0.8vw,0.85rem)] py-[clamp(0.55rem,1vh,0.8rem)]">
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current commands</div>
        <p className="mt-1 text-[9px] leading-4 text-muted-foreground">Derived from the active keyboard context.</p>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-[clamp(0.45rem,0.65vw,0.7rem)]">
        {entries.length ? entries.slice(0, 12).map((entry) => {
          const executedFromKeyboard = feedback.commandId === entry.id;
          return (
            <button
              type="button"
              key={entry.id}
              onClick={() => void commandExecutor.execute(entry.id, { source: "mouse", context: getActiveCommandContext() })}
              className={cn(
                "group flex min-h-[clamp(2.05rem,4.25vh,2.4rem)] w-full items-center gap-2 rounded-lg border px-2 text-left text-[clamp(0.62rem,0.66vw,0.72rem)] font-medium outline-none transition-colors",
                "hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                executedFromKeyboard ? "border-primary/60 bg-primary/12 text-foreground" : "border-transparent",
              )}
              title={entry.description || entry.title}
              data-command-feedback={executedFromKeyboard || undefined}
            >
              <span className={cn(
                "flex size-[clamp(1.3rem,2.7vh,1.55rem)] shrink-0 items-center justify-center rounded-md bg-background shadow-xs transition-transform",
                executedFromKeyboard && "scale-105 text-primary",
              )}>
                <CircleDot className="size-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{entry.title}</span>
                {entry.category ? <span className="block truncate text-[8px] font-normal text-muted-foreground">{entry.category}</span> : null}
              </span>
              {entry.key ? <kbd className={cn("shrink-0 rounded border bg-background px-1 font-mono text-[8px] text-muted-foreground", executedFromKeyboard && "border-primary/40 text-primary")}>{formatShortcutForOS(entry.key, isMac)}</kbd> : null}
            </button>
          );
        }) : (
          <div className="px-2 py-3 text-[10px] leading-4 text-muted-foreground">No contextual commands are available for the current focus.</div>
        )}
      </div>
    </aside>
  );
}
