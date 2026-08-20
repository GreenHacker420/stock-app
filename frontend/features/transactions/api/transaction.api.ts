import { apiRequest } from "@/lib/api/client";
import type {
  CreateOrderPayload,
  CreatedOrder,
  CreatedPayment,
  DeliveryMemoDraft,
  DeliveryMemoPayload,
  PaymentPayload,
} from "../lib/transaction-types";

function idempotencyHeaders(key: string): Record<string, string> {
  return { "Idempotency-Key": key };
}

export function createOrderApi(token: string, payload: CreateOrderPayload, idempotencyKey: string): Promise<CreatedOrder> {
  return apiRequest<CreatedOrder>("/orders", {
    method: "POST",
    token,
    body: payload,
    headers: idempotencyHeaders(idempotencyKey),
  });
}

export function createPaymentApi(token: string, payload: PaymentPayload, idempotencyKey: string): Promise<CreatedPayment> {
  return apiRequest<CreatedPayment>("/payments", {
    method: "POST",
    token,
    body: payload,
    headers: idempotencyHeaders(idempotencyKey),
  });
}

export function createDeliveryMemoDraftApi(token: string, payload: DeliveryMemoPayload, idempotencyKey: string): Promise<DeliveryMemoDraft> {
  return apiRequest<DeliveryMemoDraft>("/delivery-memos/drafts", {
    method: "POST",
    token,
    body: payload,
    headers: idempotencyHeaders(idempotencyKey),
  });
}

export function updateDeliveryMemoDraftApi(
  token: string,
  id: string,
  payload: Omit<DeliveryMemoPayload, "shopId" | "customerName"> & { version?: number },
): Promise<DeliveryMemoDraft> {
  return apiRequest<DeliveryMemoDraft>(`/delivery-memos/${id}/draft`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export function postDeliveryMemoApi(token: string, id: string, version: number | undefined, idempotencyKey: string): Promise<DeliveryMemoDraft> {
  return apiRequest<DeliveryMemoDraft>(`/delivery-memos/${id}/post`, {
    method: "POST",
    token,
    body: version ? { version } : {},
    headers: idempotencyHeaders(idempotencyKey),
  });
}

export function fetchDeliveryMemoDraftApi(token: string, id: string): Promise<DeliveryMemoDraft> {
  return apiRequest<DeliveryMemoDraft>(`/delivery-memos/${id}`, { token });
}
