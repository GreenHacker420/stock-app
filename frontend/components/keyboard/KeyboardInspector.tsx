"use client";

import { useState, useSyncExternalStore } from "react";
import { Bug, ChevronDown, ChevronUp } from "lucide-react";

import { keyboardDiagnostics } from "@/lib/keyboard/keyboard-diagnostics";

function subscribeKeyboardDiagnostics(listener: () => void) {
  return keyboardDiagnostics.subscribe(listener);
}

function getKeyboardDiagnosticSnapshot() {
  return keyboardDiagnostics.getLatest();
}

function getKeyboardDiagnosticServerSnapshot() {
  return null;
}

function formatContextValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function KeyboardInspector() {
  const [open, setOpen] = useState(false);
  const latest = useSyncExternalStore(
    subscribeKeyboardDiagnostics,
    getKeyboardDiagnosticSnapshot,
    getKeyboardDiagnosticServerSnapshot,
  );

  if (process.env.NODE_ENV === "production") return null;

  const winner = latest?.resolution.winner;
  const candidates = latest?.resolution.candidates ?? [];
  const contextEntries = latest
    ? Object.entries(latest.context)
        .filter(([, value]) => value !== undefined && value !== false && value !== null && value !== "")
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, 24)
    : [];

  return (
    <div className="fixed bottom-8 left-2 z-[120] max-w-[min(92vw,34rem)]" data-keyboard-scope='{"keyboard.scope":"diagnostics"}'>
      {open ? (
        <aside
          aria-label="Keyboard diagnostics"
          className="mb-2 max-h-[min(70vh,36rem)] w-[min(92vw,34rem)] overflow-auto rounded-xl border bg-background/95 p-3 text-[11px] shadow-2xl backdrop-blur"
        >
          <div className="mb-3 flex items-start justify-between gap-3 border-b pb-2">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Keyboard Inspector</p>
              <p className="mt-1 font-semibold">Last resolver decision</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border px-2 py-1 font-medium hover:bg-muted"
              aria-label="Collapse keyboard inspector"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>

          {!latest ? (
            <p className="rounded-md border border-dashed p-3 text-muted-foreground">Press a key anywhere in the app to record the first diagnostic event.</p>
          ) : (
            <div className="space-y-3">
              <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <InspectorValue label="Key" value={latest.key} />
                <InspectorValue label="Winner" value={winner?.command ?? "none"} />
                <InspectorValue label="Binding" value={winner?.id ?? "none"} />
                <InspectorValue label="Scope" value={formatContextValue(latest.context["keyboard.scope"] ?? "global")} />
              </section>

              <section>
                <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Candidates</p>
                <div className="overflow-hidden rounded-md border">
                  {candidates.length === 0 ? (
                    <p className="p-2 text-muted-foreground">No bindings were indexed for this key.</p>
                  ) : (
                    candidates.map(({ binding, matched }) => (
                      <div key={binding.id} className="grid grid-cols-[1fr_auto] gap-3 border-b px-2 py-1.5 last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate font-mono font-semibold">{binding.command}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{binding.id} · {binding.when || "always"}</p>
                        </div>
                        <span className={`self-center rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${matched ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                          {matched ? "MATCH" : "SKIP"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active context</p>
                <div className="max-h-52 overflow-auto rounded-md border font-mono text-[10px]">
                  {contextEntries.length === 0 ? (
                    <p className="p-2 text-muted-foreground">No active context values.</p>
                  ) : (
                    contextEntries.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[minmax(7rem,0.9fr)_minmax(0,1.1fr)] gap-2 border-b px-2 py-1 last:border-b-0">
                        <span className="truncate text-muted-foreground" title={key}>{key}</span>
                        <span className="truncate font-semibold" title={formatContextValue(value)}>{formatContextValue(value)}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </aside>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background/95 px-2.5 text-[10px] font-semibold shadow-lg backdrop-blur hover:bg-muted"
        aria-expanded={open}
        aria-label={open ? "Collapse keyboard inspector" : "Open keyboard inspector"}
      >
        <Bug className="size-3.5" />
        <span>Keys</span>
        {open ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
      </button>
    </div>
  );
}

function InspectorValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/30 px-2 py-1.5">
      <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate font-mono font-semibold" title={value}>{value}</p>
    </div>
  );
}
