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

export type PhysicalStockCountPayload = {
  shopId: string;
  itemId: string;
  countedPhysical: number;
  reason: string;
};

export type PhysicalStockCountResult = {
  isRequest: boolean;
  requestId?: string;
  status?: string;
  message?: string;
  item: { id: string; name: string };
  currentPhysical: number;
  countedPhysical: number;
  physicalStock?: number;
  reservedStock: number;
  availableStock?: number;
  resultingAvailableStock?: number;
  variance: number;
  reservationShortage: number;
  movement?: Record<string, unknown> | null;
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

export function reconcilePhysicalStock(
  token: string,
  payload: PhysicalStockCountPayload,
  idempotencyKey: string,
): Promise<PhysicalStockCountResult> {
  return apiRequest<PhysicalStockCountResult>("/stock/physical-count", {
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
