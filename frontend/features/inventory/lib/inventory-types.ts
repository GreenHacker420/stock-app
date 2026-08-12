export type InventoryView = "stock" | "catalog" | "movements";
export type StockFilter = "all" | "available" | "low" | "out" | "reserved" | "negative";

export type InventoryCategory = {
  id: string;
  name: string;
  status?: "ACTIVE" | "INACTIVE";
};

export type InventoryBrand = {
  id: string;
  name: string;
  status?: "ACTIVE" | "INACTIVE";
};

export type InventorySummary = {
  totalItems: number;
  totalCategories: number;
  totalBrands: number;
  outOfStockCount: number;
  lowStockCount: number;
  countByCat: Record<string, number>;
  countByBrand: Record<string, number>;
  uncategorisedCount: number;
  unbrandedCount: number;
};

export type StockPositionItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  minimumStock: number | string;
};

export type StockPosition = {
  item: StockPositionItem;
  quantityIn: number;
  quantityOut: number;
  currentQuantity: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  isLowStock: boolean;
};

export type InventoryCatalogItem = {
  id: string;
  shopId: string;
  name: string;
  sku: string | null;
  imageUrl?: string | null;
  unit: string;
  defaultSellingPrice: number | string;
  minimumAllowedPrice: number | string | null;
  purchasePrice: number | string | null;
  mrp: number | string | null;
  minimumStock: number | string;
  status: "ACTIVE" | "INACTIVE";
  categoryId?: string | null;
  brandId?: string | null;
  category?: InventoryCategory | null;
  brand?: InventoryBrand | null;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  currentStock: number;
  requiresSerialNumber?: boolean;
  bundleComponents?: Array<{
    id: string;
    componentItemId: string;
    quantity: number | string;
    componentItem?: { id: string; name: string; sku: string | null; unit: string };
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export type InventoryCatalogResponse = {
  items: InventoryCatalogItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type StockMovementType =
  | "OPENING_STOCK"
  | "STOCK_IN"
  | "STOCK_OUT"
  | "SALE"
  | "DM"
  | "ORDER_DISPATCH"
  | "RETURN"
  | "DAMAGE_LOSS"
  | "MANUAL_ADJUSTMENT";

export type StockMovement = {
  id: string;
  shopId: string;
  itemId: string;
  movementType: StockMovementType;
  quantityIn: number | string;
  quantityOut: number | string;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt: string;
  item: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string;
  };
  createdBy?: {
    id: string;
    name: string;
    role: string;
  } | null;
  sale?: { id: string; saleNumber: string } | null;
  deliveryMemo?: { id: string; dmNumber: string } | null;
  order?: { id: string; orderNumber: string } | null;
};

export type InventoryCatalogParams = {
  shopId: string;
  search?: string;
  categoryId?: string;
  brandId?: string;
  page: number;
  limit: number;
};

export type InventoryMovementParams = {
  shopId: string;
  itemId?: string;
  movementType?: StockMovementType;
  page: number;
  limit: number;
};
