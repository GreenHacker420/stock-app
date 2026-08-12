import { apiRequest } from "@/lib/api/client";
import type {
  ApprovalRequestRow,
  ApprovalStatus,
  CashSessionRow,
  CashSessionStatus,
  CorrectionRequestRow,
} from "@/features/control/lib/control-types";

function addOptional(query: URLSearchParams, key: string, value: string | null | undefined) {
  if (value) query.set(key, value);
}

export async function fetchApprovalRequests(token: string, params: { shopId: string; status?: ApprovalStatus; type?: string }) {
  const query = new URLSearchParams({ shopId: params.shopId });
  addOptional(query, "status", params.status);
  addOptional(query, "type", params.type);
  return apiRequest<ApprovalRequestRow[]>(`/approvals?${query.toString()}`, { token });
}

export async function respondApproval(token: string, id: string, status: "APPROVED" | "REJECTED", rejectedReason?: string) {
  return apiRequest<ApprovalRequestRow>(`/approvals/${id}/respond`, {
    method: "POST",
    token,
    body: { status, rejectedReason },
  });
}

export async function fetchCorrectionRequests(token: string, params: { shopId: string; status?: ApprovalStatus; entityType?: "SALE" | "DM" | "ORDER" | "STOCK" | "PAYMENT" }) {
  const query = new URLSearchParams({ shopId: params.shopId });
  addOptional(query, "status", params.status);
  addOptional(query, "entityType", params.entityType);
  return apiRequest<CorrectionRequestRow[]>(`/correction-requests?${query.toString()}`, { token });
}

export async function approveCorrection(token: string, id: string) {
  return apiRequest(`/correction-requests/${id}/approve`, { method: "POST", token });
}

export async function rejectCorrection(token: string, id: string, reason: string) {
  return apiRequest(`/correction-requests/${id}/reject`, { method: "POST", token, body: { reason } });
}

export async function fetchCashSessions(token: string, params: { shopId: string; status?: CashSessionStatus }) {
  const query = new URLSearchParams({ shopId: params.shopId });
  addOptional(query, "status", params.status);
  return apiRequest<CashSessionRow[]>(`/cash-sessions?${query.toString()}`, { token });
}

export async function reviewCashSession(token: string, id: string) {
  return apiRequest<CashSessionRow>(`/cash-sessions/${id}/review`, { method: "POST", token });
}
