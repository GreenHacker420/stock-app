import type { Sale } from "../../../../api/client";

type SaleItem = NonNullable<Sale["items"]>[number];

export type EditableSaleItem = {
  itemId: string;
  name: string;
  quantity: string;
  rate: string;
  unit: string;
  defaultSellingPrice?: string | number | null;
  minimumPrice?: string | number | null;
  discountAmount: string;
  serialNumbers: string[];
  description?: string;
  requiresSerialNumber: boolean;
};

function legacySerialNumbers(description?: string | null) {
  const match = description?.trim().match(/^S\/N:\s*(.+)$/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function hydrateEditableSaleItems(items: Sale["items"] = []): EditableSaleItem[] {
  return (items || []).map((saleItem: SaleItem) => {
    const item = saleItem.item;
    const storedSerials = Array.isArray(saleItem.serialNumbers)
      ? saleItem.serialNumbers.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const serialNumbers = storedSerials.length > 0
      ? storedSerials
      : legacySerialNumbers(saleItem.description);

    return {
      itemId: saleItem.itemId || item.id,
      name: item.name || "Product",
      quantity: String(saleItem.quantity),
      rate: String(saleItem.rate),
      unit: item.unit || "pcs",
      defaultSellingPrice: item.defaultSellingPrice,
      minimumPrice: item.minimumAllowedPrice,
      discountAmount: String(saleItem.discountAmount || 0),
      serialNumbers,
      description: saleItem.description || undefined,
      requiresSerialNumber: Boolean(item.requiresSerialNumber || serialNumbers.length > 0),
    };
  });
}

export function buildSaleEditPayload(items: EditableSaleItem[]) {
  return items.map((item) => ({
    itemId: item.itemId,
    quantity: Number(item.quantity),
    rate: Number(item.rate),
    discountAmount: Number(item.discountAmount || 0),
    serialNumbers: item.serialNumbers.length > 0 ? item.serialNumbers : undefined,
    description: item.description,
  }));
}
