import type { Item, StockMovement } from "../api/client";

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

export type StockMovementEntry = StockMovement;

export type PriceChangeHistoryEntry = {
  id: string;
  priceType: "SELLING" | "MINIMUM" | "MRP" | "PURCHASE";
  oldPrice: string | number | null;
  newPrice: string | number | null;
  changedBy?: string;
  createdAt: string;
};
