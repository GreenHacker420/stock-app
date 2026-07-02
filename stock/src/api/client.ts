export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://shop-api.evergreenclassic.in";

export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE";
export type PaymentStatus = "RECORDED" | "VERIFIED" | "REJECTED" | "CANCELLED";
export type ChequeStatus = "RECEIVED" | "DEPOSITED" | "CLEARED" | "BOUNCED" | "RETURNED" | "CANCELLED";

export type ApiUser = {
  id: string;
  name: string;
  mobile: string;
  email?: string | null;
  role: "OWNER" | "STAFF";
  permissions: string[];
  status?: "ACTIVE" | "INACTIVE" | null;
};

export type Shop = {
  id: string;
  name: string;
  code: string;
  city: string;
  openingStockLocked: boolean;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  logo?: string | null;
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
  minimumAllowedPrice?: string | null;
  purchasePrice?: string | null;
  mrp?: string | null;
  minimumStock: string;
  status?: "ACTIVE" | "INACTIVE";
  category?: ItemCategory | null;
  physicalStock?: number;
  reservedStock?: number;
  availableStock?: number;
  currentStock?: number;
};

export type StockLevel = {
  item: Item;
  quantityIn: number;
  quantityOut: number;
  currentQuantity: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  isLowStock: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  gstin?: string | null;
  creditLimit?: string | null;
  outstandingAmount?: string;
  notes?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  type?: "REGULAR" | "WALK_IN";
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
  openedAt: string;
  closedAt?: string | null;
};

export type Order = {
  id: string;
  orderNumber: string;
  shopId: string;
  customerId: string;
  assignedStaffId?: string | null;
  status: string;
  priority: string;
  expectedDispatchDate: string;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  ownerNotes?: string | null;
  createdAt: string;
  customer?: Customer;
  assignedStaff?: { id: string; name: string } | null;
  items: Array<{
    id: string;
    itemId: string;
    quantityOrdered: string;
    quantityPacked: string;
    quantityDispatched: string;
    quantityShortage?: string | null;
    rate: string;
    discountAmount?: string;
    lineTotal?: string;
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
  dmCreatedCount: number;
  expenseCount: number;
};

export type Payment = {
  id: string;
  shopId: string;
  paymentMode: PaymentMode;
  amount: string;
  status: PaymentStatus;
  receivedAt: string;
  referenceNumber?: string | null;
  customer?: { name: string } | null;
  receivedBy: { name: string };
  saleId?: string | null;
  sale?: { saleNumber: string } | null;
  orderId?: string | null;
  order?: { orderNumber: string } | null;
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

export type ChequePayment = Payment & {
  details?: {
    chequeNumber?: string | null;
    chequeBankName?: string | null;
    chequeBranch?: string | null;
    chequeDate?: string | null;
    chequeDepositDate?: string | null;
    chequeClearDate?: string | null;
    chequeStatus?: ChequeStatus | null;
  } | null;
  customer?: Customer | null;
};

export type Sale = {
  id: string;
  saleNumber: string;
  shopId: string;
  customerId?: string | null;
  isWalkin: boolean;
  subtotal?: string;
  discountAmount?: string;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  paymentStatus?: string;
  saleStatus?: string;
  dueDate?: string | null;
  createdAt: string;
  customer?: Customer | null;
  items?: Array<{ id: string; quantity: string; rate: string; discountAmount?: string; totalAmount: string; item: Item }>;
  payments?: Payment[];
  gstRequired: boolean;
  isGstRequired?: boolean; // alias for compatibility
  gstInvoiceStatus?: "NOT_REQUIRED" | "PENDING" | "GENERATED" | string;
  gstInvoiceNumber?: string | null;
  gstInvoiceGeneratedAt?: string | null;
  notes?: string | null;
  customerSignature?: string | null;
};

export interface CreateItemPayload {
  shopId: string;
  name: string;
  sku?: string | null;
  unit: string;
  defaultSellingPrice: number;
  minimumAllowedPrice?: number | null;
  minimumStock: number;
  purchasePrice?: number | null;
  mrp?: number | null;
  categoryId?: string | null;
  initialStock?: number;
}

export interface UpdateItemPayload extends Partial<CreateItemPayload> {
  adjustmentStock?: number;
}

export interface CreateSalePayload {
  shopId: string;
  customerId?: string;
  customerInfo?: { name?: string; phone?: string; email?: string };
  isWalkin?: boolean;
  dueDate?: string;
  items: Array<{ itemId: string; quantity: number; rate: number; discountAmount?: number }>;
  payments?: Array<{ paymentMode: PaymentMode; amount: number; referenceNumber?: string; notes?: string }>;
  notes?: string;
  customerSignature?: string;
  gstRequired?: boolean;
}

export interface StockEntryPayload {
  shopId: string;
  entries: Array<{ itemId: string; quantity: number; purchasePrice?: number }>;
  notes?: string;
}

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
  const startedAt = Date.now();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });

  const responseText = await response.text();
  if (__DEV__) {
    const durationMs = Date.now() - startedAt;
    const payloadBytes = responseText.length;
    if (durationMs >= 500 || payloadBytes >= 25_000) {
      console.log(`[api] ${options.method ?? "GET"} ${path} ${response.status} ${durationMs}ms ${payloadBytes}b`);
    }
  }
  const payload = responseText
    ? JSON.parse(responseText) as ApiResponse<T>
    : { success: response.ok, data: undefined as T };

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

