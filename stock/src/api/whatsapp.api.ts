import { API_BASE_URL, apiRequest } from "./client";
import { useAuthStore } from "../auth/auth-store";

export type WaMessageStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "DELETED";
export type WaMessageType =
  | "TEXT"
  | "IMAGE"
  | "DOCUMENT"
  | "AUDIO"
  | "VIDEO"
  | "STICKER"
  | "TEMPLATE"
  | "FLOW"
  | "INTERACTIVE"
  | "LOCATION"
  | "CONTACT_CARD"
  | "REACTION"
  | "ORDER"
  | "SYSTEM"
  | "UNSUPPORTED";
export type WaMessageDirection = "INBOUND" | "OUTBOUND";

export type WaContact = {
  name: {
    formatted_name: string;
    first_name?: string;
    last_name?: string;
  };
  phones?: Array<{ phone: string; type?: string; wa_id?: string }>;
  emails?: Array<{ email: string; type?: string }>;
  org?: { company?: string; department?: string; title?: string };
};

export type WaMediaKind = "image" | "video" | "audio" | "document" | "sticker";
export type WaMediaReference = {
  assetId?: string;
  link?: string;
  mimeType?: string;
};

export type WaOutboundMessage =
  | { kind: "text"; text: string; previewUrl?: boolean }
  | ({ kind: "image"; caption?: string } & WaMediaReference)
  | ({ kind: "video"; caption?: string } & WaMediaReference)
  | ({ kind: "audio"; voice?: boolean } & WaMediaReference)
  | ({ kind: "document"; caption?: string; filename?: string } & WaMediaReference)
  | ({ kind: "sticker" } & WaMediaReference)
  | { kind: "location"; latitude: number; longitude: number; name?: string; address?: string }
  | { kind: "contacts"; contacts: WaContact[] }
  | {
      kind: "reply_buttons";
      body: string;
      header?: string;
      footer?: string;
      buttons: Array<{ id: string; title: string }>;
    }
  | {
      kind: "list";
      body: string;
      button: string;
      header?: string;
      footer?: string;
      sections: Array<{
        title?: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    }
  | { kind: "template"; template: any }
  | {
      kind: "flow";
      flowId: string;
      flowToken: string;
      cta: string;
      body: string;
      header?: string;
      footer?: string;
      mode?: "draft" | "published";
      action?: "navigate" | "data_exchange";
      initialScreen?: string;
      data?: Record<string, unknown>;
    };

export interface WaSendCommand {
  shopId: string;
  conversationId?: string;
  to: string;
  message: WaOutboundMessage;
  replyToMessageId?: string;
  replyToMetaMessageId?: string;
}

export interface WaMessage {
  id: string;
  conversationId: string;
  metaMessageId?: string;
  replyToMetaMessageId?: string;
  direction: WaMessageDirection;
  status: WaMessageStatus;
  type: WaMessageType;
  content: any;
  payload?: {
    subtype?: string;
    forwarded?: boolean;
    frequentlyForwarded?: boolean;
    voice?: boolean;
    animated?: boolean;
    raw?: unknown;
    reactions?: Array<{
      from: string;
      emoji: string;
      timestamp: string;
    }>;
  };
  assetId?: string;
  asset?: {
    id: string;
    kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "STICKER" | "OTHER";
    status: "UPLOADING" | "READY" | "FAILED" | "DELETED";
    mimeType: string;
    fileName?: string;
    size?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    url?: string;
  } | null;
  templateId?: string;
  templateName?: string;
  templateLanguage?: string;
  broadcastRecipientId?: string;
  errorMessage?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  createdAt: string;
}

export type WaLocalMedia = {
  kind: "image" | "video" | "audio" | "document";
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type WaMediaUpload = {
  id: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "STICKER" | "OTHER";
  status: "UPLOADING" | "READY" | "FAILED" | "DELETED";
  mimeType: string;
  fileName?: string;
  size?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  url?: string;
};

export interface WaConversation {
  id: string;
  shopId: string;
  customerId?: string;
  phone: string;
  contactName?: string;
  lastCustomerMessageAt?: string;
  unreadCount: number;
  isArchived: boolean;
  isPinned: boolean;
  customer?: {
    name: string;
    phone: string;
  };
  assignedToId?: string | null;
  messages?: WaMessage[];
}

export type WaCreateConversationInput = {
  shopId: string;
  phone: string;
  contactName?: string;
  customerId?: string;
};

export type WaTemplateStatus = "APPROVED" | "REJECTED" | "PENDING" | "PAUSED" | "DISABLED" | "IN_APPEAL" | "DELETED";
export type WaFlowStatus = "DRAFT" | "PUBLISHED" | "DEPRECATED" | "BLOCKED" | "THROTTLED";
export type WaFlowCategory =
  | "SIGN_UP"
  | "SIGN_IN"
  | "APPOINTMENT_BOOKING"
  | "LEAD_GENERATION"
  | "CONTACT_US"
  | "CUSTOMER_SUPPORT"
  | "SURVEY"
  | "OTHER";
export type WaFlowValidationError = {
  path?: string;
  message?: string;
  error?: string;
  error_type?: string;
  line_start?: number;
  line_end?: number;
};
export type WaFlowExecution = {
  id: string;
  status: "STARTED" | "OPENED" | "SUBMITTED" | "COMPLETED" | "CANCELLED" | "FAILED" | "EXPIRED";
  currentScreen?: string;
  lastAction?: string;
  attemptCount: number;
  lastEndpointError?: string;
  inputJson?: Record<string, unknown>;
  resultJson?: Record<string, unknown>;
  sentAt?: string;
  openedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  startedAt: string;
  conversation?: { contactName?: string; phone: string };
  customer?: { name: string };
};
export type WaFlow = {
  id: string;
  flowId?: string;
  name: string;
  description?: string;
  status: WaFlowStatus;
  categories?: WaFlowCategory[];
  flowJson?: Record<string, unknown>;
  jsonVersion?: string;
  dataApiVersion?: string;
  validationErrors?: WaFlowValidationError[];
  endpointEnabled: boolean;
  endpointUrl?: string;
  endpointHealth?: any;
  handlerKey?: string;
  previewUrl?: string;
  previewExpiresAt?: string;
  localRevision: number;
  deployedRevision?: number;
  syncError?: string;
  totalSent: number;
  totalResponses: number;
  syncedAt?: string;
  updatedAt: string;
  executions?: WaFlowExecution[];
};
export type WaFlowDraft = {
  name: string;
  description?: string;
  categories: WaFlowCategory[];
  flowJson: Record<string, unknown> | string;
  endpointEnabled?: boolean;
  handlerKey?: string;
};
export type WaTemplateMapping = {
  id: string;
  component: "HEADER" | "BODY" | "BUTTON" | "CARD";
  position: number;
  buttonIndex?: number;
  cardIndex?: number;
  attributeId?: string;
  sampleValue: string;
  fallbackValue?: string;
  required: boolean;
  attribute?: WaTemplateAttribute | null;
};
export type WaTemplateAttribute = {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "CURRENCY" | "DATE" | "DATETIME" | "BOOLEAN" | "URL" | "PHONE" | "EMAIL";
  source: "SYSTEM" | "CUSTOMER" | "CONVERSATION" | "SHOP" | "CUSTOM";
  sourcePath?: string;
  fallbackValue?: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
};
export type WaTemplateDefinition = {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  subtype?: string;
  parameterFormat?: "POSITIONAL" | "NAMED";
  allowCategoryChange?: boolean;
  header?: {
    format: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
    text?: string;
    exampleHandle?: string;
    documentFileName?: string;
  };
  body: { text: string; addSecurityRecommendation?: boolean };
  footer?: { text?: string; codeExpirationMinutes?: number };
  buttons?: Array<
    | { type: "QUICK_REPLY"; text: string }
    | { type: "URL"; text: string; url: string; example?: string }
    | { type: "PHONE_NUMBER"; text: string; phoneNumber: string }
    | { type: "COPY_CODE"; text?: string; example?: string }
    | { type: "FLOW"; text: string; flowId: string; flowAction?: "NAVIGATE" | "DATA_EXCHANGE" }
  >;
  authentication?: {
    otpType: "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";
    packageName?: string;
    signatureHash?: string;
    zeroTapTermsAccepted?: boolean;
  };
  callPermissionRequest?: boolean;
  carousel?: {
    type: "MEDIA" | "PRODUCT";
    cards: Array<{
      header: {
        format: "IMAGE" | "VIDEO" | "PRODUCT";
        exampleHandle?: string;
      };
      body?: { text: string };
      buttons: Array<
        | { type: "QUICK_REPLY"; text: string }
        | { type: "URL"; text: string; url: string; example?: string }
        | { type: "PHONE_NUMBER"; text: string; phoneNumber: string }
        | { type: "SPM"; text: string }
      >;
    }>;
  };
  mappings?: Array<{
    component: "HEADER" | "BODY" | "BUTTON" | "CARD";
    position: number;
    buttonIndex?: number;
    cardIndex?: number;
    attributeId?: string | null;
    sampleValue: string;
    fallbackValue?: string | null;
    required?: boolean;
  }>;
};
export type WaTemplate = {
  id: string;
  metaTemplateId?: string;
  name: string;
  language: string;
  status: WaTemplateStatus;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  subtype?: string;
  parameterFormat: string;
  mappingStatus: "VALID" | "INCOMPLETE" | "INVALID";
  components: any[];
  draftDefinition?: WaTemplateDefinition;
  metaRejectionReason?: string;
  qualityScore?: string;
  syncedAt?: string;
  updatedAt: string;
  variableMappings: WaTemplateMapping[];
  versions?: Array<{
    id: string;
    version: number;
    definition: WaTemplateDefinition;
    metaStatus?: string;
    createdAt: string;
  }>;
};

export async function fetchWaConversations(token: string, shopId: string) {
  return apiRequest<WaConversation[]>(`/whatsapp/conversations?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function fetchWaMessages(token: string, conversationId: string, limit = 50, cursor?: string) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return apiRequest<WaMessage[]>(
    `/whatsapp/conversations/${conversationId}/messages?${query.toString()}`,
    { token }
  );
}

export async function sendWaMessage(token: string, payload: WaSendCommand) {
  return apiRequest<WaMessage>("/whatsapp/messages", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function uploadWaMedia(
  token: string,
  shopId: string,
  media: WaLocalMedia,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<WaMediaUpload>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/whatsapp/media`);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("X-Shop-Id", shopId);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded / event.total);
      }
    };
    request.onerror = () => reject(new Error("Network error while uploading media"));
    request.onabort = () => reject(new Error("Media upload cancelled"));
    request.onload = () => {
      let payload: { data?: WaMediaUpload; message?: string } = {};
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        reject(new Error("Invalid media upload response"));
        return;
      }

      if (request.status < 200 || request.status >= 300 || !payload.data) {
        reject(new Error(payload.message || "Media upload failed"));
        return;
      }
      resolve(payload.data);
    };

    const form = new FormData();
    form.append("shopId", shopId);
    form.append("kind", media.kind);
    if (media.width) form.append("width", String(media.width));
    if (media.height) form.append("height", String(media.height));
    if (media.durationMs) form.append("durationMs", String(media.durationMs));
    form.append("file", {
      uri: media.uri,
      name: media.name,
      type: media.mimeType,
    } as any);
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    request.onloadend = () => signal?.removeEventListener("abort", abort);
    request.send(form);
  });
}

