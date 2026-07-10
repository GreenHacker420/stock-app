import type { Item } from "../api/client";

export type AddEditItemRouteParams = {
  itemId?: string;
  initialName?: string;
};

export type ItemDetailRouteParams = {
  itemId: string;
};

export type ItemStockResponse = {
  item: Item & { shopId: string };
  quantityIn: number;
  quantityOut: number;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
};

export type StockMovementEntry = {
  id: string;
  quantityIn: string | number;
  quantityOut: string | number;
  movementType: string;
  createdAt: string;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  createdBy?: { id: string; name: string; role: string } | null;
  approvedBy?: { id: string; name: string } | null;
};

export type PriceChangeHistoryEntry = {
  id: string;
  priceType: "SELLING" | "MINIMUM" | "MRP" | "PURCHASE";
  oldPrice: string | number | null;
  newPrice: string | number | null;
  changedBy?: string;
  createdAt: string;
};
