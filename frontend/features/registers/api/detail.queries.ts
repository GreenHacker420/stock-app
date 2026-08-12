import { apiRequest } from "@/lib/api/client";
import type { DeliveryMemoDetail, OrderDetail, PaymentDetail } from "@/features/registers/lib/detail-types";

export async function fetchOrderDetail(token: string, orderId: string): Promise<OrderDetail> {
  return apiRequest<OrderDetail>(`/orders/${orderId}`, { token });
}

export async function fetchDeliveryMemoDetail(token: string, memoId: string): Promise<DeliveryMemoDetail> {
  return apiRequest<DeliveryMemoDetail>(`/delivery-memos/${memoId}`, { token });
}

export async function fetchPaymentDetail(token: string, paymentId: string): Promise<PaymentDetail> {
  return apiRequest<PaymentDetail>(`/payments/${paymentId}`, { token });
}
