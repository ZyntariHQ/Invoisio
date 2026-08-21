import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, AppState, AppStateStatus } from "react-native";
import { useRouter } from "expo-router";
import {
  parseDeepLink,
  navigateToDeepLink,
  getInitialUrl,
} from "../lib/deep-links";
import { deepLinkRequiresAuth } from "../lib/auth-routes";
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
  const { isAuthenticated, isLoading } = useAuthStore();
  const [pendingDeepLink, setPendingDeepLink] = useState<string | null>(null);
  const handledInitialUrl = useRef(false);

  // Handle deep link navigation
  const handleDeepLink = useCallback(
    (url: string) => {
      console.log("Deep link received:", url);

      const data = parseDeepLink(url);
      if (!data) {
        console.warn("Invalid deep link:", url);
        return;
      }

      // Wait for auth if needed
      // Payment and receipt entry points are intentionally public so payers do
      // not need a merchant account. Merchant-only links resume after sign-in.
      if (!isAuthenticated && deepLinkRequiresAuth(data.type)) {
        setPendingDeepLink(url);
        return;
      }

      const success = navigateToDeepLink(data, router);
      if (!success) {
        console.warn("Failed to navigate to deep link:", data);
      }
    },
    [isAuthenticated, router],
  );

  // Handle initial URL on cold start
  useEffect(() => {
    const handleInitialUrl = async () => {
      if (handledInitialUrl.current) return;
      handledInitialUrl.current = true;
      const url = await getInitialUrl();
      if (url) {
        handleDeepLink(url);
      }
    };

    void handleInitialUrl();
  }, [handleDeepLink]);

  // Handle foreground deep links
  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  // Handle app state changes for background deep links
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        // When app comes to foreground, check for pending deep links
        if (nextAppState === "active" && pendingDeepLink && isAuthenticated) {
          const data = parseDeepLink(pendingDeepLink);
          if (data) {
            navigateToDeepLink(data, router);
            setPendingDeepLink(null);
          }
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [pendingDeepLink, isAuthenticated, router]);

  // Handle authentication becoming available
  useEffect(() => {
    if (isAuthenticated && pendingDeepLink) {
      const data = parseDeepLink(pendingDeepLink);
      if (data) {
        navigateToDeepLink(data, router);
        setPendingDeepLink(null);
      }
    }
  }, [isAuthenticated, pendingDeepLink, router]);

  // Once session restoration finishes, send unauthenticated merchants to
  // sign-in while retaining the original destination for post-auth resume.
  useEffect(() => {
    if (!isLoading && !isAuthenticated && pendingDeepLink) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, pendingDeepLink, router]);

  return {
    pendingDeepLink,
    handleDeepLink,
    clearPending: () => {
      setPendingDeepLink(null);
    },
  };
}
