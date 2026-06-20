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

export type WaOnboardingStatus =
  | "CREATED"
  | "AUTHORIZED"
  | "ASSETS_DISCOVERED"
  | "APP_SUBSCRIBED"
  | "NUMBER_REGISTERED"
  | "CONNECTED"
  | "ACTION_REQUIRED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export interface WaOnboardingSession {
  id: string;
  shopId: string;
  status: WaOnboardingStatus;
  mode: "CLOUD_API" | "COEXISTENCE";
  businessPortfolioId?: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  finishEvent?: string | null;
  currentStep?: string | null;
  completedSteps: string[];
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  retryCount: number;
  expiresAt: string;
  connectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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
  createOnboardingSession: async (shopId: string, mode: "CLOUD_API" | "COEXISTENCE") => {
    const token = useAuthStore.getState().token || "";
    return apiRequest<{ session: WaOnboardingSession; launchUrl: string; redirectUri: string }>(
      "/whatsapp/onboarding/sessions",
      {
        method: "POST",
        token,
        body: JSON.stringify({ shopId, mode }),
      },
    );
  },
  getOnboardingSession: async (shopId: string, sessionId: string) => {
    const token = useAuthStore.getState().token || "";
    return apiRequest<WaOnboardingSession>(
      `/whatsapp/onboarding/sessions/${encodeURIComponent(sessionId)}?shopId=${encodeURIComponent(shopId)}`,
      { token },
    );
  },
  continueOnboardingSession: async (shopId: string, sessionId: string) => {
    const token = useAuthStore.getState().token || "";
    return apiRequest<WaOnboardingSession>(
      `/whatsapp/onboarding/sessions/${encodeURIComponent(sessionId)}/continue`,
      {
      method: "POST",
      token,
        body: JSON.stringify({ shopId }),
      },
    );
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