export function uploadWaTemplateExample(
  token: string,
  shopId: string,
  media: WaLocalMedia,
  onProgress?: (progress: number) => void,
) {
  return new Promise<WaMediaUpload & { exampleHandle: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/whatsapp/template-media`);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("X-Shop-Id", shopId);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(new Error("Network error while uploading template media"));
    request.onload = () => {
      let payload: { data?: WaMediaUpload & { exampleHandle: string }; message?: string } = {};
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        reject(new Error("Invalid template media response"));
        return;
      }
      if (request.status < 200 || request.status >= 300 || !payload.data?.exampleHandle) {
        reject(new Error(payload.message || "Template media upload failed"));
        return;
      }
      resolve(payload.data);
    };
    const form = new FormData();
    form.append("kind", media.kind);
    if (media.width) form.append("width", String(media.width));
    if (media.height) form.append("height", String(media.height));
    if (media.durationMs) form.append("durationMs", String(media.durationMs));
    form.append("file", {
      uri: media.uri,
      name: media.name,
      type: media.mimeType,
    } as any);
    request.send(form);
  });
}

export async function sendWaReaction(token: string, payload: {
  shopId: string;
  to: string;
  messageId: string;
  emoji: string;
}) {
  return apiRequest<WaMessage>("/whatsapp/react", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function deleteWaMessage(token: string, shopId: string, messageId: string) {
  return apiRequest<WaMessage>(`/whatsapp/messages/${messageId}?shopId=${encodeURIComponent(shopId)}`, {
    method: "DELETE",
    token,
  });
}

export async function archiveWaConversation(token: string, shopId: string, conversationId: string, isArchived = true) {
  return apiRequest<WaConversation>(`/whatsapp/conversations/${conversationId}/archive`, {
    method: "POST",
    token,
    body: JSON.stringify({ shopId, isArchived }),
  });
}

export async function deleteWaConversation(token: string, shopId: string, conversationId: string) {
  return apiRequest<{ success: boolean }>(`/whatsapp/conversations/${conversationId}?shopId=${encodeURIComponent(shopId)}`, {
    method: "DELETE",
    token,
  });
}

export async function createWaConversation(token: string, input: WaCreateConversationInput) {
  return apiRequest<WaConversation>("/whatsapp/conversations", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function syncWaTemplates(token: string, shopId: string) {
  return apiRequest<{ count: number }>("/whatsapp/sync-templates", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function syncWaFlows(token: string, shopId: string) {
  return apiRequest<{ count: number }>("/whatsapp/sync-flows", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function fetchWaFlows(
  token: string,
  shopId: string,
  filters: { status?: string; search?: string; page?: number; pageSize?: number } = {},
) {
  const query = new URLSearchParams({ shopId });
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== "") query.set(key, String(value));
  });
  return apiRequest<{ data: WaFlow[]; meta: { page: number; pageSize: number; total: number; pages: number } }>(
    `/whatsapp/flows?${query.toString()}`,
    { token },
  );
}

export async function fetchWaFlow(token: string, shopId: string, id: string) {
  return apiRequest<WaFlow>(`/whatsapp/flows/${id}?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function createWaFlow(token: string, shopId: string, draft: WaFlowDraft) {
  return apiRequest<WaFlow>("/whatsapp/flows", {
    method: "POST",
    token,
    body: JSON.stringify({ ...draft, shopId }),
  });
}

export async function updateWaFlowDraft(token: string, shopId: string, id: string, draft: Partial<WaFlowDraft>) {
  return apiRequest<WaFlow>(`/whatsapp/flows/${id}/draft`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ ...draft, shopId }),
  });
}