export async function truecallerLogin(authorizationCode: string, codeVerifier: string) {
  return apiRequest<{ token: string; user: ApiUser }>("/auth/truecaller", {
    method: "POST",
    body: JSON.stringify({ authorizationCode, codeVerifier }),
  });
}

export async function truecallerOtpLogin(accessToken: string) {
  return apiRequest<{ token: string; user: ApiUser }>("/auth/truecaller-otp", {
    method: "POST",
    body: JSON.stringify({ accessToken }),
  });
}

export async function logout(token: string) {
  return apiRequest("/auth/logout", { method: "POST", token });
}

export async function refreshToken(token: string) {
  return apiRequest<{ token: string; user: ApiUser }>("/auth/refresh", { method: "POST", token });
}

export async function fetchMe(token: string) {
  return apiRequest<ApiUser>("/auth/me", { token });
}

export async function updateMe(token: string, data: { name?: string; email?: string | null; password?: string }) {
  return apiRequest<ApiUser>("/auth/me", { method: "PATCH", token, body: JSON.stringify(data) });
}

export async function fetchStaff(token: string) {
  return apiRequest<ApiUser[]>("/auth/staff", { token });
}

export async function createStaff(token: string, data: any) {
  return apiRequest<ApiUser>("/auth/staff", { method: "POST", token, body: JSON.stringify(data) });
}

export async function updateStaff(token: string, id: string, data: any) {
  return apiRequest<ApiUser>(`/auth/staff/${id}`, { method: "PATCH", token, body: JSON.stringify(data) });
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

export interface ItemSummary {
  totalItems: number;
  totalCategories: number;
  outOfStockCount: number;
  lowStockCount: number;
  countByCat: Record<string, number>;
  uncategorisedCount: number;
}

// ITEMS & STOCK
export async function fetchItemSummary(token: string, shopId: string) {
  return apiRequest<ItemSummary>(`/items/summary?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function fetchItems(
  token: string,
  shopId: string,
  opts: { search?: string; page?: number; limit?: number; categoryId?: string } = {}
) {
  const q = new URLSearchParams({ shopId });
  if (opts.search && opts.search.trim()) q.set('search', opts.search.trim());
  if (opts.categoryId) q.set('categoryId', opts.categoryId);
  if (opts.page)  q.set('page',  String(opts.page));
  if (opts.limit) q.set('limit', String(opts.limit));
  return apiRequest<{ items: Item[]; total: number; hasMore: boolean; page: number }>(
    `/items?${q.toString()}`,
    { token }
  );
}

export async function createItem(token: string, data: CreateItemPayload) {
  return apiRequest<Item>("/items", { method: "POST", token, body: JSON.stringify(data) });
}

export async function updateItem(token: string, id: string, data: UpdateItemPayload) {
  return apiRequest<Item>(`/items/${id}`, { method: "PATCH", token, body: JSON.stringify(data) });
}

export async function fetchCategories(token: string, shopId: string) {
  return apiRequest<ItemCategory[]>(`/items/categories?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function createCategory(token: string, shopId: string, name: string) {
  return apiRequest<ItemCategory>("/items/categories", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId, name }),
  });
}

