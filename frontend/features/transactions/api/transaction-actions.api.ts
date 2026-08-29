import { apiRequest } from "@/lib/api/client";
import type { OrderDetail } from "@/features/registers/lib/detail-types";
import type { PaymentMode } from "@/features/registers/lib/register-types";

export type StaffOption = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
  role: "OWNER" | "STAFF";
};

export type OrderDispatchItem = {
  orderItemId: string;
  itemId: string;
  quantity: number;
  rate: number;
  discountAmount?: number;
  serialNumbers?: string[];
};

export type ConversionPayment = {
  paymentMode: PaymentMode;
  amount: number;
  referenceNumber?: string;
  notes?: string;
};

function idempotencyHeaders(key: string): Record<string, string> {
  return { "Idempotency-Key": key };
}

export function fetchStaffOptions(token: string): Promise<StaffOption[]> {
  return apiRequest<StaffOption[]>("/auth/staff", { token });
}

export function confirmOrderAction(token: string, orderId: string): Promise<OrderDetail> {
  return apiRequest<OrderDetail>(`/orders/${orderId}/confirm`, { method: "POST", token });
}

export function assignOrderStaffAction(token: string, orderId: string, staffId: string): Promise<OrderDetail> {
  return apiRequest<OrderDetail>(`/orders/${orderId}/assign-staff`, { method: "POST", token, body: { staffId } });
}

export function startOrderPackingAction(token: string, orderId: string): Promise<OrderDetail> {
  return apiRequest<OrderDetail>(`/orders/${orderId}/start-packing`, { method: "POST", token });
}

export function markOrderItemPackedAction(token: string, orderId: string, orderItemId: string, quantityPacked: number): Promise<OrderDetail> {
  return apiRequest<OrderDetail>(`/orders/${orderId}/mark-item-packed`, {
    method: "POST",
    token,
    body: { orderItemId, quantityPacked },
  });
}

export function reportOrderShortageAction(
  token: string,
  orderId: string,
  orderItemId: string,
  availableQuantity: number,
  reason: string,
): Promise<OrderDetail> {
  return apiRequest<OrderDetail>(`/orders/${orderId}/report-shortage`, {
    method: "POST",
    token,
    body: { orderItemId, availableQuantity, reason },
  });
}

export function createDmFromOrderAction(
  token: string,
  orderId: string,
  data: { expectedPaymentDate?: string; reason?: string; items?: OrderDispatchItem[] },
  idempotencyKey: string,
): Promise<{ id: string; dmNumber: string }> {
  return apiRequest<{ id: string; dmNumber: string }>(`/orders/${orderId}/create-dm`, {
    method: "POST",
    token,
    body: data,
    headers: idempotencyHeaders(idempotencyKey),
  });
}

export function convertOrderToSaleAction(
  token: string,
  orderId: string,
  data: { items?: OrderDispatchItem[]; payments?: ConversionPayment[] },
  idempotencyKey: string,
): Promise<{ id: string; saleNumber: string }> {
  return apiRequest<{ id: string; saleNumber: string }>(`/orders/${orderId}/convert-to-sale`, {
    method: "POST",
    token,
    body: data,
    headers: idempotencyHeaders(idempotencyKey),
  });
}

export function cancelOrderAction(token: string, orderId: string, reason: string | undefined, idempotencyKey: string): Promise<OrderDetail> {
  return apiRequest<OrderDetail>(`/orders/${orderId}/cancel`, {
    method: "POST",
    token,
    body: reason ? { reason } : {},
    headers: idempotencyHeaders(idempotencyKey),
  });
}

export function convertDeliveryMemoToSaleAction(
  token: string,
  deliveryMemoId: string,
  gstRequired: boolean,
  idempotencyKey: string,
): Promise<{ id: string; saleNumber: string }> {
  return apiRequest<{ id: string; saleNumber: string }>(`/delivery-memos/${deliveryMemoId}/convert-to-sale`, {
    method: "POST",
    token,
    body: { gstRequired },
    headers: idempotencyHeaders(idempotencyKey),
  });
}
