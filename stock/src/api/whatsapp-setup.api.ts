import { apiRequest } from "./client";
import { useAuthStore } from "../auth/auth-store";

export interface WhatsAppIntegrationHealth {
  id: string;
  shopId: string;
  businessAccountId: string;
  phoneNumberId: string;
  phoneNumber?: string;
  businessName?: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  accountStatus?: string;
  accountReviewStatus?: string;
  displayNameStatus?: string;
  capabilities?: Record<string, unknown>;
  messagingLimitTier?: string;
  qualityRating?: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  callingEnabled: boolean;
  rsaPublicKey?: string;
  connectedAt?: string;
  lastWebhookAt?: string;
  lastManagementEventAt?: string;
  lastManagementEventField?: string;
  hasAppSecret: boolean;
  hasAccessToken: boolean;
}

interface WhatsAppSetupResponse {
  success: boolean;
  data: WhatsAppIntegrationHealth | null;
  message?: string;
}

export const whatsappSetupApi = {
  getSetupInfo: async (shopId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await apiRequest<WhatsAppSetupResponse>(`/whatsapp/setup?shopId=${encodeURIComponent(shopId)}`, { token });
    return { data: res };
  },
  saveSetupInfo: async (payload: any) => {
    const token = useAuthStore.getState().token || "";
    const res = await apiRequest<any>(`/whatsapp/setup`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
    return { data: res };
  },
  fbEmbeddedSignup: async (payload: { shopId: string; code: string; redirectUri: string }) => {
    const token = useAuthStore.getState().token || "";
    const res = await apiRequest<any>(`/whatsapp/fb-embedded-signup`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
    return { data: res };
  },
  deleteSetupInfo: async (shopId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await apiRequest<any>(`/whatsapp/setup?shopId=${encodeURIComponent(shopId)}`, {
      method: "DELETE",
      token,
    });
    return { data: res };
  },
  rotateKeys: async (shopId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await apiRequest<any>(`/whatsapp/rotate-keys`, {
      method: "POST",
      token,
      body: JSON.stringify({ shopId }),
    });
    return { data: res };
  },
};
