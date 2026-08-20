import { env } from "../env";
import type { CreateSalePayload, CreatedSale, CustomerSearchResult, ItemWithStock, ItemStockResult, RateSuggestion } from "@/features/sales/lib/sale-types";

export const API_BASE_URL = env.NEXT_PUBLIC_API_URL;

export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE";
export type PaymentStatus = "RECORDED" | "VERIFIED" | "REJECTED" | "CANCELLED";
export type ChequeStatus = "RECEIVED" | "DEPOSITED" | "CLEARED" | "BOUNCED" | "RETURNED" | "CANCELLED";

export type ApiUser = { id: string; name: string; mobile: string; email?: string | null; role: "OWNER" | "STAFF"; permissions: string[]; status?: "ACTIVE" | "INACTIVE" | null };
export type Shop = { id: string; name: string; code: string; city: string; openingStockLocked: boolean; address?: string | null; phone?: string | null; email?: string | null; gstin?: string | null; logo?: string | null; upiId?: string | null; upiName?: string | null };
export type ItemCategory = { id: string; name: string };
export type ItemBrand = { id: string; name: string };
export type Item = { id: string; shopId?: string; name: string; sku?: string | null; imageUrl?: string | null; unit: string; defaultSellingPrice: string; minimumAllowedPrice?: string | null; purchasePrice?: string | null; mrp?: string | null; minimumStock: string; status?: "ACTIVE" | "INACTIVE"; categoryId?: string | null; brandId?: string | null; category?: ItemCategory | null; brand?: ItemBrand | null; physicalStock?: number; reservedStock?: number; availableStock?: number; currentStock?: number };
export type Customer = { id: string; name: string; phone?: string | null; address?: string | null; city?: string | null; gstin?: string | null; contactPerson?: string | null; creditLimit?: string | null; outstandingAmount?: string; notes?: string | null; status?: "ACTIVE" | "INACTIVE"; type?: "REGULAR" | "WALK_IN" };
export type TopCustomerItem = { customerId: string; _sum: { totalAmount: number | null }; customer?: { id: string; name: string; phone: string | null } };
export type OwnerDashboardData = { date: string; todaySales: number; walkinSales: number; salesCount: number; ordersCreated: number; ordersToPack: number; ordersDispatched: number; pendingDmAmount: number; cashCollected: number; upiCollected: number; cardCollected: number; bankCollected: number; chequeReceived: number; paymentVerificationPending: number; cashMismatch: number; pendingApprovalRequests: number; pendingVerifications: number; cashSessionDifferencesCount: number; rateChangeRequests: number; correctionRequests: number; lowStockAlerts: number; todayExpenses: number; gstInvoicesPendingCount: number; gstInvoicesPendingAmount: number; newCustomersToday: number; outstandingCustomersCount: number; inactiveCustomersCount: number; topCustomers: TopCustomerItem[] };
export type StaffDashboardData = { date: string; salesCount: number; salesTotal: number; walkinSalesCount: number; walkinSalesTotal: number; dmsCreated: number; dmTotal: number; cashCollected: number; upiRecorded: number; chequesReceived: number; ordersPacked: number; ordersDispatched: number; stockEntries: number; dayCloseStatus: string };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readErrorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  if (typeof value.error === "string") return value.error;
  if (typeof value.message === "string") return value.message;
  return fallback;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) { super(message); this.name = "ApiError"; this.status = status; this.data = data; }
}

let onUnauthorizedCallback: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) { onUnauthorizedCallback = handler; }

export async function apiRequest<T = unknown>(endpoint: string, options: { method?: string; body?: unknown; token?: string | null; headers?: Record<string, string> } = {}): Promise<T> {
  const method = options.method || "GET";
  const reqHeaders: Record<string, string> = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.token) reqHeaders.Authorization = `Bearer ${options.token}`;
  const res = await fetch(`${API_BASE_URL}${endpoint}`, { method, headers: reqHeaders, body: options.body !== undefined ? (typeof options.body === "string" ? options.body : JSON.stringify(options.body)) : undefined });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { message: text }; }
  if (!res.ok) {
    if (res.status === 401 && onUnauthorizedCallback) onUnauthorizedCallback();
    throw new ApiError(readErrorMessage(json, `Request failed with status ${res.status}`), res.status, json);
  }
  if (isRecord(json) && "data" in json) return json.data as T;
  return json as T;
}

export async function loginApi(identifier: string, password: string): Promise<{ token: string; user: ApiUser }> { return apiRequest("/auth/login", { method: "POST", body: { identifier, password } }); }
export async function fetchMeApi(token: string): Promise<ApiUser> { return apiRequest("/auth/me", { token }); }
export async function updateMeApi(token: string, body: { name?: string; email?: string | null; password?: string }): Promise<ApiUser> { return apiRequest("/auth/me", { method: "PATCH", token, body }); }
export async function fetchShopsApi(token: string): Promise<Shop[]> { return apiRequest("/shops", { token }); }
export async function fetchOwnerDashboardApi(token: string, params: { shopId?: string; date?: string } = {}): Promise<OwnerDashboardData> { const query = new URLSearchParams(); if (params.shopId) query.set("shopId", params.shopId); if (params.date) query.set("date", params.date); return apiRequest(`/dashboard/owner?${query.toString()}`, { token }); }
export async function fetchStaffDashboardApi(token: string, params: { shopId: string; date?: string }): Promise<StaffDashboardData> { const query = new URLSearchParams({ shopId: params.shopId }); if (params.date) query.set("date", params.date); return apiRequest(`/dashboard/staff/today?${query.toString()}`, { token }); }

export async function createSaleApi(token: string, payload: CreateSalePayload, idempotencyKey: string): Promise<CreatedSale> { return apiRequest<CreatedSale>("/sales", { method: "POST", token, body: payload, headers: { "Idempotency-Key": idempotencyKey } }); }
export async function searchCustomersApi(token: string, params: { shopId: string; search?: string; includeWalkin?: boolean; page?: number; limit?: number }): Promise<CustomerSearchResult[]> {
  const q = new URLSearchParams({ shopId: params.shopId }); if (params.search) q.set("search", params.search); if (params.includeWalkin) q.set("includeWalkin", "true"); if (params.page) q.set("page", String(params.page)); if (params.limit) q.set("limit", String(params.limit));
  const res = await apiRequest<CustomerSearchResult[] | { data: CustomerSearchResult[] }>(`/customers?${q.toString()}`, { token });
  return Array.isArray(res) ? res : res.data ?? [];
}
export async function searchItemsApi(token: string, params: { shopId: string; search?: string; page?: number; limit?: number }): Promise<ItemWithStock[]> {
  const q = new URLSearchParams({ shopId: params.shopId }); if (params.search) q.set("search", params.search); if (params.page) q.set("page", String(params.page)); if (params.limit) q.set("limit", String(params.limit));
  const res = await apiRequest<unknown>(`/items?${q.toString()}`, { token });
  if (Array.isArray(res)) return res as ItemWithStock[];
  if (isRecord(res) && Array.isArray(res.items)) return res.items as ItemWithStock[];
  if (isRecord(res) && Array.isArray(res.data)) return res.data as ItemWithStock[];
  return [];
}
export async function getItemStockApi(token: string, itemId: string): Promise<ItemStockResult> { return apiRequest<ItemStockResult>(`/items/${itemId}/stock`, { token }); }
export async function getRateSuggestionApi(token: string, itemId: string, customerId: string): Promise<RateSuggestion> { const q = new URLSearchParams({ customerId }); return apiRequest<RateSuggestion>(`/items/${itemId}/customer-rate-suggestion?${q.toString()}`, { token }); }
