import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";

type WhatsAppPushData = {
  type?: unknown;
  shopId?: unknown;
  integrationId?: unknown;
  phoneNumberId?: unknown;
  conversationId?: unknown;
  messageId?: unknown;
  eventId?: unknown;
};

function identifier(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function whatsappNotificationUrl(data: WhatsAppPushData) {
  if (data.type !== "WHATSAPP_MESSAGE") return null;
  const shopId = identifier(data.shopId);
  const integrationId = identifier(data.integrationId);
  const conversationId = identifier(data.conversationId);
  if (!shopId || !integrationId || !conversationId) return null;

  return Linking.createURL(
    `shops/${encodeURIComponent(shopId)}/whatsapp/${encodeURIComponent(integrationId)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      queryParams: {
        phoneNumberId: identifier(data.phoneNumberId) || undefined,
        messageId: identifier(data.messageId) || undefined,
        eventId: identifier(data.eventId) || undefined,
      },
    },
  );
}

export const notificationLinking = {
  async getInitialURL() {
    const response = Notifications.getLastNotificationResponse();
    const notificationUrl = whatsappNotificationUrl(response?.notification.request.content.data || {});
    return notificationUrl || Linking.getInitialURL();
  },

  subscribe(listener: (url: string) => void) {
    const linkSubscription = Linking.addEventListener("url", ({ url }) => listener(url));
    const notificationSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = whatsappNotificationUrl(response.notification.request.content.data || {});
      if (url) listener(url);
    });

    return () => {
      linkSubscription.remove();
      notificationSubscription.remove();
    };
  },
};
