import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useAuthStore } from "../auth/auth-store";
import { registerPushToken } from "../api/client";

// Configure how notifications behave when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const FCMManager = {
  async registerForPushNotificationsAsync(token: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      console.log('Push notifications are not supported on Web.');
      return null;
    }

    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications. Simulating token for development...');
      const simulatedToken = `ExponentPushToken[simulated-${Math.random().toString(36).substring(2, 11)}]`;
      try {
        await registerPushToken(token, simulatedToken);
      } catch (err) {
        console.warn('Could not save simulated push token to server database:', err);
      }
      return simulatedToken;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Permission not granted for push notifications.');
        return null;
      }

      let expoPushToken: string | null = null;
      try {
        // Get project ID from constants (required for EAS push notifications)
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;

        if (!projectId) {
          console.warn("EAS Project ID not found in Constants.expoConfig");
        }

        // 1. Get Expo Push Token (standard for EAS Push service)
        expoPushToken = (await Notifications.getExpoPushTokenAsync({
          projectId,
        })).data;
        console.log('Expo Push Token (EAS):', expoPushToken);
      } catch (expoTokenErr) {
        console.warn(
          'Failed to retrieve Expo Push Token. On Android, this requires a Firebase project configured with google-services.json in app.json.',
          expoTokenErr
        );
      }

      // 2. Also retrieve native FCM token if on Android or APNs if on iOS (agnostic device push token)
      if (expoPushToken) {
        try {
          const nativeDeviceToken = (await Notifications.getDevicePushTokenAsync()).data;
          console.log('Native Device Push Token (FCM/APNS):', nativeDeviceToken);
        } catch (nativeTokenErr) {
          console.warn('Failed to retrieve native device token:', nativeTokenErr);
        }

        console.log('Registering push token with backend server:', expoPushToken);
        await registerPushToken(token, expoPushToken);
      } else {
        console.log('No push token available. Bypassing backend registration.');
      }

      // Configure Android-specific notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      return expoPushToken;
    } catch (error) {
      console.error('Failed to register push token:', error);
      return null;
    }
  },

  setupBackgroundNotificationHandlers() {
    if (Platform.OS === 'web') return;
    console.log('Background notification handlers initialized.');
  }
};

export function useNotificationSetup() {
  const token = useAuthStore((state) => state.token);
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    if (!token) return;

    // Trigger permissions registration flow
    FCMManager.registerForPushNotificationsAsync(token);
    FCMManager.setupBackgroundNotificationHandlers();

    // Listener for notifications received when app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Foreground notification received:', notification);
    });

    // Listener for when user taps or interacts with a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped / interacted with:', response);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [token]);
}
