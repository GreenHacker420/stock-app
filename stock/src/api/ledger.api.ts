import * as FileSystem from "expo-file-system/legacy";
import { apiRequest, API_BASE_URL } from "./client";
import { useAuthStore } from "../auth/auth-store";

export interface CustomerLedgerEntry {
  id: string;
  shopId: string;
  customerId: string;
  sourceType: string;
  sourceId: string;
  entryType: string;
  direction: "DEBIT" | "CREDIT";
  amount: number;
  createdById: string;
  reversalOfId?: string | null;
  idempotencyKey?: string | null;
  clientMutationId?: string | null;
  reversalReason?: string | null;
  notes?: string | null;
  effectiveAt: string;
  createdAt: string;
  updatedAt?: string;
  runningBalance: number;
  isReversal: boolean;
  isReversed: boolean;
  reversalEntryId?: string | null;
  attachments?: CustomerLedgerAttachment[];
}

export interface CustomerLedgerAttachment {
  id: string;
  shopId: string;
  ledgerEntryId: string;
  assetId: string;
  purpose: string;
  sortOrder: number;
  createdAt: string;
  asset?: {
    id: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    url?: string;
  };
}

export interface CustomerLedgerSummary {
  customerId?: string;
  from?: string | null;
  to?: string | null;
  openingBalance: number;
  periodDebits: number;
  periodCredits: number;
  closingBalance: number;
  outstandingAmount: number;
  advanceBalance: number;
}

export interface CustomerLedgerStatement {
  shop: {
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    gstin?: string | null;
    city?: string;
  };
  customer: {
    id: string;
    name: string;
    phone?: string;
    gstin?: string;
    address?: string;
  };
  dateRange: {
    from: string;
    to: string;
  };
  openingBalance: number;
  periodDebits: number;
  periodCredits: number;
  closingBalance: number;
  outstandingAmount: number;
  advanceBalance: number;
  entries: CustomerLedgerEntry[];
}

export interface LedgerQueryParams {
  shopId: string;
  cursor?: string;
  limit?: number;
  from?: string;
  to?: string;
  direction?: "DEBIT" | "CREDIT";
  entryType?: string;
  sourceType?: string;
  search?: string;
}

function getToken() {
  return useAuthStore.getState().token || "";
}

function buildQueryString(params: Record<string, any>): string {
  const query = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return query ? `?${query}` : "";
}

export async function getCustomerLedger(customerId: string, params: LedgerQueryParams) {
  const token = getToken();
  const query = buildQueryString(params);
  return apiRequest<{
    entries: CustomerLedgerEntry[];
    nextCursor: string | null;
    hasMore: boolean;
  }>(`/customers/${customerId}/ledger${query}`, { token });
}

export async function getCustomerLedgerSummary(customerId: string, params: { shopId: string; from?: string; to?: string }) {
  const token = getToken();
  const query = buildQueryString(params);
  return apiRequest<CustomerLedgerSummary>(`/customers/${customerId}/ledger/summary${query}`, { token });
}

export async function getCustomerLedgerStatement(customerId: string, params: { shopId: string; from: string; to: string }) {
  const token = getToken();
  const query = buildQueryString(params);
  return apiRequest<CustomerLedgerStatement>(`/customers/${customerId}/ledger/statement${query}`, { token });
}

export async function postOpeningBalance(
  customerId: string,
  payload: {
    shopId: string;
    direction: "DEBIT" | "CREDIT";
    amount: number;
    effectiveAt?: string;
    notes?: string;
    clientMutationId?: string;
    attachmentAssetIds?: { assetId: string; purpose?: string; sortOrder?: number }[];
  }
) {
  const token = getToken();
  return apiRequest(`/customers/${customerId}/opening-balance`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function postLedgerAdjustment(
  customerId: string,
  payload: {
    shopId: string;
    direction: "DEBIT" | "CREDIT";
    amount: number;
    reason: string;
    effectiveAt?: string;
    clientMutationId?: string;
    attachmentAssetIds?: { assetId: string; purpose?: string; sortOrder?: number }[];
  }
) {
  const token = getToken();
  return apiRequest(`/customers/${customerId}/ledger-adjustments`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function reverseLedgerEntry(
  customerId: string,
  entryId: string,
  payload: {
    shopId: string;
    reversalReason: string;
  }
) {
  const token = getToken();
  return apiRequest(`/customers/${customerId}/ledger-entries/${entryId}/reverse`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function directUploadAsset(payload: {
  shopId: string;
  domain: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  provider?: "S3" | "ONEDRIVE";
}) {
  const token = getToken();
  const uploadUrl = `${API_BASE_URL}/assets/direct`;

  const response = await FileSystem.uploadAsync(uploadUrl, payload.fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    parameters: {
      shopId: payload.shopId,
      domain: payload.domain,
      ...(payload.provider ? { provider: payload.provider } : {}),
    },
  });

  if (response.status < 200 || response.status >= 300) {
    let msg = `Upload failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(response.body);
      msg = parsed.error?.message || parsed.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const parsed = JSON.parse(response.body);
  return (parsed.data || parsed) as {
    assetId: string;
    storageProvider: "S3" | "ONEDRIVE";
    bucket?: string;
    key?: string;
    url: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
    status: string;
  };
}

export async function createUploadIntent(payload: {
  shopId: string;
  domain: string;
  kind?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
}) {
  const token = getToken();
  return apiRequest<{
    assetId: string;
    storageProvider?: "S3" | "ONEDRIVE";
    uploadUrl: string;
    bucket: string;
    key: string;
    expiresInSeconds: number;
    headers?: Record<string, string>;
  }>("/assets/upload-intents", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function completeAssetUpload(assetId: string, payload: { shopId: string }) {
  const token = getToken();
  return apiRequest(`/assets/${assetId}/complete`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function getAssetDownloadUrl(assetId: string, params: { shopId: string }) {
  const token = getToken();
  const query = buildQueryString(params);
  return apiRequest<{ downloadUrl: string }>(`/assets/${assetId}/download-url${query}`, { token });
}

export async function requestAssetDeletion(assetId: string, payload: { shopId: string; reason?: string }) {
  const token = getToken();
  return apiRequest(`/assets/${assetId}/delete-request`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}
