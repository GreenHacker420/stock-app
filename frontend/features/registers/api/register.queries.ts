import { apiRequest } from "@/lib/api/client";
import type {
  CustomerRegisterRow,
  DeliveryMemoRegisterRow,
  ExpenseRegisterRow,
  OrderRegisterRow,
  OrderStatus,
  PaymentMode,
  PaymentRegisterRow,
  PaymentStatus,
  SaleRegisterRow,
} from "@/features/registers/lib/register-types";

function addOptional(query: URLSearchParams, key: string, value: string | number | boolean | null | undefined) {
  if (value === undefined || value === null || value === "") return;
  query.set(key, String(value));
}

export async function fetchSalesRegister(
  token: string,
  params: { shopId: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number; customerId?: string },
): Promise<SaleRegisterRow[]> {
  const query = new URLSearchParams({ shopId: params.shopId });
  addOptional(query, "dateFrom", params.dateFrom);
  addOptional(query, "dateTo", params.dateTo);
  addOptional(query, "page", params.page ?? 1);
  addOptional(query, "limit", params.limit ?? 50);
  addOptional(query, "customerId", params.customerId);
  return apiRequest<SaleRegisterRow[]>(`/sales?${query.toString()}`, { token });
}

export async function fetchOrdersRegister(
  token: string,
  params: { shopId: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number; customerId?: string; status?: OrderStatus },
): Promise<OrderRegisterRow[]> {
  const query = new URLSearchParams({ shopId: params.shopId });
  addOptional(query, "dateFrom", params.dateFrom);
  addOptional(query, "dateTo", params.dateTo);
  addOptional(query, "page", params.page ?? 1);
  addOptional(query, "limit", params.limit ?? 50);
  addOptional(query, "customerId", params.customerId);
  addOptional(query, "status", params.status);
  return apiRequest<OrderRegisterRow[]>(`/orders?${query.toString()}`, { token });
}

export async function fetchDeliveryMemosRegister(
  token: string,
  params: { shopId: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number; customerId?: string; status?: DeliveryMemoRegisterRow["status"] },
): Promise<DeliveryMemoRegisterRow[]> {
  const query = new URLSearchParams({ shopId: params.shopId });
  addOptional(query, "dateFrom", params.dateFrom);
  addOptional(query, "dateTo", params.dateTo);
  addOptional(query, "page", params.page ?? 1);
  addOptional(query, "limit", params.limit ?? 50);
  addOptional(query, "customerId", params.customerId);
  addOptional(query, "status", params.status);
  return apiRequest<DeliveryMemoRegisterRow[]>(`/delivery-memos?${query.toString()}`, { token });
}

export async function fetchPaymentsRegister(
  token: string,
  params: { shopId: string; page?: number; limit?: number; customerId?: string; paymentMode?: PaymentMode; status?: PaymentStatus; unlinked?: boolean },
): Promise<PaymentRegisterRow[]> {
  const query = new URLSearchParams({ shopId: params.shopId });
  addOptional(query, "page", params.page ?? 1);
  addOptional(query, "limit", params.limit ?? 50);
  addOptional(query, "customerId", params.customerId);
  addOptional(query, "paymentMode", params.paymentMode);
  addOptional(query, "status", params.status);
  addOptional(query, "unlinked", params.unlinked);
  return apiRequest<PaymentRegisterRow[]>(`/payments?${query.toString()}`, { token });
}

export async function fetchCustomersRegister(
  token: string,
  params: { shopId: string; page?: number; limit?: number; search?: string; type?: CustomerRegisterRow["type"]; includeWalkin?: boolean },
): Promise<CustomerRegisterRow[]> {
  const query = new URLSearchParams({ shopId: params.shopId });
  addOptional(query, "page", params.page ?? 1);
  addOptional(query, "limit", params.limit ?? 50);
  addOptional(query, "search", params.search);
  addOptional(query, "type", params.type);
  addOptional(query, "includeWalkin", params.includeWalkin);
  return apiRequest<CustomerRegisterRow[]>(`/customers?${query.toString()}`, { token });
}

export async function fetchExpensesRegister(token: string, shopId: string): Promise<ExpenseRegisterRow[]> {
  const query = new URLSearchParams({ shopId });
  return apiRequest<ExpenseRegisterRow[]>(`/expenses?${query.toString()}`, { token });
}
