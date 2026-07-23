// mobile/lib/deep-links.ts
import { Linking } from "react-native";
import * as Notifications from "expo-notifications";

export type DeepLinkType = "invoice" | "payment" | "receipt" | "dashboard" | "create-invoice";

export interface DeepLinkData {
  type: DeepLinkType;
  id?: string;
  params?: Record<string, string>;
}

/**
 * Parse a deep link URL into structured data
 * 
 * Supported formats:
 * - invoisio://invoice/{id}
 * - invoisio://payment/{id}
 * - invoisio://receipt/{id}
 * - invoisio://dashboard
 * - invoisio://create-invoice
 * 
 * Web URLs:
 * - https://invoisio.com/invoice/{id}
 * - https://invoisio.com/payment/{id}
 * - https://invoisio.com/receipt/{id}
 * - https://invoisio.com/dashboard
 * - https://invoisio.com/create-invoice
 */
export function parseDeepLink(url: string): DeepLinkData | null {
  try {
    // Handle both app and web URLs
    let parsedUrl: URL;
    
    if (url.startsWith("invoisio://")) {
      // App scheme: invoisio://invoice/123
      const path = url.replace("invoisio://", "");
      const parts = path.split("/");
      const type = parts[0] as DeepLinkType;
      const id = parts[1];
      
      if (!type) return null;
      
      return {
        type,
        id,
        params: {},
      };
    } else {
      // Web URL: https://invoisio.com/invoice/123
      parsedUrl = new URL(url);
      const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
      
      if (pathSegments.length === 0) {
        // Root path - navigate to dashboard
        return { type: "dashboard" };
      }
      
      const type = pathSegments[0] as DeepLinkType;
      const id = pathSegments[1];
      
      // Extract query params
      const params: Record<string, string> = {};
      parsedUrl.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      
      return {
        type,
        id,
        params,
      };
    }
  } catch (error) {
    console.error("Failed to parse deep link:", error);
    return null;
  }
}

/**
 * Navigate to the appropriate screen based on deep link data
 */
export function navigateToDeepLink(
  data: DeepLinkData,
  router: any,
  onRequireAuth?: () => void
): boolean {
  const { type, id, params } = data;
  
  switch (type) {
    case "invoice":
      if (id) {
        router.push(`/invoices/${id}`);
        return true;
      }
      return false;
      
    case "payment":
    case "receipt":
      if (id) {
        router.push(`/invoices/${id}`);
        return true;
      }
      return false;
      
    case "dashboard":
      router.push("/dashboard");
      return true;
      
    case "create-invoice":
      router.push("/create-invoice");
      return true;
      
    default:
      console.warn("Unknown deep link type:", type);
      return false;
  }
}

/**
 * Get the initial URL when the app starts
 */
export async function getInitialUrl(): Promise<string | null> {
  try {
    const url = await Linking.getInitialURL();
    return url;
  } catch (error) {
    console.error("Failed to get initial URL:", error);
    return null;
  }
}