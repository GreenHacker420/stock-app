import type { StockMovementEntry } from "../../types/items";

export type StockMovementDirection = "in" | "out" | "neutral";
export type StockMovementReferenceKind = "SALE" | "DM" | "ORDER" | null;

export function getStockMovementDirection(
  movement: Pick<StockMovementEntry, "quantityIn" | "quantityOut">,
): StockMovementDirection {
  if (Number(movement.quantityIn || 0) > 0) return "in";
  if (Number(movement.quantityOut || 0) > 0) return "out";
  return "neutral";
}

export function getStockMovementQuantity(
  movement: Pick<StockMovementEntry, "quantityIn" | "quantityOut">,
): number {
  const direction = getStockMovementDirection(movement);
  if (direction === "in") return Number(movement.quantityIn || 0);
  if (direction === "out") return Number(movement.quantityOut || 0);
  return 0;
}

export function getStockMovementReferenceKind(
  referenceType?: string | null,
): StockMovementReferenceKind {
  const normalized = referenceType?.trim().toUpperCase();
  if (normalized === "SALE") return "SALE";
  if (normalized === "DM" || normalized === "DELIVERY_MEMO") return "DM";
  if (normalized === "ORDER" || normalized === "ORDER_DISPATCH") return "ORDER";
  return null;
}

export function formatStockMovementQuantity(
  movement: Pick<StockMovementEntry, "quantityIn" | "quantityOut">,
  unit: string,
): string {
  const direction = getStockMovementDirection(movement);
  const value = getStockMovementQuantity(movement);
  const prefix = direction === "in" ? "+" : direction === "out" ? "−" : "";
  return `${prefix}${value} ${unit}`.trim();
}
