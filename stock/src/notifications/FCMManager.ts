import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  getExpoPushTokenAsync,
  getDevicePushTokenAsync,
  setNotificationChannelAsync,
  AndroidImportance,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  addPushTokenListener,
  addNotificationsDroppedListener,
  type EventSubscription,
} from "expo-notifications";
import {
  isDevice,
  deviceName as expoDeviceName,
  modelName,
  osVersion as expoOsVersion,
  brand as expoBrand,
  manufacturer as expoManufacturer,
  deviceYearClass as expoDeviceYearClass,
} from "expo-device";
import Constants from "expo-constants";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { registerDevice, UserDevicePlatform } from "../api/client";
import { getDeviceInstallationId } from "./device-identity";
import { getToken, setToken } from "../auth/token-storage";
import { useQueryClient } from "@tanstack/react-query";
import { handleDomainEvent, type DomainEvent } from "../realtime/domainEvents";
import { reconcileDomainEventsForShop } from "../realtime/domainEventReconciliation";

const DEVICE_REGISTRATION_SIGNATURE_KEY = "shopcontrol_device_registration_signature";
let registrationInFlight: Promise<string | null> | null = null;

setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowBadge: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowList: true,
  }),
});

function platformName(): UserDevicePlatform {
  if (Platform.OS === "android") return "ANDROID";
  if (Platform.OS === "ios") return "IOS";
  return "WEB";
}

function stringifyNativeToken(token: unknown): string | null {
  if (typeof token === "string") return token;
  if (!token) return null;
  try {
    return JSON.stringify(token);
  } catch {
    return String(token);
  }
}

export const FCMManager = {
  async registerForPushNotificationsAsync(token: string): Promise<string | null> {
    if (registrationInFlight) return registrationInFlight;

    registrationInFlight = (async () => {
      try {
        return await this._doRegister(token);
      } finally {
        registrationInFlight = null;
      }
    })();

    return registrationInFlight;
  },

  setupBackgroundNotificationHandlers() {
    // Registered once when FCMManager initializes
  },

  async _doRegister(token: string): Promise<string | null> {
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
      const permissions = await getPermissionsAsync();
      let status = permissions.status;
      if (status !== "granted") {
        status = (await requestPermissionsAsync()).status;
      }
      notificationsEnabled = status === "granted";

      if (notificationsEnabled && isDevice) {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (projectId) {
          expoPushToken = (await getExpoPushTokenAsync({ projectId })).data;
        }
        try {
          nativePushToken = stringifyNativeToken((await getDevicePushTokenAsync()).data);
        } catch (error) {
          console.warn("Native push token is unavailable:", error);
        }
      } else if (__DEV__ && !isDevice) {
        expoPushToken = `ExponentPushToken[simulated-${installationId.slice(-16)}]`;
      }

      if (Platform.OS === "android") {
        await setNotificationChannelAsync("default", {
          name: "default",
          importance: AndroidImportance.MAX,
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
        deviceName: expoDeviceName || modelName,
        osVersion: expoOsVersion,
        notificationsEnabled,
        voipEnabled: false,
        metadata: {
          brand: expoBrand,
          manufacturer: expoManufacturer,
          deviceYearClass: expoDeviceYearClass,
          isPhysicalDevice: isDevice,
        },
      });
      return expoPushToken;
    } catch (error) {
      console.error("Failed to register device:", error);
      return null;
    }
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
  const userId = useAuthStore((state) => state.user?.id);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  const notificationListener = useRef<EventSubscription | undefined>(undefined);
  const responseListener = useRef<EventSubscription | undefined>(undefined);

  useEffect(() => {
    if (!token) return;

    const register = () => {
      void FCMManager.registerForPushNotificationsAsync(token);
    };

    const reconcileShop = async (shopId?: string | null) => {
      if (!userId || !shopId) return;
      const deviceId = await getDeviceInstallationId();
      await reconcileDomainEventsForShop(
        userId,
        shopId,
        token,
        queryClient,
        deviceId,
      );
    };

    register();
    FCMManager.setupBackgroundNotificationHandlers();

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
        return;
      }

      const pushShopId = typeof data.shopId === "string" ? data.shopId : activeShopId;
      if (pushShopId) {
        await reconcileShop(pushShopId);
      } else {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
      }
    };

    notificationListener.current = addNotificationReceivedListener((notification) => {
      handleNotificationData(notification.request.content.data as Record<string, unknown>).catch(() => {});
    });
    responseListener.current = addNotificationResponseReceivedListener((response) => {
      handleNotificationData(response.notification.request.content.data as Record<string, unknown>).catch(() => {});
    });

    const pushTokenSubscription = addPushTokenListener(() => {
      register();
    });

    const droppedSubscription = addNotificationsDroppedListener(() => {
      void reconcileShop(activeShopId);
    });

    const networkSubscription = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) register();
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") register();
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
      pushTokenSubscription.remove();
      droppedSubscription.remove();
      networkSubscription();
      appStateSubscription.remove();
    };
  }, [activeShopId, queryClient, token, userId]);
}