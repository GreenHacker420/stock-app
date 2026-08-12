import { apiRequest } from "@/lib/api/client";
import type {
  CustomerDetail,
  CustomerLedgerPage,
  CustomerLedgerSummary,
} from "@/features/customers/lib/customer-detail-types";

export async function fetchCustomerSummary(token: string, customerId: string): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(`/customers/${customerId}/summary`, { token });
}

export async function fetchCustomerLedger(
  token: string,
  customerId: string,
  params: { shopId: string; limit?: number; cursor?: string; from?: string; to?: string; search?: string },
): Promise<CustomerLedgerPage> {
  const query = new URLSearchParams({ shopId: params.shopId, limit: String(params.limit ?? 50) });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.search) query.set("search", params.search);
  return apiRequest<CustomerLedgerPage>(`/customers/${customerId}/ledger?${query.toString()}`, { token });
}

export async function fetchCustomerLedgerSummary(
  token: string,
  customerId: string,
  params: { shopId: string; from?: string; to?: string },
): Promise<CustomerLedgerSummary> {
  const query = new URLSearchParams({ shopId: params.shopId });
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return apiRequest<CustomerLedgerSummary>(`/customers/${customerId}/ledger/summary?${query.toString()}`, { token });
}
