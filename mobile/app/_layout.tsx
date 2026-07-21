import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { AuthGuard } from "../components/auth-guard";
import { useAuthStore } from "../hooks/use-auth-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { AuthService } from "../lib/auth-service";
import { OfflineBanner } from "../components/OfflineBanner";
import { ConnectivityProvider } from "../components/ConnectivityProvider";
import { offlineQueue } from "../lib/offline-queue";
import { useConnectivity } from "../hooks/use-connectivity";

// Create a client for React Query outside component to avoid re-creation
const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnMount: false,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
      },
    },
  });

function LayoutContent() {
  const { isOnline } = useConnectivity();
  const { loadAuth, isAuthenticated, accessToken } = useAuthStore();
  const { expoPushToken } = usePushNotifications();

  // Load authentication state on app start
  useEffect(() => {
    const initAuth = async () => {
      await loadAuth();
    };
    void initAuth();
  }, [loadAuth]);

  // Sync push token with backend when authenticated
  useEffect(() => {
    if (isAuthenticated && accessToken && expoPushToken?.data) {
      void AuthService.registerPushToken(accessToken, expoPushToken.data);
    }
  }, [isAuthenticated, accessToken, expoPushToken]);

  // Handle retry for offline queue
  const handleRetry = async () => {
    await offlineQueue.processQueue(
      () => {
        console.log("Request processed successfully");
      },
      (request, error) => {
        console.error(`Failed to process request ${request.id}:`, error);
      }
    );
  };

  const handleDismiss = () => {
    // Banner will auto-dismiss when connectivity is restored
    // This is for manual dismiss
  };

  return (
    <>
      <OfflineBanner onRetry={handleRetry} onDismiss={handleDismiss} />
      <AuthGuard>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#050914" },
            headerShadowVisible: false,
            headerTintColor: "#E2E8F0",
            headerTitleStyle: { fontWeight: "600" },
            contentStyle: { backgroundColor: "#050914" },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="login"
            options={{ title: "Log in", headerShown: false }}
          />
          <Stack.Screen
            name="dashboard"
            options={{ title: "Dashboard", headerShown: false }}
          />
          <Stack.Screen
            name="create-invoice"
            options={{ title: "Create Invoice", headerShown: false }}
          />
          <Stack.Screen
            name="invoices/[id]"
            options={{ title: "Invoice", headerShown: false }}
          />
          <Stack.Screen
            name="scan"
            options={{ title: "Scan to Pay", headerShown: false }}
          />
          <Stack.Screen
            name="settings"
            options={{ title: "Settings", headerShown: false }}
          />
        </Stack>
      </AuthGuard>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View className="flex-1 items-center justify-center bg-[#050914]">
          <ActivityIndicator color="#E2E8F0" size="large" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <QueryClientProvider client={queryClient}>
        <ConnectivityProvider>
          <LayoutContent />
        </ConnectivityProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}