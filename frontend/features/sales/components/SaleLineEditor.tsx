"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Barcode, RefreshCw, Trash2 } from "lucide-react";

import { focusRegistry } from "@/components/keyboard/focus-registry";
import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { useTransactionField } from "@/components/keyboard/useTransactionField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { computeLineTotal, formatINR } from "../lib/sale-money";
import type { SaleFormSchema } from "../lib/sale-schema";
import type { ItemWithStock, SaleLineFormValue } from "../lib/sale-types";
import { SaleItemSearch } from "./SaleItemSearch";
import { SerialNumberDialog } from "./SerialNumberDialog";

interface SaleLineEditorProps {
  line: SaleLineFormValue;
  index: number;
  onSelectItem: (item: ItemWithStock) => void;
  onRemove: () => void;
}

export function SaleLineEditor({ line, index, onSelectItem, onRemove }: SaleLineEditorProps) {
  const { setValue } = useFormContext<SaleFormSchema>();
  const [serialDialogOpen, setSerialDialogOpen] = useState(false);
  const [isChangingItem, setIsChangingItem] = useState(false);
  const lineId = line._lineId;
  const searchFieldId = `sale.items.${lineId}.search`;
  const descriptionFieldId = `sale.items.${lineId}.description`;
  const quantityFieldId = `sale.items.${lineId}.quantity`;
  const rateFieldId = `sale.items.${lineId}.rate`;
  const serialFieldId = `sale.items.${lineId}.serials`;

  const { setRef: setDescRef, onFocus: onDescFocus, isActive: isDescActive } = useTransactionField<HTMLInputElement>({
    id: descriptionFieldId,
    zoneId: "LINE_ITEM_GRID",
    rowIndex: index,
    colIndex: 1,
    columnId: "description",
  });
  const { setRef: setQtyRef, onFocus: onQtyFocus, isActive: isQtyActive } = useTransactionField<HTMLInputElement>({
    id: quantityFieldId,
    zoneId: "LINE_ITEM_GRID",
    rowIndex: index,
    colIndex: 2,
    columnId: "quantity",
  });
  const { setRef: setRateRef, onFocus: onRateFocus, isActive: isRateActive } = useTransactionField<HTMLInputElement>({
    id: rateFieldId,
    zoneId: "LINE_ITEM_GRID",
    rowIndex: index,
    colIndex: 3,
    columnId: "rate",
  });
  const { setRef: setSerialRef, onFocus: onSerialFocus, isActive: isSerialActive } = useTransactionField<HTMLButtonElement>({
    id: serialFieldId,
    zoneId: "LINE_ITEM_GRID",
    rowIndex: index,
    colIndex: 4,
    columnId: "serials",
    disabled: !line.requiresSerialNumber || line.serialNumbers.length === line.quantity,
  });

  const isBlankRow = !line.itemId || isChangingItem;
  const lineTotal = computeLineTotal({ rate: line.rate, quantity: line.quantity, discountAmount: line.discountAmount || 0 });
  const isMinPriceViolated = line.minimumAllowedPrice !== null && line.minimumAllowedPrice > 0 && line.rate < line.minimumAllowedPrice;
  const isSerialComplete = !line.requiresSerialNumber || line.serialNumbers.length === line.quantity;

  const focusField = useCallback((targetFieldId: string) => {
    focusRegistry.setMode("NAVIGATION");
    focusRegistry.setActiveField(targetFieldId, "LINE_ITEM_GRID");
  }, []);

  const focusProductSearch = useCallback(() => {
    setIsChangingItem(true);
    focusRegistry.setMode("NAVIGATION");
    requestAnimationFrame(() => {
      if (focusRegistry.getField(searchFieldId)) {
        focusRegistry.setActiveField(searchFieldId, "LINE_ITEM_GRID");
        return;
      }
      requestAnimationFrame(() => focusRegistry.setActiveField(searchFieldId, "LINE_ITEM_GRID"));
    });
  }, [searchFieldId]);

  const descriptionWhen = `transaction.active && transaction.lineGrid && (transaction.mode == NAVIGATION || transaction.mode == EDITING) && sale.lineField == description && sale.lineId == ${lineId} && input.empty && !dialog.open && !combobox.open`;
  const quantityWhen = `transaction.active && transaction.lineGrid && transaction.mode == NAVIGATION && sale.lineField == quantity && sale.lineId == ${lineId} && !dialog.open && !combobox.open`;
  const rateWhen = `transaction.active && transaction.lineGrid && (transaction.mode == NAVIGATION || transaction.mode == EDITING) && sale.lineField == rate && sale.lineId == ${lineId} && sale.emptyOrZero && !dialog.open && !combobox.open`;
  const commandPrefix = `sale.line.${lineId}`;

  const commands = useMemo(() => ({
    descriptionPrevious: {
      id: `${commandPrefix}.descriptionPrevious`,
      title: "Back to product",
      category: "Sale Entry",
      when: descriptionWhen,
      execute: focusProductSearch,
    },
    quantityPrevious: {
      id: `${commandPrefix}.quantityPrevious`,
      title: "Back to description",
      category: "Sale Entry",
      when: quantityWhen,
      execute: () => focusField(descriptionFieldId),
    },
    ratePrevious: {
      id: `${commandPrefix}.ratePrevious`,
      title: "Back to quantity",
      category: "Sale Entry",
      when: rateWhen,
      execute: () => focusField(quantityFieldId),
    },
  }), [commandPrefix, descriptionFieldId, descriptionWhen, focusField, focusProductSearch, quantityFieldId, quantityWhen, rateWhen]);

  useCommand(commands.descriptionPrevious);
  useCommand(commands.quantityPrevious);
  useCommand(commands.ratePrevious);
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.descriptionPrevious`, key: "backspace", command: commands.descriptionPrevious.id, when: descriptionWhen, priority: 155 }), [commandPrefix, commands.descriptionPrevious.id, descriptionWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.quantityPrevious`, key: "backspace", command: commands.quantityPrevious.id, when: quantityWhen, priority: 155 }), [commandPrefix, commands.quantityPrevious.id, quantityWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.ratePrevious`, key: "backspace", command: commands.ratePrevious.id, when: rateWhen, priority: 155 }), [commandPrefix, commands.ratePrevious.id, rateWhen]));

  const descriptionScope = useMemo(() => JSON.stringify({
    "sale.lineField": "description",
    "sale.lineId": lineId,
    "keyboard.scope": "line-description",
  }), [lineId]);
  const quantityScope = useMemo(() => JSON.stringify({
    "sale.lineField": "quantity",
    "sale.lineId": lineId,
    "keyboard.scope": "line-quantity",
  }), [lineId]);
  const rateScope = useMemo(() => JSON.stringify({
    "sale.lineField": "rate",
    "sale.lineId": lineId,
    "sale.emptyOrZero": !line.rate,
    "keyboard.scope": "line-rate",
  }), [line.rate, lineId]);

  const handleSelectProduct = (item: ItemWithStock) => {
    setIsChangingItem(false);
    onSelectItem(item);
    requestAnimationFrame(() => {
      if (item.requiresSerialNumber) setSerialDialogOpen(true);
      else focusRegistry.setActiveField(descriptionFieldId, "LINE_ITEM_GRID");
    });
  };

  const openSerialDialog = () => {
    focusRegistry.setActiveField(serialFieldId, "LINE_ITEM_GRID");
    setSerialDialogOpen(true);
  };

  const closeSerialDialog = () => {
    setSerialDialogOpen(false);
    requestAnimationFrame(() => focusRegistry.setActiveField(descriptionFieldId, "LINE_ITEM_GRID"));
  };

  const beginPointerEdit = () => focusRegistry.setMode("EDITING");

  return (
    <>
      <TableRow role="row" aria-rowindex={index + 1} className="text-xs transition-colors hover:bg-muted/40">
        <TableCell role="gridcell" aria-colindex={1} className="w-10 text-center font-mono font-bold text-muted-foreground">
          {index + 1}
        </TableCell>

        <TableCell role="gridcell" aria-colindex={2} className="min-w-[280px] py-1.5">
          {isBlankRow ? (
            <SaleItemSearch
              fieldId={searchFieldId}
              zoneId="LINE_ITEM_GRID"
              rowIndex={index}
              colIndex={0}
              autoFocus={index === 0}
              onSelectItem={handleSelectProduct}
              initialValue={line.itemName || ""}
              placeholder="Search product by name, SKU or scan barcode..."
            />
          ) : (
            <div className="group/item space-y-1.5 rounded-md p-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-bold text-slate-900 dark:text-slate-100">{line.itemName}</span>
                  <button
                    type="button"
                    onClick={focusProductSearch}
                    className="p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/item:opacity-100"
                    title="Change product"
                    aria-label={`Change product from ${line.itemName}`}
                  >
                    <RefreshCw className="size-3" />
                  </button>
                </div>
                {line.requiresSerialNumber ? (
                  <Button
                    ref={setSerialRef}
                    type="button"
                    variant="outline"
                    size="sm"
                    tabIndex={isSerialActive ? 0 : -1}
                    onFocus={onSerialFocus}
                    onClick={openSerialDialog}
                    className={`h-5 gap-1 px-1.5 text-[9px] font-bold ${isSerialActive ? "border-primary ring-2 ring-primary" : ""} ${
                      isSerialComplete
                        ? "border-emerald-300 bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : "border-amber-400 bg-amber-50 text-amber-800 animate-pulse dark:bg-amber-950/30 dark:text-amber-400"
                    }`}
                  >
                    <Barcode className="size-3" />
                    <span>Serials ({line.serialNumbers.length}/{line.quantity})</span>
                  </Button>
                ) : null}
              </div>

              {line.sku ? (
                <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                  <span>SKU: {line.sku}</span>
                </div>
              ) : null}

              <Input
                ref={setDescRef}
                tabIndex={isDescActive ? 0 : -1}
                value={line.description || ""}
                onFocus={onDescFocus}
                onClick={beginPointerEdit}
                onChange={(event) => {
                  focusRegistry.setMode("EDITING");
                  setValue(`lines.${index}.description`, event.target.value, { shouldDirty: true });
                }}
                data-keyboard-scope={descriptionScope}
                placeholder="Item Description / serial notes (optional)..."
                className={`h-7 w-full text-[11px] font-medium placeholder:text-muted-foreground/60 ${
                  isDescActive ? "border-primary ring-2 ring-primary bg-primary/5" : "border-border/50"
                }`}
                aria-label={`Description for ${line.itemName}`}
              />
            </div>
          )}
        </TableCell>

        <TableCell role="gridcell" aria-colindex={3} className="w-28">
          <div className="relative flex items-center">
            <Input
              ref={setQtyRef}
              type="number"
              min="1"
              step="1"
              disabled={!line.itemId}
              tabIndex={isQtyActive ? 0 : -1}
              value={line.quantity || ""}
              onFocus={onQtyFocus}
              onClick={beginPointerEdit}
              onChange={(event) => {
                focusRegistry.setMode("EDITING");
                const nextValue = Math.max(1, parseInt(event.target.value, 10) || 1);
                setValue(`lines.${index}.quantity`, nextValue, { shouldDirty: true });
              }}
              data-keyboard-scope={quantityScope}
              className={`h-8.5 w-full pr-8 text-right font-mono text-xs font-bold ${
                isQtyActive ? "border-primary ring-2 ring-primary" : ""
              }`}
              aria-label={`Quantity for ${line.itemName || "new line"}`}
            />
            <span className="pointer-events-none absolute right-2 text-[10px] font-bold text-muted-foreground">
              {line.unit || "pcs"}
            </span>
          </div>
        </TableCell>

        <TableCell role="gridcell" aria-colindex={4} className="w-28">
          <div className="space-y-0.5">
            <Input
              ref={setRateRef}
              type="number"
              min="0"
              step="0.01"
              disabled={!line.itemId}
              tabIndex={isRateActive ? 0 : -1}
              value={line.rate ?? ""}
              onFocus={onRateFocus}
              onClick={beginPointerEdit}
              onChange={(event) => {
                focusRegistry.setMode("EDITING");
                const nextValue = Math.max(0, parseFloat(event.target.value) || 0);
                setValue(`lines.${index}.rate`, nextValue, { shouldDirty: true });
              }}
              data-keyboard-scope={rateScope}
              className={`h-8.5 text-right font-mono text-xs font-bold ${isRateActive ? "border-primary ring-2 ring-primary" : ""} ${
                isMinPriceViolated ? "border-destructive bg-destructive/5 text-destructive" : ""
              }`}
              aria-label={`Rate for ${line.itemName || "new line"}`}
            />
            {isMinPriceViolated ? <p className="text-right text-[9px] font-semibold text-destructive">Min: ₹{line.minimumAllowedPrice}</p> : null}
          </div>
        </TableCell>

        <TableCell role="gridcell" aria-colindex={5} className="w-28 text-right font-mono text-xs font-black text-slate-900 dark:text-slate-100">
          {formatINR(lineTotal)}
        </TableCell>

        <TableCell role="gridcell" aria-colindex={6} className="w-12 text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Remove ${line.itemName || "line"}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </TableCell>
      </TableRow>

      {line.requiresSerialNumber ? (
        <SerialNumberDialog
          id={lineId}
          open={serialDialogOpen}
          onClose={closeSerialDialog}
          itemName={line.itemName}
          required={line.quantity}
          value={line.serialNumbers}
          onChange={(serials) => {
            setValue(`lines.${index}.serialNumbers`, serials, { shouldDirty: true });
          }}
        />
      ) : null}
    </>
  );
}
