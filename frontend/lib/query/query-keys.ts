export type InventoryCatalogQueryKeyParams = {
  shopId: string;
  search?: string;
  categoryId?: string;
  brandId?: string;
  page: number;
  limit: number;
};

export type InventoryMovementQueryKeyParams = {
  shopId: string;
  itemId?: string;
  movementType?: string;
  page: number;
  limit: number;
};

export type RegisterQueryKeyParams = {
  shopId: string;
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  type?: string;
  paymentMode?: string;
  unlinked?: boolean;
};

function registerKey(domain: string, params: RegisterQueryKeyParams) {
  return [
    domain,
    "register",
    params.shopId,
    params.page ?? 1,
    params.limit ?? 50,
    params.search || "",
    params.dateFrom || "",
    params.dateTo || "",
    params.status || "all",
    params.type || "all",
    params.paymentMode || "all",
    params.unlinked ? "unlinked" : "all-links",
  ] as const;
}

export const queryKeys = {
  auth: {
    me: () => ["auth", "me"] as const,
  },
  shops: {
    all: () => ["shops"] as const,
  },
  dashboard: {
    owner: (shopId?: string | null, date?: string) =>
      ["dashboard", "owner", shopId || "all", date || "today"] as const,
    ownerAnalytics: (params: { shopId?: string; dateFrom: string; dateTo: string; granularity?: string; topLimit?: number }) =>
      ["dashboard", "owner-analytics", params.shopId || "all", params.dateFrom, params.dateTo, params.granularity || "AUTO", params.topLimit || 5] as const,
    staff: (shopId: string, date?: string) =>
      ["dashboard", "staff", shopId, date || "today"] as const,
  },
  staff: {
    all: () => ["staff"] as const,
  },
  whatsapp: {
    capability: (shopId: string) =>
      ["whatsapp", "capability", shopId] as const,
  },
  sales: {
    list: (shopId: string, filters?: Record<string, unknown>) =>
      ["sales", shopId, filters] as const,
    register: (params: RegisterQueryKeyParams) => registerKey("sales", params),
    detail: (id: string) => ["sales", "detail", id] as const,
  },
  orders: {
    register: (params: RegisterQueryKeyParams) => registerKey("orders", params),
    detail: (id: string) => ["orders", "detail", id] as const,
  },
  deliveryMemos: {
    register: (params: RegisterQueryKeyParams) => registerKey("delivery-memos", params),
    detail: (id: string) => ["delivery-memos", "detail", id] as const,
  },
  items: {
    list: (shopId: string, filters?: Record<string, unknown>) =>
      ["items", shopId, filters] as const,
    stock: (itemId: string) => ["items", "stock", itemId] as const,
    rateSuggestion: (itemId: string, customerId: string) =>
      ["items", "rate-suggestion", itemId, customerId] as const,
  },
  inventory: {
    summary: (shopId: string) => ["inventory", "summary", shopId] as const,
    stock: (shopId: string) => ["inventory", "stock-position", shopId] as const,
    catalog: (params: InventoryCatalogQueryKeyParams) =>
      [
        "inventory",
        "catalog",
        params.shopId,
        params.search || "",
        params.categoryId || "all",
        params.brandId || "all",
        params.page,
        params.limit,
      ] as const,
    categories: (shopId: string) => ["inventory", "categories", shopId] as const,
    brands: (shopId: string) => ["inventory", "brands", shopId] as const,
    movements: (params: InventoryMovementQueryKeyParams) =>
      [
        "inventory",
        "movements",
        params.shopId,
        params.itemId || "all",
        params.movementType || "all",
        params.page,
        params.limit,
      ] as const,
  },
  customers: {
    list: (shopId: string, search?: string) =>
      ["customers", shopId, search || "all"] as const,
    register: (params: RegisterQueryKeyParams) => registerKey("customers", params),
    detail: (id: string) => ["customers", "detail", id] as const,
    outstanding: (id: string) => ["customers", "outstanding", id] as const,
    ledger: (id: string, filters?: Record<string, unknown>) => ["customers", "ledger", id, filters] as const,
    ledgerSummary: (id: string, shopId: string, from?: string, to?: string) => ["customers", "ledger-summary", id, shopId, from || "all", to || "all"] as const,
  },
  payments: {
    list: (shopId: string) => ["payments", shopId] as const,
    register: (params: RegisterQueryKeyParams) => registerKey("payments", params),
    detail: (id: string) => ["payments", "detail", id] as const,
  },
  expenses: {
    list: (shopId: string) => ["expenses", "register", shopId] as const,
  },
};
