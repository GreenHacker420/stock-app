import { apiRequest } from "./client";
import { useAuthStore } from "../auth/auth-store";

export type WaMessageStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "DELETED";
export type WaMessageType = "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" | "STICKER" | "TEMPLATE" | "FLOW" | "REACTION";
export type WaMessageDirection = "INBOUND" | "OUTBOUND";

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
    reactions?: Array<{
      from: string;
      emoji: string;
      timestamp: string;
    }>;
  };
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
  isArchived: boolean;
  isPinned: boolean;
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
  replyToMessageId?: string;
}) {
  return apiRequest<WaMessage>("/whatsapp/send", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
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
  sendMessage: async (payload: {
    shopId: string;
    conversationId?: string;
    to: string;
    type: WaMessageType;
    content?: { text: string };
    template?: any;
    mediaUrl?: string;
    replyToMessageId?: string;
  }) => {
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
  }
};
