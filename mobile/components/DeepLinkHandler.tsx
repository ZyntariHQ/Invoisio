import { useDeepLinks } from "../hooks/useDeepLinks";
import { usePushNotifications } from "../hooks/usePushNotifications";

interface DeepLinkHandlerProps {
  children?: React.ReactNode;
}

/**
 * Component that handles deep link navigation
 * Place this inside the app root to enable deep linking
 */
export function DeepLinkHandler({ children }: DeepLinkHandlerProps) {
  const { handleDeepLink } = useDeepLinks();
  usePushNotifications({ onDeepLink: handleDeepLink });

  return <>{children}</>;
}
