"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableRow, TableCell } from "@/components/ui/table";
import { SerialNumberDialog } from "./SerialNumberDialog";
import { computeLineTotal, formatINR } from "../lib/sale-money";
import { Barcode, Trash2 } from "lucide-react";
import type { SaleLineFormValue } from "../lib/sale-types";

interface SaleLineEditorProps {
  line: SaleLineFormValue;
  index: number;
  onUpdate: (updated: SaleLineFormValue) => void;
  onRemove: () => void;
}

export function SaleLineEditor({ line, index, onUpdate, onRemove }: SaleLineEditorProps) {
  const [serialDialogOpen, setSerialDialogOpen] = useState(false);

  const lineTotal = computeLineTotal({
    rate: line.rate,
    quantity: line.quantity,
    discountAmount: line.discountAmount,
  });

  const isMinPriceViolated =
    line.minimumAllowedPrice !== null &&
    line.minimumAllowedPrice > 0 &&
    line.rate < line.minimumAllowedPrice;

  const isSerialComplete =
    !line.requiresSerialNumber ||
    line.serialNumbers.length === line.quantity;

  return (
    <>
      <TableRow className="text-xs hover:bg-muted/40 transition-colors">
        {/* Index */}
        <TableCell className="w-10 text-center font-mono text-muted-foreground font-bold">
          {index + 1}
        </TableCell>

        {/* Product Details */}
        <TableCell className="min-w-[180px]">
          <div className="font-bold text-slate-900 dark:text-slate-100">{line.itemName}</div>
          <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
            {line.sku && <span>SKU: {line.sku}</span>}
            {line.unit && <span>({line.unit})</span>}
          </div>

          {/* Serial numbers badge trigger */}
          {line.requiresSerialNumber && (
            <div className="mt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSerialDialogOpen(true)}
                className={[
                  "h-6 text-[10px] gap-1 px-1.5 font-bold",
                  isSerialComplete
                    ? "border-emerald-300 text-emerald-700 bg-emerald-50/50"
                    : "border-amber-400 text-amber-800 bg-amber-50 animate-pulse",
                ].join(" ")}
              >
                <Barcode className="h-3 w-3" />
                <span>
                  Serials ({line.serialNumbers.length}/{line.quantity})
                </span>
              </Button>
            </div>
          )}
        </TableCell>

        {/* Quantity */}
        <TableCell className="w-24">
          <Input
            type="number"
            min="1"
            step="1"
            value={line.quantity || ""}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
              onUpdate({ ...line, quantity: val });
            }}
            className="h-8 text-xs font-mono text-right font-bold"
            aria-label={`Quantity for ${line.itemName}`}
          />
        </TableCell>

        {/* Rate */}
        <TableCell className="w-28">
          <div className="space-y-0.5">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={line.rate ?? ""}
              onChange={(e) => {
                const val = Math.max(0, parseFloat(e.target.value) || 0);
                onUpdate({ ...line, rate: val });
              }}
              className={[
                "h-8 text-xs font-mono text-right font-bold",
                isMinPriceViolated ? "border-destructive text-destructive bg-destructive/5" : "",
              ].join(" ")}
              aria-label={`Rate for ${line.itemName}`}
            />
            {isMinPriceViolated && (
              <p className="text-[9px] text-destructive text-right font-semibold">
                Min: ₹{line.minimumAllowedPrice}
              </p>
            )}
          </div>
        </TableCell>

        {/* Discount Amount */}
        <TableCell className="w-24">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={line.discountAmount ?? ""}
            onChange={(e) => {
              const val = Math.max(0, parseFloat(e.target.value) || 0);
              onUpdate({ ...line, discountAmount: val });
            }}
            className="h-8 text-xs font-mono text-right"
            aria-label={`Discount for ${line.itemName}`}
          />
        </TableCell>

        {/* Line Total */}
        <TableCell className="w-28 text-right font-mono font-black text-xs text-slate-900 dark:text-slate-100">
          {formatINR(lineTotal)}
        </TableCell>

        {/* Actions */}
        <TableCell className="w-12 text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            aria-label={`Remove ${line.itemName}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TableCell>
      </TableRow>

      {/* Serial Number Dialog */}
      {line.requiresSerialNumber && (
        <SerialNumberDialog
          open={serialDialogOpen}
          onClose={() => setSerialDialogOpen(false)}
          itemName={line.itemName}
          required={line.quantity}
          value={line.serialNumbers}
          onChange={(serials) => onUpdate({ ...line, serialNumbers: serials })}
        />
      )}
    </>
  );
}
