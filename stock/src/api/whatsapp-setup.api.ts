import { apiRequest } from "./client";
import { useAuthStore } from "../auth/auth-store";

export const whatsappSetupApi = {
  getSetupInfo: async (shopId: string) => {
    const token = useAuthStore.getState().token || "";
    const res = await apiRequest<any>(`/whatsapp/setup?shopId=${encodeURIComponent(shopId)}`, { token });
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
  fbEmbeddedSignup: async (payload: { shopId: string; code: string }) => {
    const token = useAuthStore.getState().token || "";
    const res = await apiRequest<any>(`/whatsapp/fb-embedded-signup`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
    return { data: res };
  },
};
