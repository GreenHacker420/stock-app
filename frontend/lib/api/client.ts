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

export type OwnerDashboardData = {
  todaySalesCount: number;
  todaySalesTotal: number;
  outstandingTotal: number;
  pendingVerifications: number;
  lowStockAlerts: number;
  paymentVerificationPending: number;
  cashMismatch: number;
  gstInvoicesPendingCount: number;
  correctionRequests: number;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
    actorName?: string;
  }>;
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

export async function apiRequest<T = any>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    token?: string | null;
    body?: any;
    idempotencyKey?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { method = "GET", token, body, idempotencyKey, headers = {} } = options;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  if (idempotencyKey) {
    reqHeaders["Idempotency-Key"] = idempotencyKey;
  }

  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const res = await fetch(url, {
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