export async function validateWaFlow(token: string, shopId: string, id: string) {
  return apiRequest<{ valid: boolean; errors: WaFlowValidationError[] }>(`/whatsapp/flows/${id}/validate`, {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function deployWaFlow(token: string, shopId: string, id: string) {
  return apiRequest<WaFlow>(`/whatsapp/flows/${id}/deploy`, {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function previewWaFlow(token: string, shopId: string, id: string, invalidate = false) {
  return apiRequest<{ preview_url: string; expires_at: string }>(`/whatsapp/flows/${id}/preview`, {
    method: "POST",
    token,
    body: JSON.stringify({ shopId, invalidate }),
  });
}

export async function publishWaFlow(token: string, shopId: string, id: string) {
  return apiRequest<WaFlow>(`/whatsapp/flows/${id}/publish`, {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function deprecateWaFlow(token: string, shopId: string, id: string) {
  return apiRequest<WaFlow>(`/whatsapp/flows/${id}/deprecate`, {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function deleteWaFlow(token: string, shopId: string, id: string) {
  return apiRequest<WaFlow>(`/whatsapp/flows/${id}?shopId=${encodeURIComponent(shopId)}`, {
    method: "DELETE",
    token,
  });
}

export async function registerWaFlowPublicKey(token: string, shopId: string) {
  return apiRequest<{ success?: boolean }>("/whatsapp/flows/register-public-key", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function sendWaFlow(
  token: string,
  shopId: string,
  id: string,
  input: {
    conversationId: string;
    to?: string;
    cta: string;
    body: string;
    header?: string;
    footer?: string;
    mode?: "draft" | "published";
    action?: "navigate" | "data_exchange";
    initialScreen?: string;
    data?: Record<string, unknown>;
  },
) {
  return apiRequest<{ execution: WaFlowExecution; message: WaMessage }>(`/whatsapp/flows/${id}/send`, {
    method: "POST",
    token,
    body: JSON.stringify({ ...input, shopId }),
  });
}

export async function fetchWaTemplates(
  token: string,
  shopId: string,
  filters: { status?: string; category?: string; search?: string; page?: number; pageSize?: number } = {},
) {
  const query = new URLSearchParams({ shopId });
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== "") query.set(key, String(value));
  });
  return apiRequest<{ data: WaTemplate[]; meta: { page: number; pageSize: number; total: number; pages: number } }>(
    `/whatsapp/templates?${query.toString()}`,
    { token },
  );
}

export async function fetchWaTemplate(token: string, shopId: string, id: string) {
  return apiRequest<WaTemplate>(`/whatsapp/templates/${id}?shopId=${encodeURIComponent(shopId)}`, { token });
}

export async function createWaTemplate(token: string, shopId: string, definition: WaTemplateDefinition) {
  return apiRequest<WaTemplate>("/whatsapp/templates", {
    method: "POST",
    token,
    body: JSON.stringify({ ...definition, shopId }),
  });
}

export async function updateWaTemplate(token: string, shopId: string, id: string, definition: Partial<WaTemplateDefinition>) {
  return apiRequest<WaTemplate>(`/whatsapp/templates/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ ...definition, shopId }),
  });
}

export async function deleteWaTemplate(token: string, shopId: string, id: string) {
  return apiRequest<WaTemplate>(`/whatsapp/templates/${id}?shopId=${encodeURIComponent(shopId)}`, {
    method: "DELETE",
    token,
  });
}

export async function fetchWaTemplateAttributes(token: string, shopId: string) {
  return apiRequest<WaTemplateAttribute[]>(
    `/whatsapp/template-attributes?shopId=${encodeURIComponent(shopId)}`,
    { token },
  );
}

export async function createWaTemplateAttribute(
  token: string,
  shopId: string,
  attribute: Omit<WaTemplateAttribute, "id" | "isSystem" | "isActive">,
) {
  return apiRequest<WaTemplateAttribute>("/whatsapp/template-attributes", {
    method: "POST",
    token,
    body: JSON.stringify({ ...attribute, shopId }),
  });
}

export async function updateWaTemplateAttribute(
  token: string,
  shopId: string,
  id: string,
  attribute: Partial<Pick<WaTemplateAttribute, "label" | "type" | "sourcePath" | "fallbackValue" | "description" | "isActive">>,
) {
  return apiRequest<WaTemplateAttribute>(`/whatsapp/template-attributes/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ ...attribute, shopId }),
  });
}

export async function deleteWaTemplateAttribute(token: string, shopId: string, id: string) {
  return apiRequest<{ success: boolean }>(
    `/whatsapp/template-attributes/${id}?shopId=${encodeURIComponent(shopId)}`,
    { method: "DELETE", token },
  );
}

export async function sendWaTemplate(
  token: string,
  id: string,
  payload: {
    shopId: string;
    conversationId: string;
    to: string;
    values?: Record<string, string>;
    header?: {
      assetId?: string;
      location?: {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
      };
    };
    cards?: Array<{
      assetId?: string;
      catalogId?: string;
      productRetailerId?: string;
      quickReplyPayloads?: Record<string, string>;
    }>;
    replyToMessageId?: string;
  },
) {
  return apiRequest<WaMessage>(`/whatsapp/templates/${id}/send`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function markWaConversationRead(token: string, shopId: string, conversationId: string) {
  return apiRequest<WaConversation>(`/whatsapp/conversations/${conversationId}/read`, {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function syncWaPhoneContacts(token: string, shopId: string, contacts: any[], mergeStrategy: "MERGE" | "OVERWRITE") {
  return apiRequest<any>("/whatsapp/sync-phone-contacts", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId, contacts, mergeStrategy }),
  });
}

export const whatsappApi = {
  getConversations: async (shopId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await fetchWaConversations(token, shopId);
    return { data: { success: true, data: res } };
  },
  getMessages: async (conversationId: string, limit = 50, cursor?: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await fetchWaMessages(token, conversationId, limit, cursor);
    return { data: { success: true, data: res } };
  },
  sendMessage: async (payload: WaSendCommand) => {
    const token = useAuthStore.getState().token || "";
    const res = await sendWaMessage(token, payload);
    return { data: { success: true, data: res } };
  },
  sendReaction: async (payload: {
    shopId: string;
    to: string;
    messageId: string;
    emoji: string;
  }) => {
    const token = useAuthStore.getState().token || "";
    const res = await sendWaReaction(token, payload);
    return { data: { success: true, data: res } };
  },
  deleteMessage: async (shopId: string, messageId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await deleteWaMessage(token, shopId, messageId);
    return { data: { success: true, data: res } };
  },
  archiveConversation: async (shopId: string, conversationId: string, isArchived = true) => {
    const token = useAuthStore.getState().token || "";
    const res = await archiveWaConversation(token, shopId, conversationId, isArchived);
    return { data: { success: true, data: res } };
  },
  deleteConversation: async (shopId: string, conversationId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await deleteWaConversation(token, shopId, conversationId);
    return { data: { success: true, data: res } };
  },
  createConversation: async (input: WaCreateConversationInput) => {
    const token = useAuthStore.getState().token || "";
    const res = await createWaConversation(token, input);
    return { data: { success: true, data: res } };
  },
  syncTemplates: async (shopId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await syncWaTemplates(token, shopId);
    return { data: { success: true, data: res } };
  },
  syncFlows: async (shopId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await syncWaFlows(token, shopId);
    return { data: { success: true, data: res } };
  },
  markConversationRead: async (shopId: string, conversationId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await markWaConversationRead(token, shopId, conversationId);
    return { data: { success: true, data: res } };
  },
  syncPhoneContacts: async (shopId: string, contacts: any[], mergeStrategy: "MERGE" | "OVERWRITE" = "MERGE") => {
    const token = useAuthStore.getState().token || "";
    const res = await syncWaPhoneContacts(token, shopId, contacts, mergeStrategy);
    return { data: { success: true, data: res } };
  },
  getTemplates: async (shopId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await fetchWaTemplates(token, shopId);
    return { data: { success: true, data: res.data, meta: res.meta } };
  }
};
