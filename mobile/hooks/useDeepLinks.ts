import { useEffect, useState } from "react";
import { Linking, AppState, AppStateStatus } from "react-native";
import { useRouter } from "expo-router";
import { parseDeepLink, navigateToDeepLink, getInitialUrl } from "../lib/deep-links";
import { useAuthStore } from "./use-auth-store";

/**
 * Hook to handle deep links and universal links
 * 
 * Supports:
 * - Cold start deep links (app not running)
 * - Background state deep links (app running in background)
 * - Foreground state deep links (app actively open)
 */
export function useDeepLinks() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [pendingDeepLink, setPendingDeepLink] = useState<string | null>(null);

  // Handle deep link navigation
  const handleDeepLink = (url: string) => {
    console.log("Deep link received:", url);
    
    const data = parseDeepLink(url);
    if (!data) {
      console.warn("Invalid deep link:", url);
      return;
    }
    
    // Wait for auth if needed
    if (!isAuthenticated && data.type !== "dashboard") {
      setPendingDeepLink(url);
      return;
    }
    
    const success = navigateToDeepLink(data, router);
    if (!success) {
      console.warn("Failed to navigate to deep link:", data);
    }
  };

  // Handle initial URL on cold start
  useEffect(() => {
    const handleInitialUrl = async () => {
      const url = await getInitialUrl();
      if (url) {
        handleDeepLink(url);
      }
    };
    
    handleInitialUrl();
  }, []);

  // Handle foreground deep links
  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url);
    });
    
    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  // Handle app state changes for background deep links
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      // When app comes to foreground, check for pending deep links
      if (nextAppState === "active" && pendingDeepLink && isAuthenticated) {
        const data = parseDeepLink(pendingDeepLink);
        if (data) {
          navigateToDeepLink(data, router);
          setPendingDeepLink(null);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [pendingDeepLink, isAuthenticated]);

  // Handle authentication becoming available
  useEffect(() => {
    if (isAuthenticated && pendingDeepLink) {
      const data = parseDeepLink(pendingDeepLink);
      if (data) {
        navigateToDeepLink(data, router);
        setPendingDeepLink(null);
      }
    }
  }, [isAuthenticated, pendingDeepLink]);

  return {
    pendingDeepLink,
    clearPending: () => setPendingDeepLink(null),
  };
}