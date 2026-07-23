import { useState, useEffect, useRef } from "react";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { parseDeepLink, navigateToDeepLink } from "../lib/deep-links";
import { useAuthStore } from "./use-auth-store";

export interface PushNotificationState {
  expoPushToken?: Notifications.ExpoPushToken | undefined;
  notification?: Notifications.Notification | undefined;
}

export const usePushNotifications = (): PushNotificationState => {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldPlaySound: true,
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldSetBadge: false,
      }),
  });

  const [expoPushToken, setExpoPushToken] = useState<
    Notifications.ExpoPushToken | undefined
  >();
  const [notification, setNotification] = useState<
    Notifications.Notification | undefined
  >();

  const notificationListener =
    useRef<Notifications.EventSubscription>(undefined);
  const responseListener = useRef<Notifications.EventSubscription>(undefined);

  async function registerForPushNotificationsAsync() {
    let token;
    if (Device.isDevice) {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== Notifications.PermissionStatus.GRANTED) {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== Notifications.PermissionStatus.GRANTED) {
        console.warn("Failed to get push token for push notification");
        return;
      }

      try {
        const expoExtra = Constants.expoConfig?.extra as
          | Record<string, unknown>
          | undefined;
        const easObj = expoExtra?.["eas"] as
          | Record<string, unknown>
          | undefined;
        const easProjectId =
          typeof easObj?.["projectId"] === "string"
            ? easObj["projectId"]
            : undefined;
        const easConfig = Constants.easConfig as Record<string, unknown> | null;
        const configProjectId =
          typeof easConfig?.["projectId"] === "string"
            ? easConfig["projectId"]
            : undefined;
        const projectId = easProjectId ?? configProjectId;

        const tokenOptions: Record<string, string> = {};
        if (typeof projectId === "string") {
          tokenOptions["projectId"] = projectId;
        }
        token = await Notifications.getExpoPushTokenAsync(tokenOptions);
      } catch (e: unknown) {
        console.warn("Failed to get expo push token:", e);
      }
    } else {
      console.warn("Must be using a physical device for Push Notifications");
    }

    if (Platform.OS === "android") {
      void Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    return token;
  }

  // Handle notification response and navigate
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    
    // Check if notification contains a deep link
    const deepLinkUrl = data?.deepLink || data?.url || data?.link;
    
    if (deepLinkUrl && typeof deepLinkUrl === "string") {
      console.log("Notification deep link:", deepLinkUrl);
      const parsedData = parseDeepLink(deepLinkUrl);
      if (parsedData) {
        // If not authenticated, the deep link handler will queue it
        navigateToDeepLink(parsedData, router);
        return;
      }
    }
    
    // Fallback: check for invoice ID in notification data
    const invoiceId = data?.invoiceId || data?.invoice_id;
    if (invoiceId && typeof invoiceId === "string") {
      router.push(`/invoices/${invoiceId}`);
      return;
    }
    
    console.log("Notification response:", response);
  };

  useEffect(() => {
    void registerForPushNotificationsAsync().then((token) => {
      setExpoPushToken(token);
    });

    notificationListener.current =
      Notifications.addNotificationReceivedListener((n) => {
        setNotification(n);
      });

    // Updated: Navigate on notification response
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationResponse(response);
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return {
    expoPushToken,
    notification,
  };
};