"use client";

import { Trash2 } from "lucide-react";

import { MULTILINE_FORM_SCOPE } from "@/components/keyboard/KeyboardFormScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatINR } from "@/lib/utils";
import type { TransactionLine } from "../lib/transaction-types";

export function TransactionLineEditor({
  lines,
  onChange,
  onRemove,
  serialMode = false,
}: {
  lines: TransactionLine[];
  onChange: (key: string, patch: Partial<TransactionLine>) => void;
  onRemove: (key: string) => void;
  serialMode?: boolean;
}) {
  if (lines.length === 0) {
    return <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">Add at least one product to continue.</div>;
  }

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const lineTotal = Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.rate) || 0);
        const serialMismatch = serialMode && line.requiresSerialNumber && line.serialNumbers.length !== Number(line.quantity);
        return (
          <div key={line.key} className="rounded-xl border bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-md bg-muted font-mono text-[9px] font-semibold text-muted-foreground">{index + 1}</span>
                  <p className="truncate text-xs font-semibold">{line.name}</p>
                  {line.requiresSerialNumber ? <Badge variant="outline" className="text-[9px]">Serial tracked</Badge> : null}
                </div>
                <p className="mt-1 font-mono text-[9px] text-muted-foreground">{line.sku || "No SKU"} · {line.unit}{line.availableStock !== null ? ` · ${line.availableStock.toLocaleString("en-IN")} available` : ""}</p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${line.name}`} onClick={() => onRemove(line.key)}><Trash2 className="size-3.5" /></Button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(7rem,0.7fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)]">
              <label className="min-w-0">
                <span className="workspace-kicker">Quantity</span>
                <Input data-kernel-field type="number" min="0.001" step="any" value={line.quantity} onChange={(event) => onChange(line.key, { quantity: Number(event.target.value) })} className="mt-1 h-9 text-right font-mono text-xs" />
              </label>
              <label className="min-w-0">
                <span className="workspace-kicker">Rate</span>
                <Input data-kernel-field type="number" min="0.01" step="0.01" value={line.rate} onChange={(event) => onChange(line.key, { rate: Number(event.target.value) })} className="mt-1 h-9 text-right font-mono text-xs" />
                {line.minimumAllowedPrice !== null ? <span className="mt-1 block text-right text-[9px] text-muted-foreground">Min {formatINR(line.minimumAllowedPrice)}</span> : null}
              </label>
              <div className="rounded-lg bg-muted/30 px-3 py-2 text-right">
                <span className="workspace-kicker">Line total</span>
                <p className="numeric-cell mt-1 text-sm font-semibold">{formatINR(lineTotal)}</p>
              </div>
            </div>

            {serialMode ? (
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                <label data-keyboard-scope={MULTILINE_FORM_SCOPE}>
                  <span className="workspace-kicker">Description</span>
                  <Textarea data-kernel-field value={line.description} onChange={(event) => onChange(line.key, { description: event.target.value })} placeholder="Optional delivery description" className="mt-1 min-h-16 text-xs" />
                </label>
                {line.requiresSerialNumber ? (
                  <label data-keyboard-scope={MULTILINE_FORM_SCOPE}>
                    <span className="workspace-kicker">Serial numbers · one per line</span>
                    <Textarea
                      data-kernel-field
                      value={line.serialNumbers.join("\n")}
                      onChange={(event) => onChange(line.key, { serialNumbers: event.target.value.split(/[\n,]+/).map((value) => value.trim().toUpperCase()).filter(Boolean) })}
                      placeholder={`Enter ${line.quantity || 0} serial number(s)`}
                      className="mt-1 min-h-16 font-mono text-xs"
                    />
                    <span className={`mt-1 block text-[9px] ${serialMismatch ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{line.serialNumbers.length} / {Number(line.quantity) || 0} serials</span>
                  </label>
                ) : <div className="rounded-lg border border-dashed p-3 text-[10px] text-muted-foreground">This product does not require serial allocation.</div>}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
