import { apiRequest } from "@/lib/api/client";

export type StockEntryPayload = {
  shopId: string;
  entries: Array<{ itemId: string; quantity: number }>;
  notes?: string;
};

export type StockEntryResult =
  | Array<Record<string, unknown>>
  | {
      isRequest: true;
      requestId: string;
      status: string;
      message: string;
    };

export type StockTransferPayload = {
  sourceShopId: string;
  targetShopId: string;
  itemId: string;
  quantity: number;
  reason?: string;
};

function idempotencyHeaders(key: string): Record<string, string> {
  return { "Idempotency-Key": key };
}

export function createStockEntry(
  token: string,
  payload: StockEntryPayload,
  idempotencyKey: string,
): Promise<StockEntryResult> {
  return apiRequest<StockEntryResult>("/stock/entry", {
    method: "POST",
    token,
    body: payload,
    headers: idempotencyHeaders(idempotencyKey),
  });
}

export function transferStock(
  token: string,
  payload: StockTransferPayload,
  idempotencyKey: string,
): Promise<{ sourceMovement: Record<string, unknown>; targetMovement: Record<string, unknown> }> {
  return apiRequest("/stock/transfer", {
    method: "POST",
    token,
    body: payload,
    headers: idempotencyHeaders(idempotencyKey),
  });
}
