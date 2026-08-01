import { env } from "../env";

export const API_BASE_URL = env.NEXT_PUBLIC_API_URL;

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

export type ItemBrand = {
  id: string;
  name: string;
};

export type Item = {
  id: string;
  shopId?: string;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  unit: string;
  defaultSellingPrice: string;
  minimumAllowedPrice?: string | null;
  purchasePrice?: string | null;
  mrp?: string | null;
  minimumStock: string;
  status?: "ACTIVE" | "INACTIVE";
  categoryId?: string | null;
  brandId?: string | null;
  category?: ItemCategory | null;
  brand?: ItemBrand | null;
  physicalStock?: number;
  reservedStock?: number;
  availableStock?: number;
  currentStock?: number;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  gstin?: string | null;
  contactPerson?: string | null;
  creditLimit?: string | null;
  outstandingAmount?: string;
  notes?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  type?: "REGULAR" | "WALK_IN";
};

export type TopCustomerItem = {
  customerId: string;
  _sum: { totalAmount: number | null };
  customer?: { id: string; name: string; phone: string | null };
};

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
  pendingApprovalRequests: number;
  pendingVerifications: number;
  cashSessionDifferencesCount: number;
  rateChangeRequests: number;
  correctionRequests: number;
  lowStockAlerts: number;
  todayExpenses: number;
  gstInvoicesPendingCount: number;
  gstInvoicesPendingAmount: number;
  newCustomersToday: number;
  outstandingCustomersCount: number;
  inactiveCustomersCount: number;
  topCustomers: TopCustomerItem[];
};

export type StaffDashboardData = {
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

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

let onUnauthorizedCallback: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorizedCallback = handler;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: {
    method?: string;
    body?: any;
    token?: string | null;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const method = options.method || "GET";
  const token = options.token;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const body = options.body;

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: reqHeaders,
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text };
  }

  if (!res.ok) {
    if (res.status === 401 && onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
    throw new ApiError(
      json?.error || json?.message || `Request failed with status ${res.status}`,
      res.status,
      json
    );
  }

  return (json?.data !== undefined ? json.data : json) as T;
}

export async function loginApi(identifier: string, password: string): Promise<{ token: string; user: ApiUser }> {
  return apiRequest("/auth/login", {
    method: "POST",
    body: { identifier, password },
  });
}

export async function fetchMeApi(token: string): Promise<ApiUser> {
  return apiRequest("/auth/me", { token });
}

export async function updateMeApi(
  token: string,
  body: { name?: string; email?: string | null; password?: string }
): Promise<ApiUser> {
  return apiRequest("/auth/me", {
    method: "PATCH",
    token,
    body,
  });
}

export async function fetchShopsApi(token: string): Promise<Shop[]> {
  return apiRequest("/shops", { token });
}

export async function fetchOwnerDashboardApi(
  token: string,
  params: { shopId?: string; date?: string } = {}
): Promise<OwnerDashboardData> {
  const query = new URLSearchParams();
  if (params.shopId) query.set("shopId", params.shopId);
  if (params.date) query.set("date", params.date);
  return apiRequest(`/dashboard/owner?${query.toString()}`, { token });
}

export async function fetchStaffDashboardApi(
  token: string,
  params: { shopId: string; date?: string }
): Promise<StaffDashboardData> {
  const query = new URLSearchParams({ shopId: params.shopId });
  if (params.date) query.set("date", params.date);
  return apiRequest(`/dashboard/staff/today?${query.toString()}`, { token });
}