export async function updateCategory(token: string, id: string, name: string) {
  return apiRequest<ItemCategory>(`/items/categories/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ name }),
  });
}

export async function deleteCategory(token: string, id: string) {
  return apiRequest<{ success: boolean }>(`/items/categories/${id}`, {
    method: "DELETE",
    token,
  });
}

export async function fetchCurrentStock(token: string, shopId: string, itemId?: string) {
  let url = `/stock/current?shopId=${encodeURIComponent(shopId)}`;
  if (itemId) url += `&itemId=${encodeURIComponent(itemId)}`;
  return apiRequest<StockLevel[]>(url, { token });
}

export async function createStockMovement(token: string, data: any, opts: { idempotencyKey?: string } = {}) {
  return apiRequest("/stock/movements", {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

export async function fetchStockMovements(token: string, shopId: string, itemId?: string, movementType?: string) {
  let url = `/stock/movements?shopId=${encodeURIComponent(shopId)}`;
  if (itemId) url += `&itemId=${encodeURIComponent(itemId)}`;
  if (movementType) url += `&movementType=${encodeURIComponent(movementType)}`;
  return apiRequest<any[]>(url, { token });
}

// SALES
export async function fetchSales(
  token: string,
  shopId: string,
  opts: { page?: number; limit?: number; dateFrom?: string; dateTo?: string } = {},
) {
  const params = new URLSearchParams({ shopId });
  if (opts.page) params.set("page", String(opts.page));
  params.set("limit", String(opts.limit ?? 50));
  if (opts.dateFrom) params.set("dateFrom", opts.dateFrom);
  if (opts.dateTo) params.set("dateTo", opts.dateTo);
  const sales = await apiRequest<Sale[]>(`/sales?${params.toString()}`, { token });
  return sales.map((sale) => ({ ...sale, isGstRequired: sale.isGstRequired ?? sale.gstRequired }));
}

export async function fetchSale(token: string, id: string) {
  return apiRequest<Sale>(`/sales/${id}`, { token });
}

export async function createSale(token: string, data: CreateSalePayload, opts: { idempotencyKey?: string } = {}) {
  return apiRequest("/sales", {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

// COMPATIBILITY WRAPPER
export async function createWalkInSale(token: string, data: any) {
  return createSale(token, {
    shopId: data.shopId,
    isWalkin: true,
    items: [{ itemId: data.itemId, quantity: data.quantity, rate: data.rate }],
    payments: [{ paymentMode: 'CASH', amount: data.quantity * data.rate }]
  });
}

// ORDERS
export async function fetchOrders(token: string, shopId: string) {
  return apiRequest<Order[]>(`/orders?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function fetchOrder(token: string, id: string) {
  return apiRequest<Order>(`/orders/${id}`, { token });
}

export async function confirmOrder(token: string, id: string) {
  return apiRequest(`/orders/${id}/confirm`, { method: "POST", token });
}

export async function cancelOrder(token: string, id: string, reason?: string, opts: { idempotencyKey?: string } = {}) {
  return apiRequest(`/orders/${id}/cancel`, {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify({ reason }),
  });
}

export async function createOrder(token: string, data: any, opts: { idempotencyKey?: string } = {}) {
  return apiRequest<Order>("/orders", {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

export async function assignStaffToOrder(token: string, orderId: string, staffId: string) {
  return apiRequest(`/orders/${orderId}/assign-staff`, {
    method: "POST",
    token,
    body: JSON.stringify({ staffId }),
  });
}

export async function startOrderPacking(token: string, orderId: string) {
  return apiRequest(`/orders/${orderId}/start-packing`, { method: "POST", token });
}

export async function markOrderItemPacked(token: string, orderId: string, data: any) {
  return apiRequest(`/orders/${orderId}/mark-item-packed`, { method: "POST", token, body: JSON.stringify(data) });
}

export async function reportOrderShortage(token: string, orderId: string, data: any) {
  return apiRequest(`/orders/${orderId}/report-shortage`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function createDmFromOrder(token: string, orderId: string, data: any, opts: { idempotencyKey?: string } = {}) {
  return apiRequest(`/orders/${orderId}/create-dm`, {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

export async function convertOrderToSale(token: string, orderId: string, data: any, opts: { idempotencyKey?: string } = {}) {
  return apiRequest(`/orders/${orderId}/convert-to-sale`, {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

// CUSTOMERS
export async function fetchCustomers(
  token: string,
  shopId: string,
  includeWalkin = false,
  opts: { search?: string; page?: number; limit?: number } = {},
) {
  const params = new URLSearchParams({ shopId });
  if (includeWalkin) params.set("includeWalkin", "true");
  if (opts.search?.trim()) params.set("search", opts.search.trim());
  if (opts.page) params.set("page", String(opts.page));
  params.set("limit", String(opts.limit ?? 100));
  return apiRequest<Customer[]>(`/customers?${params.toString()}`, { token });
}

export async function fetchCustomer(token: string, id: string) {
  return apiRequest<Customer>(`/customers/${id}`, { token });
}

export async function createCustomer(token: string, data: any, opts: { idempotencyKey?: string } = {}) {
  return apiRequest<Customer>("/customers", {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

export async function updateCustomer(token: string, id: string, data: any) {
  return apiRequest<Customer>(`/customers/${id}`, { method: "PATCH", token, body: JSON.stringify(data) });
}

export async function fetchCustomerOutstanding(token: string, customerId: string) {
  return apiRequest(`/customers/${customerId}/outstanding`, { token });
}

export async function fetchCustomerSales(token: string, customerId: string) {
  return apiRequest<Sale[]>(`/customers/${customerId}/sales`, { token });
}

export async function fetchCustomerPayments(token: string, customerId: string) {
  return apiRequest<Payment[]>(`/customers/${customerId}/payments`, { token });
}

export async function fetchCustomerDMs(token: string, customerId: string) {
  return apiRequest<any[]>(`/customers/${customerId}/delivery-memos`, { token });
}

export async function fetchCustomerReturns(token: string, customerId: string) {
  return apiRequest<any[]>(`/customers/${customerId}/returns`, { token });
}

export async function fetchCustomerTimeline(token: string, customerId: string) {
  return apiRequest<any[]>(`/customers/${customerId}/timeline`, { token });
}

export async function fetchCustomerPriceHistory(token: string, customerId: string, itemId?: string) {
  const query = itemId ? `?itemId=${encodeURIComponent(itemId)}` : "";
  return apiRequest(`/customers/${customerId}/price-history${query}`, { token });
}

export async function fetchItemStock(token: string, itemId: string) {
  return apiRequest(`/items/${itemId}/stock`, { token });
}

export async function fetchItemPriceHistory(token: string, itemId: string, customerId?: string) {
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
  return apiRequest(`/items/${itemId}/price-history${query}`, { token });
}

export async function fetchItemPriceChangeHistory(token: string, itemId: string) {
  return apiRequest<any[]>(`/items/${itemId}/price-change-history`, { token });
}

export async function fetchItemRecentRates(token: string, itemId: string, customerId?: string) {
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
  return apiRequest(`/items/${itemId}/recent-rates${query}`, { token });
}

export async function fetchItemRateSuggestion(token: string, itemId: string, customerId: string) {
  return apiRequest(`/items/${itemId}/customer-rate-suggestion?customerId=${encodeURIComponent(customerId)}`, { token });
}

// PAYMENTS & VERIFICATION
export async function fetchPayments(token: string, shopId: string, options: { status?: PaymentStatus; customerId?: string; unlinked?: boolean } = {}) {
  let url = `/payments?shopId=${encodeURIComponent(shopId)}`;
  if (options.status) url += `&status=${options.status}`;
  if (options.customerId) url += `&customerId=${encodeURIComponent(options.customerId)}`;
  if (options.unlinked !== undefined) url += `&unlinked=${options.unlinked}`;
  return apiRequest<Payment[]>(url, { token });
}

export async function attachPayment(token: string, paymentId: string, data: { saleId?: string; dmId?: string; orderId?: string }) {
  return apiRequest(`/payments/${paymentId}/attach`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
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
  paymentMode: PaymentMode;
  amount: number;
  referenceNumber?: string;
  notes?: string;
}, opts: { idempotencyKey?: string } = {}) {
  return apiRequest("/payments", {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
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

export async function openCashSession(token: string, shopId: string, opts: { idempotencyKey?: string } = {}) {
  return apiRequest<CashSession>("/cash-sessions/open", {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify({ shopId }),
  });
}

export async function closeCashSession(token: string, sessionId: string, data: any, opts: { idempotencyKey?: string } = {}) {
  return apiRequest<CashSession>(`/cash-sessions/${sessionId}/close`, {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
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
  return apiRequest<DailySummary[]>(`/daily-summaries${query ? `?${query}` : ""}`, { token });
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

// CHEQUES
export async function fetchCheques(token: string, options: { shopId?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (options.shopId) params.set("shopId", options.shopId);
  if (options.status) params.set("status", options.status);
  const query = params.toString();
  return apiRequest<ChequePayment[]>(`/cheques${query ? `?${query}` : ""}`, { token });
}

export async function fetchCheque(token: string, id: string) {
  return apiRequest<ChequePayment>(`/cheques/${id}`, { token });
}

export async function markChequeDeposited(token: string, id: string, reason?: string) {
  return apiRequest<ChequePayment>(`/cheques/${id}/mark-deposited`, { method: "POST", token, body: JSON.stringify({ reason }) });
}

export async function markChequeCleared(token: string, id: string, reason?: string) {
  return apiRequest<ChequePayment>(`/cheques/${id}/mark-cleared`, { method: "POST", token, body: JSON.stringify({ reason }) });
}

export async function markChequeBounced(token: string, id: string, reason?: string) {
  return apiRequest<ChequePayment>(`/cheques/${id}/mark-bounced`, { method: "POST", token, body: JSON.stringify({ reason }) });
}

export async function markChequeReturned(token: string, id: string, reason?: string) {
  return apiRequest<ChequePayment>(`/cheques/${id}/mark-returned`, { method: "POST", token, body: JSON.stringify({ reason }) });
}

export type OwnerDashboardData = {
  date: string;
  todaySales: number;
  walkinSales: number;
  salesCount: number;
  ordersCreated: number;
  ordersToPack: number;
  ordersDispatched: number;
  pendingDmAmount: number;
  cashCollected: number;
  upiCollected: number;
  cardCollected: number;
  bankCollected: number;
  chequeReceived: number;
  paymentVerificationPending: number;
  cashMismatch: number;
  cashSessionDifferencesCount: number; // alias for compatibility
  rateChangeRequests: number;
  correctionRequests: number;
  lowStockAlerts: number;
  pendingVerifications: number;
  todayExpenses: number;
  gstInvoicesPendingCount: number;
  gstInvoicesPendingAmount: number;
};

export type StaffTodaySummaryData = {
  date: string;
  salesCount: number;
  salesTotal: number;
  walkinSalesCount: number;
  walkinSalesTotal: number;
  dmsCreated: number;
  dmTotal: number;
  cashCollected: number;
  upiRecorded: number;
  chequesReceived: number;
  ordersPacked: number;
  ordersDispatched: number;
  stockEntries: number;
  dayCloseStatus: string;
};

// DASHBOARDS
export async function fetchOwnerDashboard(token: string, options: { shopId?: string; date?: string } = {}): Promise<OwnerDashboardData> {
  const params = new URLSearchParams();
  if (options.shopId) params.set("shopId", options.shopId);
  if (options.date) params.set("date", options.date);
  const query = params.toString();
  return apiRequest<OwnerDashboardData>(`/dashboard/owner${query ? `?${query}` : ""}`, { token });
}

export async function fetchStaffTodaySummary(token: string, shopId: string, date?: string, staffId?: string): Promise<StaffTodaySummaryData> {
  const params = new URLSearchParams({ shopId });
  if (date) params.set("date", date);
  if (staffId) params.set("staffId", staffId);
  return apiRequest<StaffTodaySummaryData>(`/dashboard/staff/today?${params.toString()}`, { token });
}

export async function addStock(token: string, data: StockEntryPayload, opts: { idempotencyKey?: string } = {}) {
  return apiRequest("/stock/entry", {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

export type StockMovement = {
  id: string;
  itemId: string;
  quantityIn: string;
  quantityOut: string;
  movementType: string;
  reason?: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
  item?: Item | null;
  sale?: { id: string; saleNumber: string } | null;
  deliveryMemo?: { id: string; dmNumber: string } | null;
  order?: { id: string; orderNumber: string } | null;
};

export type Expense = {
  id: string;
  shopId: string;
  amount: string;
  category: string;
  note?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  createdBy: { id: string; name: string };
};

export async function fetchExpenses(token: string, shopId: string) {
  return apiRequest<Expense[]>(`/expenses?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function createExpense(token: string, data: { shopId: string; amount: number; category: string; note?: string }, opts: { idempotencyKey?: string } = {}) {
  return apiRequest<Expense>("/expenses", {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

export async function verifyExpense(token: string, id: string, status: "APPROVED" | "REJECTED", note?: string) {
  return apiRequest<Expense>(`/expenses/${id}/verify`, { method: "POST", token, body: JSON.stringify({ status, note }) });
}

export async function updateSaleGst(token: string, saleId: string, gstInvoiceNumber: string) {
  return apiRequest<Sale>(`/sales/${saleId}/gst`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ gstInvoiceNumber }),
  });
}

export type UserDevicePlatform = "IOS" | "ANDROID" | "WEB";
export type UserDeviceState = "FOREGROUND" | "BACKGROUND" | "IN_CALL" | "UNAVAILABLE" | "DISCONNECTED";

export type UserDevice = {
  id: string;
  installationId: string;
  platform: UserDevicePlatform;
  appVersion?: string | null;
  buildVersion?: string | null;
  deviceName?: string | null;
  osVersion?: string | null;
  notificationsEnabled: boolean;
  voipEnabled: boolean;
  lastShopId?: string | null;
  lastSeenAt: string;
  revokedAt?: string | null;
  hasPushToken: boolean;
  hasNativePushToken: boolean;
  hasVoipToken: boolean;
};

export async function registerDevice(token: string, input: {
  installationId: string;
  platform: UserDevicePlatform;
  pushToken?: string | null;
  nativePushToken?: string | null;
  voipToken?: string | null;
  appVersion?: string | null;
  buildVersion?: string | null;
  deviceName?: string | null;
  osVersion?: string | null;
  notificationsEnabled?: boolean;
  voipEnabled?: boolean;
  metadata?: Record<string, unknown> | null;
}) {
  return apiRequest<UserDevice>("/users/devices", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function fetchDevices(token: string) {
  return apiRequest<Array<UserDevice & { presence?: Record<string, unknown> | null }>>("/users/devices", { token });
}

export async function heartbeatDevice(
  token: string,
  deviceId: string,
  input: { shopId: string; state: UserDeviceState; available: boolean },
) {
  return apiRequest<Record<string, unknown>>(`/users/devices/${encodeURIComponent(deviceId)}/heartbeat`, {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function revokeDevice(token: string, deviceId: string) {
  return apiRequest<void>(`/users/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
    token,
  });
}

export async function sendTestPushNotification(token: string, shopId: string, message?: string) {
  return apiRequest<{ id: string }>("/notifications/test-push", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId, message }),
  });
}

export async function registerPushToken(token: string, pushToken: string) {
  return apiRequest("/users/push-token", {
    method: "POST",
    token,
    body: JSON.stringify({ pushToken }),
  });
}

export async function fetchDeliveryMemos(token: string, shopId: string) {
  return apiRequest<any[]>(`/delivery-memos?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function fetchDeliveryMemo(token: string, id: string) {
  return apiRequest<any>(`/delivery-memos/${id}`, { token });
}

export async function createDeliveryMemo(token: string, data: any, opts: { idempotencyKey?: string } = {}) {
  return apiRequest<any>("/delivery-memos", {
    method: "POST",
    token,
    headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

export async function syncDomainEvents(
  token: string,
  shopId: string,
  after?: string,
  limit?: number,
) {
  let url = `/sync/domain-events?shopId=${encodeURIComponent(shopId)}`;
  if (after) {
    url += `&after=${encodeURIComponent(after)}`;
  }
  if (limit) {
    url += `&limit=${limit}`;
  }
  return apiRequest<{ events: any[]; nextCursor: string | null }>(url, { token });
}

// ATTENDANCE & LEAVES
export async function fetchAttendance(token: string, filters: { shopId?: string; staffId?: string; dateFrom?: string; dateTo?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.shopId) params.append("shopId", filters.shopId);
  if (filters.staffId) params.append("staffId", filters.staffId);
  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);
  return apiRequest<any[]>(`/attendance?${params.toString()}`, { token });
}

export async function checkIn(token: string, shopId: string, note?: string) {
  return apiRequest<any>("/attendance/check-in", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId, note }),
  });
}

export async function checkOut(token: string, shopId: string, note?: string) {
  return apiRequest<any>("/attendance/check-out", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId, note }),
  });
}

export async function requestLeave(token: string, data: { startDate: string; endDate: string; reason: string }) {
  return apiRequest<any>("/attendance/leave", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function respondToLeave(token: string, leaveId: string, status: "APPROVED" | "REJECTED") {
  return apiRequest<any>(`/attendance/leave/${leaveId}/respond`, {
    method: "POST",
    token,
    body: JSON.stringify({ status }),
  });
}
