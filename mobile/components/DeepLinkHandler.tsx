import { useEffect } from "react";
import { useSegments } from "expo-router";
import { useDeepLinks } from "../hooks/useDeepLinks";

interface DeepLinkHandlerProps {
  children: React.ReactNode;
}

/**
 * Component that handles deep link navigation
 * Place this inside the app root to enable deep linking
 */
export function DeepLinkHandler({ children }: DeepLinkHandlerProps) {
  const { pendingDeepLink, clearPending } = useDeepLinks();
  const segments = useSegments();

  // Clear pending deep link if user navigates manually
  useEffect(() => {
    if (pendingDeepLink && segments.length > 0) {
      clearPending();
    }
  }, [segments]);

  return <>{children}</>;
}