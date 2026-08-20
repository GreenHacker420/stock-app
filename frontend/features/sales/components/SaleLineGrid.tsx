"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import { focusRegistry } from "@/components/keyboard/focus-registry";
import { RovingFocusZone } from "@/components/keyboard/RovingFocusZone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createEmptyLine } from "../hooks/useNewSaleDraft";
import type { SaleFormSchema } from "../lib/sale-schema";
import type { ItemWithStock, SaleLineFormValue } from "../lib/sale-types";
import { SaleLineEditor } from "./SaleLineEditor";

export function SaleLineGrid() {
  const { control, setValue, watch, formState: { errors } } = useFormContext<SaleFormSchema>();
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "lines",
    keyName: "_fieldKey",
  });

  const setLineValue = (index: number, line: SaleLineFormValue) => {
    setValue(`lines.${index}`, line, { shouldDirty: true, shouldTouch: true });
  };

  const handleSelectItemForLine = (index: number, line: SaleLineFormValue, item: ItemWithStock) => {
    const defaultPrice = Number(item.defaultSellingPrice ?? 0);
    const minPrice = item.minimumAllowedPrice ? Number(item.minimumAllowedPrice) : null;
    const stock = item.availableStock ?? item.currentStock ?? item.physicalStock ?? null;

    const updatedLine: SaleLineFormValue = {
      ...line,
      itemId: item.id,
      itemName: item.name,
      sku: item.sku ?? "",
      unit: item.unit ?? "",
      availableStock: stock,
      requiresSerialNumber: item.requiresSerialNumber ?? false,
      defaultSellingPrice: defaultPrice,
      minimumAllowedPrice: minPrice,
      rate: defaultPrice,
      quantity: Math.max(1, line.quantity || 1),
      discountAmount: 0,
      serialNumbers: [],
    };

    setLineValue(index, updatedLine);

    if (index === fields.length - 1) append(createEmptyLine());
  };

  const handleRemoveLine = (index: number) => {
    const currentLines = (watch("lines") || []) as SaleLineFormValue[];
    if (currentLines.length <= 1) {
      update(0, createEmptyLine());
      requestAnimationFrame(() => {
        const line0 = watch("lines.0") as SaleLineFormValue;
        if (line0) {
          focusRegistry.setMode("NAVIGATION");
          focusRegistry.setActiveField(`sale.items.${line0._lineId}.search`, "LINE_ITEM_GRID");
        }
      });
      return;
    }

    const remaining = currentLines.filter((_, i) => i !== index);
    remove(index);

    const nextIndex = Math.min(index, remaining.length - 1);
    const targetLine = remaining[nextIndex];

    if (targetLine) {
      requestAnimationFrame(() => {
        focusRegistry.setMode("NAVIGATION");
        const targetFieldId = targetLine.itemId
          ? `sale.items.${targetLine._lineId}.quantity`
          : `sale.items.${targetLine._lineId}.search`;
        focusRegistry.setActiveField(targetFieldId, "LINE_ITEM_GRID");
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Tally-Style Voucher Table */}
      <RovingFocusZone zoneId="LINE_ITEM_GRID">
        <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-xs">
          <Table role="grid" aria-label="Sale line items" aria-rowcount={fields.length + 1}>
            <TableHeader className="bg-muted/70 dark:bg-zinc-800/60">
              <TableRow role="row" className="hover:bg-transparent">
                <TableHead role="columnheader" className="w-10 text-center text-[10px] font-bold uppercase tracking-wider">#</TableHead>
                <TableHead role="columnheader" className="min-w-[240px] text-[10px] font-bold uppercase tracking-wider">Product / Item</TableHead>
                <TableHead role="columnheader" className="w-24 text-right text-[10px] font-bold uppercase tracking-wider">Qty</TableHead>
                <TableHead role="columnheader" className="w-28 text-right text-[10px] font-bold uppercase tracking-wider">Rate (₹)</TableHead>
                <TableHead role="columnheader" className="w-28 text-right text-[10px] font-bold uppercase tracking-wider">Total (₹)</TableHead>
                <TableHead role="columnheader" className="w-12 text-center text-[10px] font-bold uppercase tracking-wider" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.length === 0 ? (
                <TableRow role="row">
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    No products added yet. Start typing in the row to search products.
                  </TableCell>
                </TableRow>
              ) : (
                fields.map((field, index) => {
                  const lineValue = watch(`lines.${index}`) as SaleLineFormValue;
                  if (!lineValue) return null;
                  return (
                    <SaleLineEditor
                      key={field._fieldKey || field._lineId}
                      line={lineValue}
                      index={index}
                      onSelectItem={(item) => handleSelectItemForLine(index, lineValue, item)}
                      onRemove={() => handleRemoveLine(index)}
                    />
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </RovingFocusZone>

      {errors.lines?.root?.message && (
        <p className="text-xs font-bold text-destructive">{errors.lines.root.message}</p>
      )}
    </div>
  );
}
