import { useDeepLinks } from "../hooks/useDeepLinks";

interface DeepLinkHandlerProps {
  children?: React.ReactNode;
}

/**
 * Component that handles deep link navigation
 * Place this inside the app root to enable deep linking
 */
export function DeepLinkHandler({ children }: DeepLinkHandlerProps) {
  useDeepLinks();

  return <>{children}</>;
}
