import { apiRequest } from "../../../api/client";
import type { WaConversation } from "../../../api/whatsapp.api";
import { getDeviceInstallationId } from "../../../notifications/device-identity";

export async function linkScopedWhatsAppCustomer(
  token: string,
  shopId: string,
  integrationId: string,
  conversationId: string,
  customerId: string | null,
) {
  const sourceDeviceId = await getDeviceInstallationId();
  return apiRequest<{ conversation: WaConversation }>(
    `/whatsapp/integrations/${encodeURIComponent(integrationId)}/conversations/${encodeURIComponent(conversationId)}/customer`,
    {
      method: "PATCH",
      token,
      headers: { "X-Shop-Id": shopId },
      body: JSON.stringify({ customerId, sourceDeviceId }),
    },
  );
}
