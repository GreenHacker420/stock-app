"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { SerialNumberDialog } from "./SerialNumberDialog";
import { computeLineTotal, formatINR } from "../lib/sale-money";
import { useTransactionField } from "@/components/keyboard/useTransactionField";
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

  // Register cell inputs with FocusRegistry
  const { setRef: setQtyRef, isActive: isQtyActive } = useTransactionField<HTMLInputElement>({
    id: `sale.items.${line._lineId}.quantity`,
    zoneId: "LINE_ITEM_GRID",
    rowIndex: index,
    colIndex: 0,
    columnId: "quantity",
  });

  const { setRef: setRateRef, isActive: isRateActive } = useTransactionField<HTMLInputElement>({
    id: `sale.items.${line._lineId}.rate`,
    zoneId: "LINE_ITEM_GRID",
    rowIndex: index,
    colIndex: 1,
    columnId: "rate",
  });

  const { setRef: setDiscRef, isActive: isDiscActive } = useTransactionField<HTMLInputElement>({
    id: `sale.items.${line._lineId}.discount`,
    zoneId: "LINE_ITEM_GRID",
    rowIndex: index,
    colIndex: 2,
    columnId: "discount",
  });

  const { setRef: setSerialRef, isActive: isSerialActive } = useTransactionField<HTMLButtonElement>({
    id: `sale.items.${line._lineId}.serials`,
    zoneId: "LINE_ITEM_GRID",
    rowIndex: index,
    colIndex: 3,
    columnId: "serials",
  });

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
      <TableRow
        role="row"
        aria-rowindex={index + 1}
        className="text-xs hover:bg-muted/40 transition-colors"
      >
        {/* Index */}
        <TableCell role="gridcell" aria-colindex={1} className="w-10 text-center font-mono text-muted-foreground font-bold">
          {index + 1}
        </TableCell>

        {/* Product Details */}
        <TableCell role="gridcell" aria-colindex={2} className="min-w-[180px]">
          <div className="font-bold text-slate-900 dark:text-slate-100">{line.itemName}</div>
          <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
            {line.sku && <span>SKU: {line.sku}</span>}
            {line.unit && <span>({line.unit})</span>}
          </div>

          {/* Serial numbers badge trigger */}
          {line.requiresSerialNumber && (
            <div className="mt-1">
              <Button
                ref={setSerialRef}
                type="button"
                variant="outline"
                size="sm"
                tabIndex={isSerialActive ? 0 : -1}
                onClick={() => setSerialDialogOpen(true)}
                className={[
                  "h-6 text-[10px] gap-1 px-1.5 font-bold",
                  isSerialActive ? "ring-2 ring-primary border-primary" : "",
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
        <TableCell role="gridcell" aria-colindex={3} className="w-24">
          <Input
            ref={setQtyRef}
            type="number"
            min="1"
            step="1"
            tabIndex={isQtyActive ? 0 : -1}
            value={line.quantity || ""}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
              onUpdate({ ...line, quantity: val });
            }}
            className={[
              "h-8 text-xs font-mono text-right font-bold",
              isQtyActive ? "ring-2 ring-primary border-primary" : "",
            ].join(" ")}
            aria-label={`Quantity for ${line.itemName}`}
          />
        </TableCell>

        {/* Rate */}
        <TableCell role="gridcell" aria-colindex={4} className="w-28">
          <div className="space-y-0.5">
            <Input
              ref={setRateRef}
              type="number"
              min="0"
              step="0.01"
              tabIndex={isRateActive ? 0 : -1}
              value={line.rate ?? ""}
              onChange={(e) => {
                const val = Math.max(0, parseFloat(e.target.value) || 0);
                onUpdate({ ...line, rate: val });
              }}
              className={[
                "h-8 text-xs font-mono text-right font-bold",
                isRateActive ? "ring-2 ring-primary border-primary" : "",
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
        <TableCell role="gridcell" aria-colindex={5} className="w-24">
          <Input
            ref={setDiscRef}
            type="number"
            min="0"
            step="0.01"
            tabIndex={isDiscActive ? 0 : -1}
            value={line.discountAmount ?? ""}
            onChange={(e) => {
              const val = Math.max(0, parseFloat(e.target.value) || 0);
              onUpdate({ ...line, discountAmount: val });
            }}
            className={[
              "h-8 text-xs font-mono text-right",
              isDiscActive ? "ring-2 ring-primary border-primary" : "",
            ].join(" ")}
            aria-label={`Discount for ${line.itemName}`}
          />
        </TableCell>

        {/* Line Total */}
        <TableCell role="gridcell" aria-colindex={6} className="w-28 text-right font-mono font-black text-xs text-slate-900 dark:text-slate-100">
          {formatINR(lineTotal)}
        </TableCell>

        {/* Actions */}
        <TableCell role="gridcell" aria-colindex={7} className="w-12 text-center">
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
