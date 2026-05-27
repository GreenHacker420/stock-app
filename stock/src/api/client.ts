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
  upiId?: string | null;
  upiName?: string | null;
};

export type ItemCategory = {
  id: string;
  name: string;
};

export type Item = {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  defaultSellingPrice: string;
  minimumStock: string;
  category?: ItemCategory | null;
};

export type StockLevel = {
  item: Item;
  quantityIn: number;
  quantityOut: number;
  currentQuantity: number;
  isLowStock: boolean;
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

export type DetailedCashSession = CashSession & {
  staff: { id: string; name: string; mobile: string };
  difference?: string | null;
  differenceReason?: string | null;
  cashHandover?: string | null;
  otherDeductionsAmount?: string | null;
  otherDeductionsReason?: string | null;
  openedAt: string;
  closedAt?: string | null;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  createdAt: string;
  customer?: Customer;
  items: Array<{
    id: string;
    quantityOrdered: string;
    quantityPacked: string;
    quantityDispatched: string;
    item: Item;
  }>;
};

export type DailySummary = {
  id: string;
  shopId: string;
  summaryDate: string;
  status: "DRAFT" | "GENERATED" | "REVIEWED" | "LOCKED" | "EXPORTED";
  openingCash: string;
  expectedCash: string;
  actualCash?: string | null;
  totalSales: string;
  walkinSales: string;
  totalCashCollected: string;
  totalUpiCollected: string;
  totalCardCollected: string;
  totalBankCollected: string;
  totalChequeReceived: string;
  totalCreditPending: string;
  ordersCreatedCount: number;
  ordersDispatchedCount: number;
  salesCount: number;
};

export type Payment = {
  id: string;
  shopId: string;
  paymentMode: string;
  amount: string;
  verificationStatus: string;
  receivedAt: string;
  referenceNumber?: string | null;
  customer?: { name: string } | null;
  receivedBy: { name: string };
};

export type Notification = {
  id: string;
  shopId: string;
  triggerEvent: string;
  entityType: string;
  entityId?: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
  shop?: { id: string; name: string; city: string };
};

export type RateChangeRequest = {
  id: string;
  orderItemId: string;
  currentRate: string;
  suggestedRate: string;
  reason: string;
  status: string;
  createdAt: string;
};

export type CorrectionRequest = {
  id: string;
  entityType: string;
  entityId: string;
  requestedChangeJson: Record<string, unknown>;
  reason: string;
  status: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  userId?: string | null;
  shopId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  createdAt: string;
};

export type Sale = {
  id: string;
  saleNumber: string;
  shopId: string;
  isWalkin: boolean;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  createdAt: string;
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

// AUTH
export async function login(identifier: string, password: string) {
  return apiRequest<{ token: string; user: ApiUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export async function fetchMe(token: string) {
  return apiRequest<ApiUser>("/auth/me", { token });
}

export async function fetchStaff(token: string) {
  return apiRequest<ApiUser[]>("/auth/staff", { token });
}

export async function createStaff(token: string, data: any) {
  return apiRequest<ApiUser>("/auth/staff", { method: "POST", token, body: JSON.stringify(data) });
}

// SHOPS
export async function fetchShops(token: string) {
  return apiRequest<Shop[]>("/shops", { token });
}

export async function createShop(token: string, data: any) {
  return apiRequest<Shop>("/shops", { method: "POST", token, body: JSON.stringify(data) });
}

export async function updateShop(token: string, id: string, data: any) {
  return apiRequest<Shop>(`/shops/${id}`, { method: "PATCH", token, body: JSON.stringify(data) });
}

export async function assignStaffToShop(token: string, shopId: string, staffId: string) {
  return apiRequest(`/shops/${shopId}/assign-staff`, { method: "POST", token, body: JSON.stringify({ staffId }) });
}

export async function setOpeningStock(token: string, shopId: string, entries: any) {
  return apiRequest(`/shops/${shopId}/set-opening-stock`, { method: "POST", token, body: JSON.stringify({ entries }) });
}

// ITEMS & STOCK
export async function fetchItems(token: string, shopId: string) {
  return apiRequest<Item[]>(`/items?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function fetchCurrentStock(token: string, shopId: string, itemId?: string) {
  let url = `/stock/current?shopId=${encodeURIComponent(shopId)}`;
  if (itemId) url += `&itemId=${encodeURIComponent(itemId)}`;
  return apiRequest<StockLevel[]>(url, { token });
}

export async function createStockMovement(token: string, data: any) {
  return apiRequest("/stock/movements", { method: "POST", token, body: JSON.stringify(data) });
}

// SALES
export async function fetchSales(token: string, shopId: string) {
  return apiRequest<Sale[]>(`/sales?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function createSale(token: string, data: {
  shopId: string;
  customerId?: string;
  isWalkin: boolean;
  items: Array<{ itemId: string; quantity: number; rate: number }>;
  payments: Array<{ paymentMode: string; amount: number; referenceNumber?: string }>;
}) {
  return apiRequest("/sales", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

// COMPATIBILITY WRAPPER
export async function createWalkInSale(token: string, data: any) {
  return createSale(token, {
    shopId: data.shopId,
    isWalkin: true,
    items: [{ itemId: data.itemId, quantity: data.quantity, rate: data.rate }],
    payments: [{ paymentMode: data.paymentMode, amount: data.quantity * data.rate }],
  });
}

// ORDERS
export async function fetchOrders(token: string, shopId: string) {
  return apiRequest<Order[]>(`/orders?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function markOrderItemPacked(token: string, orderId: string, data: any) {
  return apiRequest(`/orders/${orderId}/mark-item-packed`, { method: "POST", token, body: JSON.stringify(data) });
}

// CUSTOMERS
export async function fetchCustomers(token: string, shopId: string) {
  return apiRequest<Customer[]>(`/customers?shopId=${encodeURIComponent(shopId)}`, { token });
}

// PAYMENTS & VERIFICATION
export async function fetchPayments(token: string, shopId: string, options: any = {}) {
  let url = `/payments?shopId=${encodeURIComponent(shopId)}`;
  if (options.verificationStatus) url += `&verificationStatus=${options.verificationStatus}`;
  return apiRequest<Payment[]>(url, { token });
}

export async function verifyPayment(token: string, paymentId: string, note?: string) {
  return apiRequest(`/payments/${paymentId}/verify`, { method: "POST", token, body: JSON.stringify({ note }) });
}

export async function addPayment(token: string, data: {
  shopId: string;
  customerId?: string;
  orderId?: string;
  saleId?: string;
  dmId?: string;
  paymentMode: string;
  amount: number;
  referenceNumber?: string;
  notes?: string;
}) {
  return apiRequest("/payments", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function markPaymentMismatch(token: string, paymentId: string, note?: string) {
  return apiRequest(`/payments/${paymentId}/mark-mismatch`, { method: "POST", token, body: JSON.stringify({ note }) });
}

// CASH SESSIONS
export async function fetchCurrentCashSession(token: string, shopId: string) {
  return apiRequest<CashSession | null>(`/cash-sessions/current?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function openCashSession(token: string, shopId: string) {
  return apiRequest<CashSession>("/cash-sessions/open", { method: "POST", token, body: JSON.stringify({ shopId }) });
}

export async function closeCashSession(token: string, sessionId: string, data: any) {
  return apiRequest<CashSession>(`/cash-sessions/${sessionId}/close`, { method: "POST", token, body: JSON.stringify(data) });
}

export async function fetchCashSessions(token: string, shopId: string) {
  return apiRequest<DetailedCashSession[]>(`/cash-sessions?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function reviewCashSession(token: string, sessionId: string) {
  return apiRequest(`/cash-sessions/${sessionId}/review`, { method: "POST", token });
}

// DAILY SUMMARY
export async function fetchDailySummary(token: string, shopId: string, date: string) {
  return apiRequest<DailySummary>(`/daily-summary?shopId=${encodeURIComponent(shopId)}&date=${encodeURIComponent(date)}`, { token });
}

export async function lockDailySummary(token: string, shopId: string, date: string) {
  return apiRequest(`/daily-summary/lock`, { method: "POST", token, body: JSON.stringify({ shopId, date }) });
}

export async function generateDailySummary(token: string, shopId: string, date: string) {
  return apiRequest<DailySummary>("/daily-summaries/generate", { method: "POST", token, body: JSON.stringify({ shopId, date }) });
}

export async function fetchDailySummaries(token: string, options: { shopId?: string; dateFrom?: string; dateTo?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return apiRequest<DailySummary[]>(`/daily-summaries/list${query ? `?${query}` : ""}`, { token });
}

export async function fetchDailySummaryById(token: string, id: string) {
  return apiRequest<DailySummary>(`/daily-summaries/${id}`, { token });
}

export async function lockDailySummaryById(token: string, id: string) {
  return apiRequest<DailySummary>(`/daily-summaries/${id}/lock`, { method: "POST", token });
}

// NOTIFICATIONS
export async function fetchNotifications(token: string, options: { shopId?: string; unread?: boolean } = {}) {
  const params = new URLSearchParams();
  if (options.shopId) params.set("shopId", options.shopId);
  if (options.unread !== undefined) params.set("unread", String(options.unread));
  const query = params.toString();
  return apiRequest<Notification[]>(`/notifications${query ? `?${query}` : ""}`, { token });
}

export async function markNotificationRead(token: string, id: string) {
  return apiRequest<Notification>(`/notifications/${id}/mark-read`, { method: "POST", token });
}

export async function markAllNotificationsRead(token: string, shopId?: string) {
  return apiRequest("/notifications/mark-all-read", { method: "POST", token, body: JSON.stringify({ shopId }) });
}

// RATE CHANGE REQUESTS
export async function createRateChangeRequest(token: string, data: { orderItemId: string; suggestedRate: number; reason: string }) {
  return apiRequest<RateChangeRequest>("/rate-change-requests", { method: "POST", token, body: JSON.stringify(data) });
}

export async function fetchRateChangeRequests(token: string, options: { shopId?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (options.shopId) params.set("shopId", options.shopId);
  if (options.status) params.set("status", options.status);
  const query = params.toString();
  return apiRequest<RateChangeRequest[]>(`/rate-change-requests${query ? `?${query}` : ""}`, { token });
}

export async function approveRateChangeRequest(token: string, id: string) {
  return apiRequest<RateChangeRequest>(`/rate-change-requests/${id}/approve`, { method: "POST", token });
}

export async function rejectRateChangeRequest(token: string, id: string, reason: string) {
  return apiRequest<RateChangeRequest>(`/rate-change-requests/${id}/reject`, { method: "POST", token, body: JSON.stringify({ reason }) });
}

// CORRECTION REQUESTS
export async function createCorrectionRequest(token: string, data: { entityType: "SALE" | "DM" | "ORDER" | "STOCK" | "PAYMENT"; entityId: string; requestedChangeJson: Record<string, unknown>; reason: string }) {
  return apiRequest<CorrectionRequest>("/correction-requests", { method: "POST", token, body: JSON.stringify(data) });
}

export async function fetchCorrectionRequests(token: string, options: { shopId?: string; status?: string; entityType?: string } = {}) {
  const params = new URLSearchParams();
  if (options.shopId) params.set("shopId", options.shopId);
  if (options.status) params.set("status", options.status);
  if (options.entityType) params.set("entityType", options.entityType);
  const query = params.toString();
  return apiRequest<CorrectionRequest[]>(`/correction-requests${query ? `?${query}` : ""}`, { token });
}

export async function approveCorrectionRequest(token: string, id: string) {
  return apiRequest<CorrectionRequest>(`/correction-requests/${id}/approve`, { method: "POST", token });
}

export async function rejectCorrectionRequest(token: string, id: string, reason: string) {
  return apiRequest<CorrectionRequest>(`/correction-requests/${id}/reject`, { method: "POST", token, body: JSON.stringify({ reason }) });
}

// AUDIT LOGS
export async function fetchAuditLogs(token: string, options: { shopId?: string; entityType?: string; action?: string; userId?: string; dateFrom?: string; dateTo?: string } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return apiRequest<AuditLog[]>(`/audit-logs${query ? `?${query}` : ""}`, { token });
}
