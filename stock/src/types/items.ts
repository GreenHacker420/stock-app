import { Item } from "../api/client";

export type AddEditItemRouteParams = {
  item?: Item;
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
  type: "IN" | "OUT";
  quantity: number;
  createdAt: string;
};

export type PriceChangeHistoryEntry = {
  id: string;
  priceType: "SELLING" | "MINIMUM" | "MRP" | "PURCHASE";
  oldPrice: string | number | null;
  newPrice: string | number | null;
  changedBy?: string;
  createdAt: string;
};
