import { apiRequest } from "./client";
import { useAuthStore } from "../auth/auth-store";

export type WaMessageStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
export type WaMessageType = "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" | "STICKER" | "TEMPLATE" | "FLOW";
export type WaMessageDirection = "INBOUND" | "OUTBOUND";

export interface WaMessage {
  id: string;
  conversationId: string;
  metaMessageId?: string;
  direction: WaMessageDirection;
  status: WaMessageStatus;
  type: WaMessageType;
  content: any;
  mediaId?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  errorMessage?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  createdAt: string;
}

export interface WaConversation {
  id: string;
  shopId: string;
  customerId?: string;
  phone: string;
  contactName?: string;
  lastCustomerMessageAt?: string;
  unreadCount: number;
  customer?: {
    name: string;
    phone: string;
  };
  messages?: WaMessage[];
}

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

export async function sendWaMessage(token: string, payload: {
  shopId: string;
  conversationId?: string;
  to: string;
  type: WaMessageType;
  content?: { text: string };
  template?: any;
  mediaUrl?: string;
}) {
  return apiRequest<WaMessage>("/whatsapp/send", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function syncWaTemplates(token: string, shopId: string) {
  return apiRequest<{ message: string }>("/whatsapp/sync-templates", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
  });
}

export async function syncWaFlows(token: string, shopId: string) {
  return apiRequest<{ message: string }>("/whatsapp/sync-flows", {
    method: "POST",
    token,
    body: JSON.stringify({ shopId }),
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
  sendMessage: async (payload: {
    shopId: string;
    conversationId?: string;
    to: string;
    type: WaMessageType;
    content?: { text: string };
    template?: any;
    mediaUrl?: string;
  }) => {
    const token = useAuthStore.getState().token || "";
    const res = await sendWaMessage(token, payload);
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
  }
};

