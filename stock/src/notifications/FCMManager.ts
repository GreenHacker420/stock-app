import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { requestPermissionsAsync } from "expo-contacts";
import Constants from "expo-constants";
import { useAuthStore } from "../auth/auth-store";
import { registerDevice, UserDevicePlatform } from "../api/client";
import { getDeviceInstallationId } from "./device-identity";

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
    const installationId = await getDeviceInstallationId();
    if (Platform.OS === "web") {
      await registerDevice(token, {
        installationId,
        platform: "WEB",
        appVersion: Constants.expoConfig?.version,
        deviceName: "Web browser",
        notificationsEnabled: false,
      });
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

      await registerDevice(token, {
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

export function useNotificationSetup() {
  const token = useAuthStore((state) => state.token);
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    if (!token) return;

    FCMManager.registerForPushNotificationsAsync(token);
    FCMManager.setupBackgroundNotificationHandlers();

    requestPermissionsAsync().catch((error) => {
      console.warn("Contacts permission request failed:", error);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [token]);
}
