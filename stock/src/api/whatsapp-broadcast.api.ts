import { apiRequest } from "./client";

export type WaBroadcastStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "COMPLETED" | "CANCELLED" | "FAILED";

export type WaBroadcastTemplateBinding = {
  component: "HEADER" | "BODY" | "BUTTON" | "CARD";
  position: number;
  buttonIndex?: number;
  cardIndex?: number;
  mode: "ATTRIBUTE" | "FIXED";
  attributeId?: string;
  value?: string;
  fallbackValue?: string;
};

export type WaBroadcastTemplateVariables = {
  /** New runtime binding contract. Values are resolved for each recipient when sending. */
  bindings?: WaBroadcastTemplateBinding[];
  /** Legacy positional payload kept for existing drafts/campaigns. */
  header?: string[];
  body?: string[];
  headerAssetId?: string;
  headerFileName?: string;
};

export type WaBroadcast = {
  id: string;
  shopId: string;
  integrationId?: string | null;
  name: string;
  templateId?: string | null;
  templateVariables?: WaBroadcastTemplateVariables | null;
  audienceCount: number;
  status: WaBroadcastStatus;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount?: number;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  template?: {
    id?: string;
    name: string;
    language?: string;
    category?: string;
  } | null;
  remainingInQueue?: number | null;
};

export type WaBroadcastRecipientInput = {
  phone: string;
  name?: string;
  customerId?: string;
  sourceContactId?: string;
  source?: "CUSTOMER" | "DEVICE_CONTACT" | "MANUAL";
};

export type WaBroadcastRecipient = {
  id: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone: string;
  source: "CUSTOMER" | "DEVICE_CONTACT" | "MANUAL";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED";
  errorMessage?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
};

export function fetchWaBroadcasts(token: string, shopId: string) {
  return apiRequest<WaBroadcast[]>(
    `/whatsapp/broadcasts?shopId=${encodeURIComponent(shopId)}`,
    { token },
  );
}

export function fetchWaBroadcast(token: string, shopId: string, broadcastId: string) {
  return apiRequest<WaBroadcast>(
    `/whatsapp/broadcasts/${encodeURIComponent(broadcastId)}`,
    { token, headers: { "X-Shop-Id": shopId } },
  );
}

export function createWaBroadcast(
  token: string,
  input: {
    shopId: string;
    integrationId?: string;
    name: string;
    templateId: string;
    templateVariables?: WaBroadcastTemplateVariables;
  },
) {
  return apiRequest<WaBroadcast>("/whatsapp/broadcasts", {
    method: "POST",
    token,
    body: JSON.stringify({
      ...input,
      audienceFilter: { mode: "EXPLICIT" },
    }),
  });
}

export function addWaBroadcastRecipients(
  token: string,
  shopId: string,
  broadcastId: string,
  recipients: WaBroadcastRecipientInput[],
) {
  return apiRequest<{
    acceptedCount: number;
    invalidCount: number;
    duplicateCount: number;
    totalCount: number;
  }>(`/whatsapp/broadcasts/${encodeURIComponent(broadcastId)}/recipients`, {
    method: "POST",
    token,
    headers: { "X-Shop-Id": shopId },
    body: JSON.stringify({ recipients }),
  });
}

export function sendWaBroadcast(token: string, shopId: string, broadcastId: string) {
  return apiRequest<{ message?: string }>(
    `/whatsapp/broadcasts/${encodeURIComponent(broadcastId)}/send`,
    { method: "POST", token, headers: { "X-Shop-Id": shopId } },
  );
}

export function sendWaBroadcastTest(
  token: string,
  input: {
    shopId: string;
    integrationId?: string;
    templateId: string;
    templateVariables?: WaBroadcastTemplateVariables;
    phone: string;
    name?: string;
  },
) {
  return apiRequest<{ id?: string; conversationId?: string }>("/whatsapp/broadcasts/test", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function scheduleWaBroadcast(
  token: string,
  shopId: string,
  broadcastId: string,
  scheduledAt: string,
) {
  return apiRequest<WaBroadcast>(
    `/whatsapp/broadcasts/${encodeURIComponent(broadcastId)}/schedule`,
    {
      method: "POST",
      token,
      headers: { "X-Shop-Id": shopId },
      body: JSON.stringify({ scheduledAt }),
    },
  );
}

export function cancelWaBroadcast(token: string, shopId: string, broadcastId: string) {
  return apiRequest<WaBroadcast>(
    `/whatsapp/broadcasts/${encodeURIComponent(broadcastId)}/cancel`,
    { method: "POST", token, headers: { "X-Shop-Id": shopId } },
  );
}

export function retryFailedWaBroadcast(token: string, shopId: string, broadcastId: string) {
  return apiRequest<{ retriedCount: number; startedAt?: string }>(
    `/whatsapp/broadcasts/${encodeURIComponent(broadcastId)}/retry-failed`,
    { method: "POST", token, headers: { "X-Shop-Id": shopId } },
  );
}

export function stopWaBroadcast(token: string, shopId: string, broadcastId: string) {
  return apiRequest<WaBroadcast>(
    `/whatsapp/broadcasts/${encodeURIComponent(broadcastId)}/stop`,
    { method: "POST", token, headers: { "X-Shop-Id": shopId } },
  );
}

export function discardWaBroadcastDraft(token: string, shopId: string, broadcastId: string) {
  return apiRequest<{ deleted: true }>(
    `/whatsapp/broadcasts/${encodeURIComponent(broadcastId)}/draft`,
    { method: "DELETE", token, headers: { "X-Shop-Id": shopId } },
  );
}

export function fetchWaBroadcastRecipients(
  token: string,
  shopId: string,
  broadcastId: string,
  page = 1,
  limit = 100,
) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest<WaBroadcastRecipient[]>(
    `/whatsapp/broadcasts/${encodeURIComponent(broadcastId)}/recipients?${query.toString()}`,
    { token, headers: { "X-Shop-Id": shopId } },
  );
}
