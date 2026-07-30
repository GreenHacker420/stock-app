import type { SaleDraft } from "./sale.types";

export type StockLevelLike = {
  itemId?: string | null;
  item?: { id?: string | null } | null;
  availableStock?: number | string | null;
  physicalStock?: number | string | null;
};

export type StockShortage = {
  itemId: string;
  itemName: string;
  requested: number;
  available: number;
};

export function buildAvailableStockMap(levels: readonly StockLevelLike[] | undefined) {
  const availability = new Map<string, number>();
  for (const level of levels ?? []) {
    const itemId = level.item?.id || level.itemId;
    if (!itemId) continue;
    const raw = Number(level.availableStock ?? level.physicalStock ?? 0);
    availability.set(itemId, Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0);
  }
  return availability;
}

export function findStockShortages(
  lines: SaleDraft["lines"],
  availability: ReadonlyMap<string, number>,
  missingAsZero = false,
) {
  const shortages: StockShortage[] = [];
  for (const line of Object.values(lines)) {
    const latest = availability.get(line.item.id);
    if (latest === undefined && !missingAsZero) continue;
    const available = latest ?? 0;
    if (line.quantity > available) {
      shortages.push({
        itemId: line.item.id,
        itemName: line.item.name,
        requested: line.quantity,
        available,
      });
    }
  }
  return shortages;
}

export function formatStockShortageMessage(shortages: readonly StockShortage[]) {
  const lines = shortages.slice(0, 3).map(
    (shortage) => `${shortage.itemName}: ${shortage.available} available, ${shortage.requested} selected`,
  );
  if (shortages.length > 3) {
    lines.push(`And ${shortages.length - 3} more product${shortages.length - 3 === 1 ? "" : "s"}`);
  }
  return `${lines.join("\n")}\n\nAdjust the cart before completing this sale.`;
}
