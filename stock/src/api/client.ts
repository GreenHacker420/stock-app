const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:6600";

export type ApiUser = {
  id: string;
  name: string;
  mobile: string;
  email?: string | null;
  role: "OWNER" | "STAFF";
  permissions: string[];
};

export type Shop = {
  id: string;
  name: string;
  code: string;
  city: string;
  openingCash: string;
  openingStockLocked: boolean;
};

export type Item = {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  defaultSellingPrice: string;
  minimumStock: string;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
};

export type CashSession = {
  id: string;
  shopId: string;
  openingCash: string;
  expectedCash: string;
  actualCash?: string | null;
  status: "OPEN" | "CLOSED" | "REVIEWED" | "LOCKED";
};

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string;
  customer?: Customer;
  items: Array<{
    id: string;
    quantityOrdered: string;
    quantityPacked: string;
    item: Item;
  }>;
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok) {
    throw new ApiError(payload.message || "Request failed", response.status);
  }

  return payload.data;
}

export async function login(identifier: string, password: string) {
  return apiRequest<{ token: string; user: ApiUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export async function fetchMe(token: string) {
  return apiRequest<ApiUser>("/auth/me", { token });
}

export async function fetchShops(token: string) {
  return apiRequest<Shop[]>("/shops", { token });
}

export async function fetchItems(token: string, shopId: string) {
  return apiRequest<Item[]>(`/items?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function fetchCustomers(token: string, shopId: string) {
  return apiRequest<Customer[]>(`/customers?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function fetchOrders(token: string, shopId: string) {
  return apiRequest<Order[]>(`/orders?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function fetchCurrentCashSession(token: string, shopId: string) {
  return apiRequest<CashSession | null>(`/cash-sessions/current?shopId=${encodeURIComponent(shopId)}`, {
    token,
  });
}

export async function openCashSession(token: string, shopId: string) {
  return apiRequest<CashSession>("/cash-sessions/open", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function closeCashSession(
  token: string,
  sessionId: string,
  data: {
    actualCash: number;
    cashHandover?: number;
    otherDeductionsAmount?: number;
    otherDeductionsReason?: string;
    differenceReason?: string;
  },
) {
  return apiRequest<CashSession>(`/cash-sessions/${sessionId}/close`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function createStockMovement(
  token: string,
  data: {
    shopId: string;
    itemId: string;
    movementType: "STOCK_IN" | "STOCK_OUT" | "RETURN" | "DAMAGE_LOSS" | "MANUAL_ADJUSTMENT";
    quantity: number;
    direction?: "IN" | "OUT";
    reason?: string;
  },
) {
  return apiRequest("/stock/movements", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function createWalkInSale(
  token: string,
  data: {
    shopId: string;
    itemId: string;
    quantity: number;
    rate: number;
    paymentMode: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER";
  },
) {
  const total = data.quantity * data.rate;
  return apiRequest("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      shopId: data.shopId,
      isWalkin: true,
      items: [{ itemId: data.itemId, quantity: data.quantity, rate: data.rate }],
      payments: [{ paymentMode: data.paymentMode, amount: total }],
    }),
  });
}

export async function markOrderItemPacked(
  token: string,
  orderId: string,
  data: { orderItemId: string; quantityPacked: number },
) {
  return apiRequest(`/orders/${orderId}/mark-item-packed`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}
