"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { SaleItemSearch } from "./SaleItemSearch";
import { SaleLineEditor } from "./SaleLineEditor";
import { createEmptyLine } from "../hooks/useNewSaleDraft";
import type { SaleFormSchema } from "../lib/sale-schema";
import type { ItemWithStock, SaleLineFormValue } from "../lib/sale-types";

export function SaleLineGrid() {
  const { control, watch, formState: { errors } } = useFormContext<SaleFormSchema>();
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "lines",
    keyName: "_fieldKey",
  });

  const handleSelectItem = (item: ItemWithStock) => {
    const defaultPrice = Number(item.defaultSellingPrice ?? 0);
    const minPrice = item.minimumAllowedPrice ? Number(item.minimumAllowedPrice) : null;
    const newLine = createEmptyLine({
      itemId: item.id,
      itemName: item.name,
      sku: item.sku ?? "",
      unit: item.unit ?? "",
      requiresSerialNumber: item.requiresSerialNumber ?? false,
      defaultSellingPrice: defaultPrice,
      minimumAllowedPrice: minPrice,
      rate: defaultPrice,
      quantity: 1,
      discountAmount: 0,
      serialNumbers: [],
    });
    append(newLine);
  };

  return (
    <div className="space-y-3">
      {/* Product search bar */}
      <div>
        <SaleItemSearch onSelectItem={handleSelectItem} />
      </div>

      {/* Grid container */}
      <div className="border rounded-md overflow-x-auto bg-card">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="text-xs">
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>Product / Item</TableHead>
              <TableHead className="w-24 text-right">Qty</TableHead>
              <TableHead className="w-28 text-right">Rate (₹)</TableHead>
              <TableHead className="w-24 text-right">Discount (₹)</TableHead>
              <TableHead className="w-28 text-right">Total (₹)</TableHead>
              <TableHead className="w-12 text-center"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                  No products added yet. Use the search bar above to add items to this sale.
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
                    onUpdate={(updated) => update(index, updated)}
                    onRemove={() => remove(index)}
                  />
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* RHF lines error */}
      {errors.lines?.root?.message && (
        <p className="text-xs text-destructive font-bold">{errors.lines.root.message}</p>
      )}
    </div>
  );
}
