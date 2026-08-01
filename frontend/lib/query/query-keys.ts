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
    list: (shopId: string, filters?: Record<string, any>) =>
      ["sales", shopId, filters] as const,
    detail: (id: string) => ["sales", "detail", id] as const,
  },
  items: {
    list: (shopId: string, filters?: Record<string, any>) =>
      ["items", shopId, filters] as const,
  },
  customers: {
    list: (shopId: string, search?: string) =>
      ["customers", shopId, search || "all"] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
  },
};
