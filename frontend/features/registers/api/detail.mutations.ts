import { apiRequest } from "@/lib/api/client";
import type { PaymentDetail } from "@/features/registers/lib/detail-types";

export async function verifyPaymentDetail(token: string, paymentId: string, note?: string): Promise<PaymentDetail> {
  return apiRequest<PaymentDetail>(`/payments/${paymentId}/verify`, {
    method: "POST",
    token,
    body: note ? { note } : {},
  });
}

export async function markPaymentMismatch(token: string, paymentId: string, note?: string): Promise<PaymentDetail> {
  return apiRequest<PaymentDetail>(`/payments/${paymentId}/mark-mismatch`, {
    method: "POST",
    token,
    body: note ? { note } : {},
  });
}

export async function amendPaymentAmount(
  token: string,
  paymentId: string,
  payload: { amount: number; reason: string; expectedUpdatedAt: string },
): Promise<PaymentDetail> {
  return apiRequest<PaymentDetail>(`/payments/${paymentId}/amend`, {
    method: "POST",
    token,
    body: payload,
  });
}
