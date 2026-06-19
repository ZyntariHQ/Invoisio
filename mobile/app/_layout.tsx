import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import axios from "axios";
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

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
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
      }),
  );
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  const { loadAuth } = useAuthStore();

  // Load authentication state on app start
  useEffect(() => {
    const initAuth = async () => {
      await loadAuth();
    };
    void initAuth();
  }, [loadAuth]);

  // Handle mid-session expiry: if any authenticated request is rejected because
  // the token is no longer valid, clear the session. AuthGuard then redirects
  // the merchant back to login.
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;
          if (status === 401 || status === 403) {
            const { isAuthenticated, clearAuth } = useAuthStore.getState();
            if (isAuthenticated) {
              void clearAuth();
            }
          }
        }
        throw error;
      },
    );

    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, []);

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
          </Stack>
        </AuthGuard>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
