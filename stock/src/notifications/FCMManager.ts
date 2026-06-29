import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { requestPermissionsAsync } from "expo-contacts";
import Constants from "expo-constants";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { registerDevice, UserDevicePlatform } from "../api/client";
import { getDeviceInstallationId } from "./device-identity";
import { getToken, setToken } from "../auth/token-storage";
import { useQueryClient } from "@tanstack/react-query";
import { handleDomainEvent, type DomainEvent } from "../realtime/domainEvents";

const DEVICE_REGISTRATION_SIGNATURE_KEY = "shopcontrol_device_registration_signature";
let registrationInFlight: Promise<string | null> | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function platformName(): UserDevicePlatform {
  if (Platform.OS === "ios") return "IOS";
  if (Platform.OS === "android") return "ANDROID";
  return "WEB";
}

function stringifyNativeToken(value: unknown) {
  if (typeof value === "string") return value;
  return value == null ? null : JSON.stringify(value);
}

export const FCMManager = {
  async registerForPushNotificationsAsync(token: string): Promise<string | null> {
    if (registrationInFlight) return registrationInFlight;
    registrationInFlight = this.performRegistration(token).finally(() => {
      registrationInFlight = null;
    });
    return registrationInFlight;
  },

  async performRegistration(token: string): Promise<string | null> {
    const installationId = await getDeviceInstallationId();
    if (Platform.OS === "web") {
      const payload = {
        installationId,
        platform: "WEB",
        appVersion: Constants.expoConfig?.version,
        deviceName: "Web browser",
        notificationsEnabled: false,
      } as const;
      await registerDeviceIfChanged(token, payload);
      return null;
    }

    let expoPushToken: string | null = null;
    let nativePushToken: string | null = null;
    let notificationsEnabled = false;

    try {
      const permissions = await Notifications.getPermissionsAsync();
      let status = permissions.status;
      if (status !== "granted") {
        status = (await Notifications.requestPermissionsAsync()).status;
      }
      notificationsEnabled = status === "granted";

      if (notificationsEnabled && Device.isDevice) {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (projectId) {
          expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        }
        try {
          nativePushToken = stringifyNativeToken((await Notifications.getDevicePushTokenAsync()).data);
        } catch (error) {
          console.warn("Native push token is unavailable:", error);
        }
      } else if (__DEV__ && !Device.isDevice) {
        expoPushToken = `ExponentPushToken[simulated-${installationId.slice(-16)}]`;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#25D366",
        });
      }

      await registerDeviceIfChanged(token, {
        installationId,
        platform: platformName(),
        pushToken: expoPushToken,
        nativePushToken,
        appVersion: Constants.expoConfig?.version,
        buildVersion: Platform.OS === "ios"
          ? Constants.expoConfig?.ios?.buildNumber
          : String(Constants.expoConfig?.android?.versionCode || ""),
        deviceName: Device.deviceName || Device.modelName,
        osVersion: Device.osVersion,
        notificationsEnabled,
        voipEnabled: false,
        metadata: {
          brand: Device.brand,
          manufacturer: Device.manufacturer,
          deviceYearClass: Device.deviceYearClass,
          isPhysicalDevice: Device.isDevice,
        },
      });
      return expoPushToken;
    } catch (error) {
      console.error("Failed to register device:", error);
      return null;
    }
  },

  setupBackgroundNotificationHandlers() {
    if (Platform.OS === "web") return;
  },
};

async function registerDeviceIfChanged(token: string, payload: Parameters<typeof registerDevice>[1]) {
  const signature = JSON.stringify({ token, payload });
  const existing = await getToken(DEVICE_REGISTRATION_SIGNATURE_KEY);
  if (existing === signature) return null;
  const device = await registerDevice(token, payload);
  await setToken(DEVICE_REGISTRATION_SIGNATURE_KEY, signature);
  return device;
}

export function useNotificationSetup() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);

  useEffect(() => {
    if (!token) return;

    FCMManager.registerForPushNotificationsAsync(token);
    FCMManager.setupBackgroundNotificationHandlers();

    requestPermissionsAsync().catch((error) => {
      console.warn("Contacts permission request failed:", error);
    });

    const handleNotificationData = async (data: Record<string, unknown> = {}) => {
      const deviceId = await getDeviceInstallationId();
      if (data.eventId && data.shopId && data.entity && data.action && data.entityId) {
        handleDomainEvent(queryClient, {
          eventId: String(data.eventId),
          shopId: String(data.shopId),
          entity: String(data.entity) as DomainEvent["entity"],
          action: String(data.action),
          entityId: String(data.entityId),
          actorUserId: String(data.actorUserId || ""),
          updatedAt: String(data.updatedAt || new Date().toISOString()),
          queryKeys: typeof data.queryKeys === "string" ? data.queryKeys.split(",") : undefined,
        }, deviceId);
      } else if (data.shopId) {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      }

    };

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      handleNotificationData(notification.request.content.data as Record<string, unknown>).catch(() => {});
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationData(response.notification.request.content.data as Record<string, unknown>).catch(() => {});
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [activeShopId, queryClient, token]);
}
