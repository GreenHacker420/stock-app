import { apiRequest } from "@/lib/api/client";
import type {
  InventoryBrand,
  InventoryCatalogParams,
  InventoryCatalogResponse,
  InventoryCategory,
  InventoryMovementParams,
  InventorySummary,
  StockMovement,
  StockPosition,
} from "@/features/inventory/lib/inventory-types";

export function fetchInventorySummary(token: string, shopId: string) {
  return apiRequest<InventorySummary>(`/items/summary?shopId=${encodeURIComponent(shopId)}`, { token });
}

export function fetchStockPosition(token: string, shopId: string) {
  return apiRequest<StockPosition[]>(`/stock/current?shopId=${encodeURIComponent(shopId)}`, { token });
}

export function fetchInventoryCatalog(token: string, params: InventoryCatalogParams) {
  const query = new URLSearchParams({
    shopId: params.shopId,
    page: String(params.page),
    limit: String(params.limit),
  });

  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.brandId) query.set("brandId", params.brandId);

  return apiRequest<InventoryCatalogResponse>(`/items?${query.toString()}`, { token });
}

export function fetchInventoryCategories(token: string, shopId: string) {
  return apiRequest<InventoryCategory[]>(`/items/categories?shopId=${encodeURIComponent(shopId)}`, { token });
}

export function fetchInventoryBrands(token: string, shopId: string) {
  return apiRequest<InventoryBrand[]>(`/items/brands?shopId=${encodeURIComponent(shopId)}`, { token });
}

export function fetchInventoryMovements(token: string, params: InventoryMovementParams) {
  const query = new URLSearchParams({
    shopId: params.shopId,
    page: String(params.page),
    limit: String(params.limit),
  });

  if (params.itemId) query.set("itemId", params.itemId);
  if (params.movementType) query.set("movementType", params.movementType);

  return apiRequest<StockMovement[]>(`/stock/movements?${query.toString()}`, { token });
}
